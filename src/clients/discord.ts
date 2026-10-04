import { discordHttpError } from './discordHttpError.js';

export type PollVoters = { label: string; userNames: string[]; userIds: string[] };

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
    if (!messageResponse.ok) throw await discordHttpError('Discord schedule announcement', messageResponse);
    const message = (await messageResponse.json()) as { id?: unknown };
    if (typeof message.id !== 'string') throw new Error('Discord announcement did not contain a message ID');

    const threadResponse = await fetch(`https://discord.com/api/v10/channels/${this.noticeChannelId}/messages/${message.id}/threads`, {
      method: 'POST',
      headers: { Authorization: `Bot ${this.botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `次回録音の日程調整 ${dateRange}`, auto_archive_duration: 10_080 }),
    });
    if (!threadResponse.ok) throw await discordHttpError('Discord schedule thread creation', threadResponse);
    const thread = (await threadResponse.json()) as { id?: unknown };
    if (typeof thread.id !== 'string') throw new Error('Discord thread response did not contain a thread ID');
    return { threadId: thread.id };
  }

  async sendNotice(content: string, userIds: string[] = []): Promise<void> {
    const response = await fetch(`https://discord.com/api/v10/channels/${this.noticeChannelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${this.botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [], users: userIds } }),
    });
    if (!response.ok) throw await discordHttpError('Discord notice', response);
  }

  async createEditingReminderThread(episode: string, startDueWeek: string): Promise<{ threadId: string }> {
    const messageResponse = await fetch(`https://discord.com/api/v10/channels/${this.noticeChannelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${this.botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `編集リマインド: ${episode}\n開始予定週: ${startDueWeek}`, allowed_mentions: { parse: [] } }),
    });
    if (!messageResponse.ok) throw await discordHttpError('Discord editing reminder announcement', messageResponse);
    const message = (await messageResponse.json()) as { id?: unknown };
    if (typeof message.id !== 'string') throw new Error('Discord editing reminder announcement did not contain a message ID');
    const threadResponse = await fetch(`https://discord.com/api/v10/channels/${this.noticeChannelId}/messages/${message.id}/threads`, {
      method: 'POST',
      headers: { Authorization: `Bot ${this.botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `編集リマインド ${episode}`, auto_archive_duration: 10_080 }),
    });
    if (!threadResponse.ok) throw await discordHttpError('Discord editing reminder thread creation', threadResponse);
    const thread = (await threadResponse.json()) as { id?: unknown };
    if (typeof thread.id !== 'string') throw new Error('Discord editing reminder thread response did not contain a thread ID');
    return { threadId: thread.id };
  }

  async sendThreadMessage(threadId: string, content: string, userIds: string[] = []): Promise<void> {
    const response = await fetch(`https://discord.com/api/v10/channels/${threadId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${this.botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions: { parse: [], users: userIds } }),
    });
    if (!response.ok) throw await discordHttpError('Discord thread message', response);
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
    if (!response.ok) throw await discordHttpError('Discord message creation', response);
    const body = (await response.json()) as { id?: unknown };
    if (typeof body.id !== 'string') throw new Error('Discord response did not contain a message ID');
    return { messageId: body.id };
  }

  async getPollVoters(messageId: string, channelId = this.noticeChannelId): Promise<PollVoters[]> {
    const messageResponse = await this.getWithRateLimit(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`);
    if (!messageResponse.ok) throw await discordHttpError('Discord poll retrieval', messageResponse);
    const message = await messageResponse.json() as { poll?: { answers?: Array<{ answer_id?: unknown; poll_media?: { text?: unknown } }> } };
    const answers = message.poll?.answers;
    if (!answers) throw new Error('Discord message does not contain a poll');
    const voters: PollVoters[] = [];
    for (const answer of answers) {
      if (typeof answer.answer_id !== 'number' || typeof answer.poll_media?.text !== 'string') throw new Error('Discord poll answer is invalid');
      const users = await this.getAnswerVoterNames(messageId, answer.answer_id, channelId);
      voters.push({ label: answer.poll_media.text, userNames: users.map((user) => user.name), userIds: users.map((user) => user.id) });
    }
    return voters;
  }

  async getRoleMemberIds(guildId: string, roleId: string): Promise<string[]> {
    const memberIds: string[] = [];
    let after: string | undefined;
    do {
      const query = new URLSearchParams({ limit: '1000', ...(after ? { after } : {}) });
      const response = await this.getWithRateLimit(`https://discord.com/api/v10/guilds/${guildId}/members?${query}`);
      if (response.status === 403) throw new Error('Discord role members retrieval failed (403): enable Server Members Intent in Discord Developer Portal and verify guild access');
      if (!response.ok) throw await discordHttpError('Discord role members retrieval', response);
      const members = await response.json() as Array<{ user?: { id?: unknown }; roles?: unknown }>;
      const validMembers = members.flatMap((member) => {
        const id = member.user?.id;
        const roles = member.roles;
        return typeof id === 'string' && Array.isArray(roles) && roles.includes(roleId) ? [id] : [];
      });
      memberIds.push(...validMembers);
      after = members.at(-1)?.user?.id as string | undefined;
      if (members.length < 1000) break;
    } while (after);
    return memberIds;
  }

  private async getAnswerVoterNames(messageId: string, answerId: number, channelId: string): Promise<Array<{ id: string; name: string }>> {
    const usersWithNames: Array<{ id: string; name: string }> = [];
    let after: string | undefined;
    do {
      const query = new URLSearchParams({ limit: '100', ...(after ? { after } : {}) });
      const response = await this.getWithRateLimit(`https://discord.com/api/v10/channels/${channelId}/polls/${messageId}/answers/${answerId}?${query}`);
      if (!response.ok) throw await discordHttpError('Discord poll voters retrieval', response);
      const body = await response.json() as { users?: Array<{ id?: unknown; global_name?: unknown; username?: unknown }> };
      const users = (body.users ?? []).flatMap((user) => typeof user.id === 'string' ? [user] : []);
      usersWithNames.push(...users.map((user) => ({ id: user.id as string, name: (() => {
        if (typeof user.global_name === 'string' && user.global_name.trim()) return user.global_name;
        if (typeof user.username === 'string' && user.username.trim()) return user.username;
        return user.id as string;
      })() })));
      after = users.at(-1)?.id as string | undefined;
      if (users.length < 100) break;
    } while (after);
    return usersWithNames;
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
