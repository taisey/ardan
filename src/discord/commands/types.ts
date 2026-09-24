import type { DiscordApplicationCommandDefinition } from '../../clients/discordApplicationCommands.js';
import type { SchedulingService } from '../../services/scheduling/schedulingService.js';
import type { EditingScheduleService } from '../../services/editingSchedule/editingScheduleService.js';

export type DiscordCommandContext = {
  interactionToken: string;
  options: Record<string, string>;
  scheduling: SchedulingService;
  editingSchedule?: EditingScheduleService;
  followUp(content: string): Promise<void>;
};

export type DiscordCommand = {
  definition: DiscordApplicationCommandDefinition;
  execute(context: DiscordCommandContext): Promise<void>;
};
