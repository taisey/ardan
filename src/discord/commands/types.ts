import type { DiscordApplicationCommandDefinition } from '../../clients/discordApplicationCommands.js';
import type { SchedulingService } from '../../services/scheduling/schedulingService.js';
import type { EditingScheduleService } from '../../services/editingSchedule/editingScheduleService.js';
import type { RssService } from '../../services/rss/rssService.js';

export type DiscordCommandContext = {
  interactionToken: string;
  options: Record<string, string>;
  scheduling: SchedulingService;
  editingSchedule?: EditingScheduleService;
  rss?: RssService;
  followUp(content: string): Promise<void>;
};

export type DiscordCommand = {
  definition: DiscordApplicationCommandDefinition;
  execute(context: DiscordCommandContext): Promise<void>;
};
