export type DiscordApplicationCommandOption = {
  name: string;
  description: string;
  type: 3;
  required: boolean;
};

export type DiscordApplicationCommandDefinition = {
  name: string;
  description: string;
  type: 1;
  options?: DiscordApplicationCommandOption[];
};

export class DiscordApplicationCommandsClient {
  constructor(
    private readonly botToken: string,
    private readonly applicationId: string,
    private readonly guildId: string,
  ) {}

  async sync(commands: readonly DiscordApplicationCommandDefinition[]): Promise<void> {
    const response = await fetch(
      `https://discord.com/api/v10/applications/${this.applicationId}/guilds/${this.guildId}/commands`,
      {
        method: 'PUT',
        headers: { Authorization: `Bot ${this.botToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands),
      },
    );
    if (!response.ok) throw new Error(`Discord Guild command sync failed (${response.status})`);
  }
}
