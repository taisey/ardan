import { DiscordGateway } from '../clients/discordGateway.js';
import { nextMidnightInTimeZone } from './scheduleTime.js';
import { DiscordClient } from '../clients/discord.js';
import { GoogleSheetsClient } from '../clients/googleSheets.js';
import { loadAppConfig, loadOptionalEditingScheduleConfig, loadOptionalRssConfig } from '../config/env.js';
import { createRssService } from '../services/rss/createRssService.js';
import { nextRssPollAt } from './rssSchedule.js';
import { DiscordGatewayInteractionHandler } from '../handlers/discordGatewayInteractionHandler.js';
import { GoogleSheetsRecordingScheduleRepository } from '../repositories/recordingSchedule/googleSheetsRecordingScheduleRepository.js';
import { DiscordSchedulingService, todayInTimeZone } from '../services/scheduling/discordSchedulingService.js';
import { GoogleDriveClient } from '../clients/googleDrive.js';
import { GoogleSheetsEditingScheduleRepository } from '../repositories/editingSchedule/googleSheetsEditingScheduleRepository.js';
import { EditingScheduleService } from '../services/editingSchedule/editingScheduleService.js';

const config = loadAppConfig();
const editingConfig = loadOptionalEditingScheduleConfig();
const rssConfig = loadOptionalRssConfig();
const rss = rssConfig ? createRssService(rssConfig) : undefined;
const scheduling = new DiscordSchedulingService(
  new DiscordClient(config.discord.botToken, config.discord.noticeChannelId, config.discord.mentionRoleId),
  new GoogleSheetsRecordingScheduleRepository(new GoogleSheetsClient(config.google.serviceAccount, config.google.spreadsheetId), config.google.sheetGid),
  () => todayInTimeZone(config.timezone),
  config.discord.guildId,
  config.discord.mentionRoleId,
);
const editingSchedule = editingConfig ? new EditingScheduleService(
  new GoogleDriveClient(editingConfig.google.serviceAccount),
  new GoogleSheetsEditingScheduleRepository(
    new GoogleSheetsClient(editingConfig.google.serviceAccount, editingConfig.google.spreadsheetId),
    editingConfig.google.editingScheduleSheetGid,
    editingConfig.google.editingScheduleAssignOrderSheetGid,
    editingConfig.google.usersSheetGid,
  ),
  new DiscordClient(editingConfig.discord.botToken, editingConfig.discord.noticeChannelId, editingConfig.discord.mentionRoleId),
  editingConfig.google.editingSourceFolderId,
  () => todayInTimeZone(editingConfig.timezone),
) : undefined;
const interactions = new DiscordGatewayInteractionHandler(config.discord.applicationId, scheduling, editingSchedule);
const gateway = new DiscordGateway(config.discord.botToken, async (dispatch) => {
  if (dispatch.type === 'INTERACTION_CREATE') await interactions.handle(dispatch.data as Parameters<typeof interactions.handle>[0]);
});

let pollCreationRunning = false;
let scheduledPoll: ReturnType<typeof setTimeout> | undefined;
let unansweredPollReminderRunning = false;
let scheduledUnansweredPollReminder: ReturnType<typeof setTimeout> | undefined;
let editingReminderRunning = false;
let scheduledEditingReminder: ReturnType<typeof setTimeout> | undefined;
let scheduledRssPoll: ReturnType<typeof setTimeout> | undefined;
let stopping = false;

async function createScheduledPoll(): Promise<void> {
  if (pollCreationRunning) return;
  pollCreationRunning = true;
  try {
    const result = await scheduling.createRecordingDatePoll();
    console.log(`Scheduled recording-date poll: ${result.created ? 'created' : 'skipped'}`);
  } catch (error) {
    console.error('Scheduled recording-date poll failed', error);
  } finally {
    pollCreationRunning = false;
  }
}

async function remindScheduledUnansweredPollVoters(): Promise<void> {
  if (unansweredPollReminderRunning) return;
  unansweredPollReminderRunning = true;
  try {
    const reminded = await scheduling.remindUnansweredRecordingPollVoters();
    console.log(`Scheduled unanswered recording-poll reminder: ${reminded.length} reminded`);
  } catch (error) {
    console.error('Scheduled unanswered recording-poll reminder failed', error);
  } finally {
    unansweredPollReminderRunning = false;
  }
}

async function remindScheduledEditors(): Promise<void> {
  if (!editingSchedule || editingReminderRunning) return;
  editingReminderRunning = true;
  try {
    const reminded = await editingSchedule.remindDueEditors();
    console.log(`Scheduled editing reminder: ${reminded.length} due`);
  } catch (error) {
    console.error('Scheduled editing reminder failed', error);
  } finally {
    editingReminderRunning = false;
  }
}

gateway.start();
console.log('Discord Gateway client started');
scheduleNextPoll();
scheduleNextUnansweredPollReminder();
scheduleNextEditingReminder();
scheduleNextRssPoll();

function scheduleNextRssPoll(): void {
  if (!rss || stopping) return;
  const now = Date.now();
  const next = nextRssPollAt(now);
  scheduledRssPoll = setTimeout(async () => {
    try {
      const posted = await rss.poll();
      console.log(`Scheduled RSS poll: ${posted} posted`);
    } catch (error) {
      console.error('Scheduled RSS poll failed', error);
    } finally {
      scheduleNextRssPoll();
    }
  }, next - now);
}

function scheduleNextPoll(): void {
  const now = new Date();
  const nextHour = new Date(now);
  nextHour.setMinutes(0, 0, 0);
  nextHour.setHours(nextHour.getHours() + 1);

  scheduledPoll = setTimeout(async () => {
    await createScheduledPoll();
    scheduleNextPoll();
  }, nextHour.getTime() - now.getTime());
  console.log(`Next scheduled recording-date poll: ${formatInTimeZone(nextHour, config.timezone)}`);
}

function scheduleNextUnansweredPollReminder(): void {
  const now = new Date();
  const nextMidnight = nextMidnightInTimeZone(now, config.timezone);

  scheduledUnansweredPollReminder = setTimeout(async () => {
    await remindScheduledUnansweredPollVoters();
    scheduleNextUnansweredPollReminder();
  }, nextMidnight.getTime() - now.getTime());
  console.log(`Next scheduled unanswered recording-poll reminder: ${formatInTimeZone(nextMidnight, config.timezone)}`);
}

function scheduleNextEditingReminder(): void {
  if (!editingSchedule || !editingConfig) return;
  const now = new Date();
  const nextMidnight = nextMidnightInTimeZone(now, editingConfig.timezone);
  scheduledEditingReminder = setTimeout(async () => {
    await remindScheduledEditors();
    scheduleNextEditingReminder();
  }, Math.max(1_000, nextMidnight.getTime() - now.getTime()));
  console.log(`Next scheduled editing reminder: ${formatInTimeZone(nextMidnight, editingConfig.timezone)}`);
}

function formatInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): string => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')} (${timeZone})`;
}

function shutdown(): void {
  stopping = true;
  if (scheduledRssPoll) clearTimeout(scheduledRssPoll);
  if (scheduledPoll) clearTimeout(scheduledPoll);
  if (scheduledUnansweredPollReminder) clearTimeout(scheduledUnansweredPollReminder);
  if (scheduledEditingReminder) clearTimeout(scheduledEditingReminder);
  gateway.stop();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
