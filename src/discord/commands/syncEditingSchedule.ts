import type { DiscordCommand } from './types.js';

export const syncEditingScheduleCommand: DiscordCommand = {
  definition: {
    name: 'sync_editing_schedule',
    description: '編集スケジュールをDriveから更新します',
    type: 1,
  },
  async execute({ editingSchedule, followUp }): Promise<void> {
    if (!editingSchedule) {
      await followUp('編集スケジュールが設定されていません。');
      return;
    }
    try {
      const created = await editingSchedule.syncFromDrive();
      await followUp(`編集スケジュールを更新しました。追加: ${created.length}件。`);
    } catch (error) {
      console.error('Editing schedule sync failed', error);
      await followUp('編集スケジュールの更新に失敗しました。設定とシートを確認してください。');
    }
  },
};
