import { describe, expect, it, vi } from 'vitest';
import { skipRecordingCoordinationCommand } from './skipRecordingCoordination.js';
import { findDiscordCommand } from './index.js';

describe('skipRecordingCoordinationCommand', () => {
  it('is registered and skips the active schedule', async () => {
    expect(findDiscordCommand('skip_recording_coordination')).toBe(skipRecordingCoordinationCommand);
    const skip = vi.fn().mockResolvedValue(undefined);
    const followUp = vi.fn();

    await skipRecordingCoordinationCommand.execute({
      interactionToken: 'token', options: {},
      scheduling: { skipRecordingCoordination: skip } as never, followUp,
    });

    expect(skip).toHaveBeenCalledOnce();
    expect(followUp).toHaveBeenCalledWith('進行中の録音日程調整を見送りました。');
  });
});
