import { describe, expect, it, vi } from 'vitest';
import { candidateDatesFor, DiscordSchedulingService } from './discordSchedulingService.js';

describe('DiscordSchedulingService', () => {
  it('skips a poll when no schedule can be claimed', async () => {
    const discord = { createAvailabilityPoll: vi.fn() };
    const schedules = { claimNextPollSchedule: vi.fn().mockResolvedValue(null), findLatestInProgress: vi.fn(), saveMetadata: vi.fn(), complete: vi.fn() };
    const service = new DiscordSchedulingService(discord as never, schedules, () => '2026/10/01', 'guild', 'role');
    await expect(service.createRecordingDatePoll())
      .resolves.toEqual({ created: false });
    expect(discord.createAvailabilityPoll).not.toHaveBeenCalled();
  });

  it('posts a poll for the schedule claimed before posting to Discord', async () => {
    const discord = {
      createAvailabilityThread: vi.fn().mockResolvedValue({ threadId: 'thread1' }),
      createAvailabilityPoll: vi.fn().mockResolvedValueOnce({ messageId: 'm1' }).mockResolvedValueOnce({ messageId: 'm2' }).mockResolvedValueOnce({ messageId: 'm3' }),
    };
    const schedule = { startDate: '2026/10/01', endDate: '2026/10/03', status: 'in_progress' as const };
    const schedules = { claimNextPollSchedule: vi.fn().mockResolvedValue(schedule), findLatestInProgress: vi.fn(), saveMetadata: vi.fn(), complete: vi.fn() };
    const service = new DiscordSchedulingService(discord as never, schedules, () => '2026/10/01', 'guild', 'role');
    await expect(service.createRecordingDatePoll())
      .resolves.toEqual({ created: true });
    expect(schedules.claimNextPollSchedule).toHaveBeenCalledWith('2026/10/01');
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
      { label: '○ 参加可能', userNames: ['Alice'], userIds: ['u1'] }, { label: '△ 調整可', userNames: ['Bob'], userIds: ['u2'] }, { label: '× 不可', userNames: [], userIds: [] },
    ]) };
    const schedules = { findLatestInProgress: vi.fn().mockResolvedValue({
      startDate: '2026/10/01', endDate: '2026/10/03', status: 'in_progress',
      metadata: { discord: { availabilityThreadId: 'thread1', availabilityPolls: [{ date: '2026/10/01', messageId: 'm1', channelId: 'thread1' }] } },
    }) };
    const service = new DiscordSchedulingService(discord as never, schedules as never, () => '2026/10/01', 'guild', 'role');
    await expect(service.aggregatePollResults()).resolves.toEqual([
      { date: '2026/10/01', available: ['Alice'], tentative: ['Bob'], unavailable: [] },
    ]);
    expect(discord.getPollVoters).toHaveBeenCalledWith('m1', 'thread1');
  });

  it('mentions members who skipped at least one poll', async () => {
    const discord = {
      getRoleMemberIds: vi.fn().mockResolvedValue(['u1', 'u2', 'u3']),
      getPollVoters: vi.fn()
        .mockResolvedValueOnce([{ label: '○ 参加可能', userNames: ['A'], userIds: ['u1', 'u2'] }])
        .mockResolvedValueOnce([{ label: '○ 参加可能', userNames: ['A'], userIds: ['u1', 'u3'] }]),
      sendThreadMessage: vi.fn().mockResolvedValue(undefined),
    };
    const schedules = { findLatestInProgress: vi.fn().mockResolvedValue({
      metadata: { discord: { availabilityThreadId: 'thread1', availabilityPolls: [
        { date: '2026/10/01', messageId: 'm1', channelId: 'thread1' },
        { date: '2026/10/02', messageId: 'm2', channelId: 'thread1' },
      ] } },
    }) };
    const service = new DiscordSchedulingService(discord as never, schedules as never, () => '2026/10/01', 'guild', 'role');

    await expect(service.remindUnansweredRecordingPollVoters()).resolves.toEqual(['u2', 'u3']);
    expect(discord.sendThreadMessage).toHaveBeenCalledWith(
      'thread1',
      '録音日程の投票が未回答です。すべてのPollに回答してください。\n未回答: <@u2> <@u3>',
      ['u2', 'u3'],
    );
  });

  it('does not post when every group member answered every poll', async () => {
    const discord = {
      getRoleMemberIds: vi.fn().mockResolvedValue(['u1']),
      getPollVoters: vi.fn().mockResolvedValue([{ label: '○ 参加可能', userNames: ['A'], userIds: ['u1'] }]),
      sendThreadMessage: vi.fn(),
    };
    const schedules = { findLatestInProgress: vi.fn().mockResolvedValue({
      metadata: { discord: { availabilityThreadId: 'thread1', availabilityPolls: [{ messageId: 'm1', channelId: 'thread1', date: '2026/10/01' }] } },
    }) };
    const service = new DiscordSchedulingService(discord as never, schedules as never, () => '2026/10/01', 'guild', 'role');

    await expect(service.remindUnansweredRecordingPollVoters()).resolves.toEqual([]);
    expect(discord.sendThreadMessage).not.toHaveBeenCalled();
  });

  it('completes the latest in-progress schedule with the selected date', async () => {
    const schedules = { complete: vi.fn().mockResolvedValue(undefined) };
    const service = new DiscordSchedulingService({} as never, schedules as never, () => '2026/10/01', 'guild', 'role');

    await service.completeRecordingDate('2026/10/02');

    expect(schedules.complete).toHaveBeenCalledWith('2026/10/02');
  });
});
