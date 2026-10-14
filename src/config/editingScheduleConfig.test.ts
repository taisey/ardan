import { describe, expect, it } from 'vitest';
import { loadEditingScheduleConfig } from './env.js';

const env = {
  DISCORD_BOT_TOKEN: 'token',
  DISCORD_GUILD_ID: 'guild',
  DISCORD_NOTICE_CHANNEL_ID: 'notice',
  DISCORD_MENTION_ROLE_ID: 'role',
  GOOGLE_SPREADSHEET_ID: 'sheet',
  GOOGLE_RECORDING_SCHEDULE_SHEET_GID: '1',
  GOOGLE_SERVICE_ACCOUNT_JSON: '{}',
  GOOGLE_EDITING_SCHEDULE_SHEET_GID: '2',
  GOOGLE_EDITING_SCHEDULE_ASSIGN_ORDER_SHEET_GID: '3',
  GOOGLE_USERS_SHEET_GID: '4',
  GOOGLE_EDITING_SOURCE_FOLDER_ID: 'folder',
};

describe('editing reminder configuration', () => {
  it('defaults to seven days and accepts zero', () => {
    expect(loadEditingScheduleConfig(env).reminderDaysBeforeDue).toBe(7);
    expect(loadEditingScheduleConfig({ ...env, EDITING_REMINDER_DAYS_BEFORE_DUE: '0' }).reminderDaysBeforeDue).toBe(0);
  });

  it.each(['-1', '1.5', '1e2', '9007199254740992'])('rejects invalid reminder days: %s', (value) => {
    expect(() => loadEditingScheduleConfig({ ...env, EDITING_REMINDER_DAYS_BEFORE_DUE: value }))
      .toThrow('EDITING_REMINDER_DAYS_BEFORE_DUE must be a non-negative integer');
  });
});
