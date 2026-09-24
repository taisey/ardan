import { DiscordClient } from '../clients/discord.js';
import { GoogleDriveClient } from '../clients/googleDrive.js';
import { GoogleSheetsClient } from '../clients/googleSheets.js';
import { loadEditingScheduleConfig } from '../config/env.js';
import { GoogleSheetsEditingScheduleRepository } from '../repositories/editingSchedule/googleSheetsEditingScheduleRepository.js';
import { EditingScheduleService } from '../services/editingSchedule/editingScheduleService.js';
import { todayInTimeZone } from '../services/scheduling/discordSchedulingService.js';

async function main(): Promise<void> {
  const config = loadEditingScheduleConfig();
  const sheets = new GoogleSheetsClient(config.google.serviceAccount, config.google.spreadsheetId);
  const service = new EditingScheduleService(
    new GoogleDriveClient(config.google.serviceAccount),
    new GoogleSheetsEditingScheduleRepository(sheets, config.google.editingScheduleSheetGid, config.google.editingScheduleAssignOrderSheetGid, config.google.usersSheetGid),
    new DiscordClient(config.discord.botToken, config.discord.noticeChannelId, config.discord.mentionRoleId),
    config.google.editingSourceFolderId,
    () => todayInTimeZone(config.timezone),
  );
  const created = await service.syncFromDrive();
  console.log(JSON.stringify({ created }));
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : 'Editing schedule batch failed'); process.exitCode = 1; });
