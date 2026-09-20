import { describe, expect, it, vi } from 'vitest';
import { candidateDatesFor, DiscordSchedulingService } from './discordSchedulingService.js';

describe('DiscordSchedulingService', () => {
  it('skips a poll while the latest schedule is in progress', async () => {
    const discord = { createAvailabilityPoll: vi.fn() };
    const schedules = { findLatestNonExpired: vi.fn().mockResolvedValue({ status: 'in_progress' }), findLatestInProgress: vi.fn(), markInProgress: vi.fn(), saveMetadata: vi.fn(), complete: vi.fn() };
    const service = new DiscordSchedulingService(discord as never, schedules, () => '2026/10/01');
    await expect(service.createRecordingDatePoll())
      .resolves.toEqual({ created: false });
    expect(discord.createAvailabilityPoll).not.toHaveBeenCalled();
  });

  it('skips a poll while the latest schedule is done', async () => {
    const discord = { createAvailabilityPoll: vi.fn() };
    const schedules = { findLatestNonExpired: vi.fn().mockResolvedValue({ status: 'done', fixedDate: '2026/10/08' }), findLatestInProgress: vi.fn(), markInProgress: vi.fn(), saveMetadata: vi.fn(), complete: vi.fn() };
    const service = new DiscordSchedulingService(discord as never, schedules, () => '2026/10/01');
    await expect(service.createRecordingDatePoll())
      .resolves.toEqual({ created: false });
    expect(discord.createAvailabilityPoll).not.toHaveBeenCalled();
  });

  it('marks the latest unstarted schedule in progress before posting to Discord', async () => {
    const discord = {
      createAvailabilityThread: vi.fn().mockResolvedValue({ threadId: 'thread1' }),
      createAvailabilityPoll: vi.fn().mockResolvedValueOnce({ messageId: 'm1' }).mockResolvedValueOnce({ messageId: 'm2' }).mockResolvedValueOnce({ messageId: 'm3' }),
    };
    const schedule = { startDate: '2026/10/01', endDate: '2026/10/03' };
    const schedules = { findLatestNonExpired: vi.fn().mockResolvedValue(schedule), findLatestInProgress: vi.fn(), markInProgress: vi.fn(), saveMetadata: vi.fn(), complete: vi.fn() };
    const service = new DiscordSchedulingService(discord as never, schedules, () => '2026/10/01');
    await expect(service.createRecordingDatePoll())
      .resolves.toEqual({ created: true });
    expect(schedules.findLatestNonExpired).toHaveBeenCalledWith('2026/10/01');
    expect(schedules.markInProgress).toHaveBeenCalledWith(schedule);
    expect(discord.createAvailabilityThread).toHaveBeenCalledWith('2026/10/01', '2026/10/03');
    expect(discord.createAvailabilityPoll).toHaveBeenNthCalledWith(1, '2026/10/01', 'thread1');
    expect(discord.createAvailabilityPoll).toHaveBeenNthCalledWith(2, '2026/10/02', 'thread1');
    expect(discord.createAvailabilityPoll).toHaveBeenNthCalledWith(3, '2026/10/03', 'thread1');
    expect(schedules.saveMetadata).toHaveBeenLastCalledWith(schedule, {
      discord: {
        availabilityThreadId: 'thread1',
        availabilityPolls: [
          { date: '2026/10/01', messageId: 'm1', channelId: 'thread1' },
          { date: '2026/10/02', messageId: 'm2', channelId: 'thread1' },
          { date: '2026/10/03', messageId: 'm3', channelId: 'thread1' },
        ],
      },
    });
  });

  it('builds inclusive candidate dates from the recording range', () => {
    expect(candidateDatesFor('2026/02/27', '2026/03/02')).toEqual(['2026/02/27', '2026/02/28', '2026/03/01', '2026/03/02']);
  });

  it('supports a range longer than ten days by creating separate polls', () => {
    expect(candidateDatesFor('2026/10/01', '2026/10/11')).toHaveLength(11);
  });

  it('aggregates voters from the poll IDs in generic metadata', async () => {
    const discord = { getPollVoters: vi.fn().mockResolvedValue([
      { label: '○ 参加可能', userNames: ['Alice'] }, { label: '△ 調整可', userNames: ['Bob'] }, { label: '× 不可', userNames: [] },
    ]) };
    const schedules = { findLatestInProgress: vi.fn().mockResolvedValue({
      startDate: '2026/10/01', endDate: '2026/10/03', status: 'in_progress',
      metadata: { discord: { availabilityThreadId: 'thread1', availabilityPolls: [{ date: '2026/10/01', messageId: 'm1', channelId: 'thread1' }] } },
    }) };
    const service = new DiscordSchedulingService(discord as never, schedules as never, () => '2026/10/01');
    await expect(service.aggregatePollResults()).resolves.toEqual([
      { date: '2026/10/01', available: ['Alice'], tentative: ['Bob'], unavailable: [] },
    ]);
    expect(discord.getPollVoters).toHaveBeenCalledWith('m1', 'thread1');
  });

  it('completes the latest in-progress schedule with the selected date', async () => {
    const schedules = { complete: vi.fn().mockResolvedValue(undefined) };
    const service = new DiscordSchedulingService({} as never, schedules as never, () => '2026/10/01');

    await service.completeRecordingDate('2026/10/02');

    expect(schedules.complete).toHaveBeenCalledWith('2026/10/02');
  });
});
