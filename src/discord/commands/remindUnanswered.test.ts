import { describe, expect, it, vi } from 'vitest';
import { remindUnansweredCommand } from './remindUnanswered.js';
import { findDiscordCommand } from './index.js';

describe('remindUnansweredCommand', () => {
  it('is registered for manual execution', () => {
    expect(findDiscordCommand('remind_unanswered')).toBe(remindUnansweredCommand);
  });
  it.each([['123', '456'], []])('reports the service result %j', async (...ids: string[]) => {
    const remind = vi.fn().mockResolvedValue(ids);
    const followUp = vi.fn();
    await remindUnansweredCommand.execute({ interactionToken: 'token', options: {},
      scheduling: { remindUnansweredRecordingPollVoters: remind } as never, followUp });
    expect(remind).toHaveBeenCalledOnce();
    expect(followUp).toHaveBeenCalledWith(ids.length
      ? `未回答リマインドを日程調整スレッドに送信しました。対象: ${ids.length}人。`
      : '通知対象はありません（投票中の日程なし、または全員回答済み）。');
  });
  it('reports a failure rather than success', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const followUp = vi.fn();
      await remindUnansweredCommand.execute({ interactionToken: 'token', options: {},
        scheduling: { remindUnansweredRecordingPollVoters: vi.fn().mockRejectedValue(new Error('403')) } as never, followUp });
      expect(followUp).toHaveBeenCalledWith(expect.stringContaining('失敗'));
    } finally { log.mockRestore(); }
  });
});

