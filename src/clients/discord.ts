export type PollVoters = { label: string; userNames: string[] };

export class DiscordClient {
  constructor(
    private readonly botToken: string,
    private readonly noticeChannelId: string,
    private readonly mentionRoleId: string,
  ) {}

  async createAvailabilityThread(startDate: string, endDate: string): Promise<{ threadId: string }> {
    const dateRange = `${this.formatDateWithoutWeekday(startDate)} - ${this.formatDateWithoutWeekday(endDate)}`;
    const messageResponse = await fetch(`https://discord.com/api/v10/channels/${this.noticeChannelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${this.botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `<@&${this.mentionRoleId}>\n次回録音の日程調整\n${dateRange}`,
        allowed_mentions: { parse: [], roles: [this.mentionRoleId] },
      }),
    });
    if (!messageResponse.ok) throw new Error(`Discord schedule announcement failed (${messageResponse.status})`);
    const message = (await messageResponse.json()) as { id?: unknown };
    if (typeof message.id !== 'string') throw new Error('Discord announcement did not contain a message ID');

    const threadResponse = await fetch(`https://discord.com/api/v10/channels/${this.noticeChannelId}/messages/${message.id}/threads`, {
      method: 'POST',
      headers: { Authorization: `Bot ${this.botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `次回録音の日程調整 ${dateRange}`, auto_archive_duration: 10_080 }),
    });
    if (!threadResponse.ok) throw new Error(`Discord schedule thread creation failed (${threadResponse.status})`);
    const thread = (await threadResponse.json()) as { id?: unknown };
    if (typeof thread.id !== 'string') throw new Error('Discord thread response did not contain a thread ID');
    return { threadId: thread.id };
  }

  async createAvailabilityPoll(date: string, channelId: string): Promise<{ messageId: string }> {
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${this.botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        poll: {
          question: { text: `次回録音の日程調整: ${this.formatDate(date)}` },
          answers: ['○ 参加可能', '△ 調整可', '× 不可'].map((text) => ({ poll_media: { text } })),
          duration: 168,
          allow_multiselect: false,
        },
      }),
    });
    if (!response.ok) throw new Error(`Discord message creation failed (${response.status})`);
    const body = (await response.json()) as { id?: unknown };
    if (typeof body.id !== 'string') throw new Error('Discord response did not contain a message ID');
    return { messageId: body.id };
  }

  async getPollVoters(messageId: string, channelId = this.noticeChannelId): Promise<PollVoters[]> {
    const messageResponse = await this.getWithRateLimit(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`);
    if (!messageResponse.ok) throw new Error(`Discord poll retrieval failed (${messageResponse.status})`);
    const message = await messageResponse.json() as { poll?: { answers?: Array<{ answer_id?: unknown; poll_media?: { text?: unknown } }> } };
    const answers = message.poll?.answers;
    if (!answers) throw new Error('Discord message does not contain a poll');
    const voters: PollVoters[] = [];
    for (const answer of answers) {
      if (typeof answer.answer_id !== 'number' || typeof answer.poll_media?.text !== 'string') throw new Error('Discord poll answer is invalid');
      voters.push({ label: answer.poll_media.text, userNames: await this.getAnswerVoterNames(messageId, answer.answer_id, channelId) });
    }
    return voters;
  }

  private async getAnswerVoterNames(messageId: string, answerId: number, channelId: string): Promise<string[]> {
    const userNames: string[] = [];
    let after: string | undefined;
    do {
      const query = new URLSearchParams({ limit: '100', ...(after ? { after } : {}) });
      const response = await this.getWithRateLimit(`https://discord.com/api/v10/channels/${channelId}/polls/${messageId}/answers/${answerId}?${query}`);
      if (!response.ok) throw new Error(`Discord poll voters retrieval failed (${response.status})`);
      const body = await response.json() as { users?: Array<{ id?: unknown; global_name?: unknown; username?: unknown }> };
      const users = (body.users ?? []).flatMap((user) => typeof user.id === 'string' ? [user] : []);
      userNames.push(...users.map((user) => {
        if (typeof user.global_name === 'string' && user.global_name.trim()) return user.global_name;
        if (typeof user.username === 'string' && user.username.trim()) return user.username;
        return user.id as string;
      }));
      after = users.at(-1)?.id as string | undefined;
      if (users.length < 100) break;
    } while (after);
    return userNames;
  }

  private formatDate(date: string): string {
    const weekday = new Intl.DateTimeFormat('ja-JP', { timeZone: 'UTC', weekday: 'short' })
      .format(new Date(`${date.replaceAll('/', '-')}T00:00:00.000Z`));
    return `${date}（${weekday}）`;
  }

  private formatDateWithoutWeekday(date: string): string {
    return date;
  }

  private async getWithRateLimit(url: string): Promise<Response> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(url, { headers: { Authorization: `Bot ${this.botToken}` } });
      if (response.status !== 429 || attempt === 3) return response;
      const body = await response.json().catch(() => null) as { retry_after?: unknown } | null;
      const retryAfter = typeof body?.retry_after === 'number' ? body.retry_after : 1;
      await new Promise<void>((resolve) => setTimeout(resolve, Math.max(100, Math.ceil(retryAfter * 1_000))));
    }
    throw new Error('Discord rate-limit retry loop ended unexpectedly');
  }

}
