import { aggregatePollResultCommand } from './aggregatePollResult.js';
import { createRecordingDatePollCommand } from './createRecordingDatePoll.js';
import { fixRecordingDateCommand } from './fixRecordingDate.js';

export const discordCommands = [createRecordingDatePollCommand, aggregatePollResultCommand, fixRecordingDateCommand];
export const discordCommandDefinitions = discordCommands.map((command) => command.definition);

export function findDiscordCommand(name: string) {
  return discordCommands.find((command) => command.definition.name === name);
}
