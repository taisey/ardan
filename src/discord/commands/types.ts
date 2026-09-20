import type { DiscordApplicationCommandDefinition } from '../../clients/discordApplicationCommands.js';
import type { SchedulingService } from '../../services/scheduling/schedulingService.js';

export type DiscordCommandContext = {
  interactionToken: string;
  options: Record<string, string>;
  scheduling: SchedulingService;
  followUp(content: string): Promise<void>;
};

export type DiscordCommand = {
  definition: DiscordApplicationCommandDefinition;
  execute(context: DiscordCommandContext): Promise<void>;
};
