import { aggregatePollResultCommand } from './aggregatePollResult.js';
import { createRecordingDatePollCommand } from './createRecordingDatePoll.js';
import { fixRecordingDateCommand } from './fixRecordingDate.js';
import { notifyEditingPublishedCommand } from './notifyEditingPublished.js';
import { syncEditingScheduleCommand } from './syncEditingSchedule.js';
import { remindEditingScheduleCommand } from './remindEditingSchedule.js';

export const discordCommands = [
  createRecordingDatePollCommand,
  aggregatePollResultCommand,
  fixRecordingDateCommand,
  notifyEditingPublishedCommand,
  syncEditingScheduleCommand,
  remindEditingScheduleCommand,
];
export const discordCommandDefinitions = discordCommands.map((command) => command.definition);

export function findDiscordCommand(name: string) {
  return discordCommands.find((command) => command.definition.name === name);
}
