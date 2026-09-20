export class DiscordClient {
  constructor(
    private readonly botToken: string,
    private readonly noticeChannelId: string,
  ) {}

  async createRecordingDatePoll(title: string, candidateDates: string[]): Promise<{ messageId: string }> {
    const response = await fetch(`https://discord.com/api/v10/channels/${this.noticeChannelId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bot ${this.botToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        poll: {
          question: { text: title },
          answers: candidateDates.map((date) => ({ poll_media: { text: date } })),
          // Discord requires a duration. The initial integration uses the API minimum;
          // the business deadline is intentionally not inferred here.
          duration: 1,
          allow_multiselect: false,
        },
      }),
    });
    if (!response.ok) throw new Error(`Discord message creation failed (${response.status})`);
    const body = (await response.json()) as { id?: unknown };
    if (typeof body.id !== 'string') throw new Error('Discord response did not contain a message ID');
    return { messageId: body.id };
  }

}
