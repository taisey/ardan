import { findDiscordCommand } from '../discord/commands/index.js';
import type { SchedulingService } from '../services/scheduling/schedulingService.js';

type DiscordInteractionOption = { name?: unknown; value?: unknown };

type DiscordInteraction = {
  type: number;
  id: string;
  token: string;
  data?: { name?: string; options?: DiscordInteractionOption[] };
};

type InteractionResponse = { type: number; data?: Record<string, unknown> };

export class DiscordGatewayInteractionHandler {
  constructor(
    private readonly applicationId: string,
    private readonly scheduling: SchedulingService,
  ) {}

  async handle(interaction: DiscordInteraction): Promise<void> {
    if (interaction.type !== 2 || !interaction.data?.name) {
      await this.respond(interaction, { type: 4, data: { content: 'Unsupported interaction.', flags: 64 } });
      return;
    }
    const command = findDiscordCommand(interaction.data.name);
    if (!command) {
      await this.respond(interaction, { type: 4, data: { content: 'Unknown command.', flags: 64 } });
      return;
    }

    await this.respond(interaction, { type: 5 });
    void command.execute({
      interactionToken: interaction.token,
      options: this.optionsFor(interaction.data.options),
      scheduling: this.scheduling,
      followUp: (content) => this.followUp(interaction.token, content),
    });
  }

  private optionsFor(options: DiscordInteractionOption[] | undefined): Record<string, string> {
    return Object.fromEntries((options ?? []).flatMap((option) =>
      typeof option.name === 'string' && typeof option.value === 'string' ? [[option.name, option.value]] : [],
    ));
  }

  private async respond(interaction: DiscordInteraction, response: InteractionResponse): Promise<void> {
    const result = await fetch(`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(response),
    });
    if (!result.ok) throw new Error(`Discord interaction callback failed (${result.status})`);
  }

  private async followUp(interactionToken: string, content: string): Promise<void> {
    const result = await fetch(`https://discord.com/api/v10/webhooks/${this.applicationId}/${interactionToken}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }),
    });
    if (!result.ok) console.error(`Discord follow-up failed (${result.status})`);
  }
}
