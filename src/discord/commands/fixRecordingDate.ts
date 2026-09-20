import type { DiscordCommand } from './types.js';

export const fixRecordingDateCommand: DiscordCommand = {
  definition: {
    name: 'fix_recording_date',
    description: '録音日を確定します',
    type: 1,
    options: [{
      name: 'date',
      description: '確定する日付（YYYY/MM/DD）',
      type: 3,
      required: true,
    }],
  },
  async execute({ options, scheduling, followUp }): Promise<void> {
    const date = options.date;
    if (!date || !/^\d{4}\/\d{2}\/\d{2}$/.test(date)) {
      await followUp('`date` には YYYY/MM/DD 形式の日付を指定してください。');
      return;
    }
    try {
      await scheduling.completeRecordingDate(date);
      await followUp(`${date} を録音日に確定しました。`);
    } catch (error) {
      console.error('Discord recording-date completion failed', error);
      await followUp('日程を確定できませんでした。進行中の日程の候補日を指定してください。');
    }
  },
};
