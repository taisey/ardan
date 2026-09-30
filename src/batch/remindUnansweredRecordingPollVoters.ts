import { DiscordClient } from '../clients/discord.js';
import { GoogleSheetsClient } from '../clients/googleSheets.js';
import { loadSchedulingConfig } from '../config/env.js';
import { GoogleSheetsRecordingScheduleRepository } from '../repositories/recordingSchedule/googleSheetsRecordingScheduleRepository.js';
import { DiscordSchedulingService, todayInTimeZone } from '../services/scheduling/discordSchedulingService.js';

async function main(): Promise<void> {
  const config = loadSchedulingConfig();
  const sheets = new GoogleSheetsClient(config.google.serviceAccount, config.google.spreadsheetId);
  const service = new DiscordSchedulingService(
    new DiscordClient(config.discord.botToken, config.discord.noticeChannelId, config.discord.mentionRoleId),
    new GoogleSheetsRecordingScheduleRepository(sheets, config.google.sheetGid),
    () => todayInTimeZone(config.timezone),
    config.discord.guildId,
    config.discord.mentionRoleId,
  );
  const unanswered = await service.remindUnansweredRecordingPollVoters();
  console.log(JSON.stringify({ reminded: unanswered }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Unanswered poll reminder batch failed');
  process.exitCode = 1;
});
