import type { DiscordCommand } from './types.js';

export const skipRecordingCoordinationCommand: DiscordCommand = {
  definition: {
    name: 'skip_recording_coordination',
    description: '進行中の録音日程調整を見送ります',
    type: 1,
  },
  async execute({ scheduling, followUp }): Promise<void> {
    try {
      await scheduling.skipRecordingCoordination();
      await followUp('進行中の録音日程調整を見送りました。');
    } catch (error) {
      console.error('Skipping recording coordination failed', error);
      await followUp('録音日程調整を見送れませんでした。進行中の日程を確認してください。');
    }
  },
};
