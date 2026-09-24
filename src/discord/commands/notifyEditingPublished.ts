import type { DiscordCommand } from './types.js';

export const notifyEditingPublishedCommand: DiscordCommand = {
  definition: {
    name: 'notify_editing_published',
    description: '編集済みの公開を通知します',
    type: 1,
    options: [{ name: 'episode', description: '公開した番号（#123）', type: 3, required: true }],
  },
  async execute({ options, editingSchedule, followUp }): Promise<void> {
    if (!editingSchedule) {
      await followUp('編集スケジュールが設定されていません。');
      return;
    }
    try {
      await editingSchedule.notifyPublished(options.episode ?? '');
      await followUp(`${options.episode} の公開を通知しました。`);
    } catch (error) {
      console.error('Editing publication notification failed', error);
      await followUp('公開通知に失敗しました。番号と編集スケジュールを確認してください。');
    }
  },
};
