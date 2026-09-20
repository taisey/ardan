import { describe, expect, it, vi } from 'vitest';
import { aggregatePollResultCommand } from './aggregatePollResult.js';

describe('aggregatePollResultCommand', () => {
  it('formats dates with weekdays and voter display names without mentions', async () => {
    const followUp = vi.fn().mockResolvedValue(undefined);
    await aggregatePollResultCommand.execute({
      interactionToken: 'token',
      options: {},
      scheduling: {
        aggregatePollResults: vi.fn().mockResolvedValue([
          { date: '2026-09-21', available: ['Alice', 'Bob', 'Carol'], tentative: [], unavailable: [] },
          { date: '2026-09-22', available: ['Alice', 'Bob', 'Dave'], tentative: [], unavailable: [] },
          { date: '2026-09-23', available: ['Alice', 'Carol'], tentative: [], unavailable: [] },
          { date: '2026-09-24', available: ['Alice', 'Bob', 'Carol', 'Dave'], tentative: [], unavailable: ['Eve'] },
        ]),
      } as never,
      followUp,
    });

    const content = followUp.mock.calls[0][0];
    expect(content).toMatch(/\*\*候補日\*\*\n```text\n2026\/09\/21（月）  ○ 3  △ 0  × 0\n2026\/09\/22（火）  ○ 3  △ 0  × 0\n```$/);
    expect(content).toContain('**2026/09/21（月）**\n```text\n○  3  Alice, Bob, Carol');
    expect(content).not.toContain('<@');
  });
});
