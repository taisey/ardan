import type { DiscordCommand } from './types.js';

export const remindEditingScheduleCommand: DiscordCommand = {
  definition: {
    name: 'remind_editing_schedule',
    description: '期限中の編集をリマインドします',
    type: 1,
  },
  async execute({ editingSchedule, followUp }): Promise<void> {
    if (!editingSchedule) {
      await followUp('編集スケジュールが設定されていません。');
      return;
    }
    try {
      const reminded = await editingSchedule.remindDueEditors();
      await followUp(`編集リマインドを実行しました。対象: ${reminded.length}件。`);
    } catch (error) {
      console.error('Editing schedule reminder failed', error);
      await followUp('編集リマインドに失敗しました。設定とシートを確認してください。');
    }
  },
};
