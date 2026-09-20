import { DiscordClient } from '../clients/discord.js';
import { GoogleSheetsClient } from '../clients/googleSheets.js';
import { loadSchedulingConfig } from '../config/env.js';
import { GoogleSheetsRecordingScheduleRepository } from '../repositories/recordingSchedule/googleSheetsRecordingScheduleRepository.js';
import { DiscordSchedulingService, todayInTimeZone } from '../services/scheduling/discordSchedulingService.js';

function value(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const result = index >= 0 ? process.argv[index + 1] : undefined;
  if (!result || result.startsWith('--')) throw new Error(`Missing --${name}`);
  return result;
}

async function main(): Promise<void> {
  const config = loadSchedulingConfig();
  const sheets = new GoogleSheetsClient(config.google.serviceAccount, config.google.spreadsheetId);
  const service = new DiscordSchedulingService(
    new DiscordClient(config.discord.botToken, config.discord.noticeChannelId),
    new GoogleSheetsRecordingScheduleRepository(sheets),
    () => todayInTimeZone(config.timezone),
  );
  const result = await service.createRecordingDatePoll({
    title: value('title'),
    candidateDates: value('candidate-dates').split(',').map((date) => date.trim()).filter(Boolean),
  });
  console.log(JSON.stringify(result));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Batch failed'); process.exitCode = 1; });
