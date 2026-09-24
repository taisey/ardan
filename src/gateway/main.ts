import { DiscordGateway } from '../clients/discordGateway.js';
import { DiscordClient } from '../clients/discord.js';
import { GoogleSheetsClient } from '../clients/googleSheets.js';
import { loadAppConfig, loadOptionalEditingScheduleConfig } from '../config/env.js';
import { DiscordGatewayInteractionHandler } from '../handlers/discordGatewayInteractionHandler.js';
import { GoogleSheetsRecordingScheduleRepository } from '../repositories/recordingSchedule/googleSheetsRecordingScheduleRepository.js';
import { DiscordSchedulingService, todayInTimeZone } from '../services/scheduling/discordSchedulingService.js';
import { GoogleDriveClient } from '../clients/googleDrive.js';
import { GoogleSheetsEditingScheduleRepository } from '../repositories/editingSchedule/googleSheetsEditingScheduleRepository.js';
import { EditingScheduleService } from '../services/editingSchedule/editingScheduleService.js';

const config = loadAppConfig();
const editingConfig = loadOptionalEditingScheduleConfig();
const scheduling = new DiscordSchedulingService(
  new DiscordClient(config.discord.botToken, config.discord.noticeChannelId, config.discord.mentionRoleId),
  new GoogleSheetsRecordingScheduleRepository(new GoogleSheetsClient(config.google.serviceAccount, config.google.spreadsheetId), config.google.sheetGid),
  () => todayInTimeZone(config.timezone),
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

gateway.start();
console.log('Discord Gateway client started');
scheduleNextPoll();

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
  if (scheduledPoll) clearTimeout(scheduledPoll);
  gateway.stop();
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
