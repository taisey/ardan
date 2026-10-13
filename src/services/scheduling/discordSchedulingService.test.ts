import { describe, expect, it, vi } from 'vitest';
import { candidateDatesFor, DiscordSchedulingService } from './discordSchedulingService.js';

describe('DiscordSchedulingService', () => {
  it('skips a poll when no schedule can be claimed', async () => {
    const discord = { createAvailabilityPoll: vi.fn() };
    const schedules = { claimNextPollSchedule: vi.fn().mockResolvedValue(null), findLatestActive: vi.fn(), markFinalizing: vi.fn(), saveMetadata: vi.fn(), complete: vi.fn(), skip: vi.fn() };
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
    const schedule = { startDate: '2026/10/01', endDate: '2026/10/03', status: 'collecting' as const };
    const schedules = { claimNextPollSchedule: vi.fn().mockResolvedValue(schedule), findLatestActive: vi.fn(), markFinalizing: vi.fn(), saveMetadata: vi.fn(), complete: vi.fn(), skip: vi.fn() };
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
    const schedules = { findLatestActive: vi.fn().mockResolvedValue({
      startDate: '2026/10/01', endDate: '2026/10/03', status: 'collecting',
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
    const schedules = { findLatestActive: vi.fn().mockResolvedValue({
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

  it('mentions the group and posts the same aggregation when every member answered', async () => {
    const discord = {
      getRoleMemberIds: vi.fn().mockResolvedValue(['u1']),
      getPollVoters: vi.fn().mockResolvedValue([{ label: '○ 参加可能', userNames: ['A'], userIds: ['u1'] }]),
      sendThreadMessage: vi.fn(),
    };
    const metadata: Record<string, unknown> = {
      discord: { availabilityThreadId: 'thread1', availabilityPolls: [{ messageId: 'm1', channelId: 'thread1', date: '2026/10/01' }] },
    };
    let status: 'collecting' | 'finalizing' = 'collecting';
    let fixed = false;
    const schedules = {
      findLatestActive: vi.fn().mockImplementation(async () => fixed ? null : { metadata, status }),
      markFinalizing: vi.fn().mockImplementation(async () => { status = 'finalizing'; }),
    };
    const service = new DiscordSchedulingService(discord as never, schedules as never, () => '2026/10/01', 'guild', 'role');

    await expect(service.remindUnansweredRecordingPollVoters()).resolves.toEqual([]);
    expect(discord.getPollVoters).toHaveBeenCalledTimes(1);
    expect(discord.sendThreadMessage).toHaveBeenCalledTimes(2);
    expect(discord.sendThreadMessage).toHaveBeenNthCalledWith(
      1, 'thread1', '<@&role>\n全員の回答が揃いました。投票結果をお知らせします。', [], ['role'],
    );
    expect(discord.sendThreadMessage.mock.calls[1][0]).toBe('thread1');
    expect(discord.sendThreadMessage.mock.calls[1][1]).toContain('**2026/10/01（木）**');
    expect(discord.sendThreadMessage.mock.calls[1][1]).toContain('**候補日**');
    expect(status).toBe('finalizing');
    expect(schedules.markFinalizing).toHaveBeenCalledTimes(1);

    await expect(service.remindUnansweredRecordingPollVoters()).resolves.toEqual([]);
    expect(discord.sendThreadMessage).toHaveBeenCalledTimes(3);
    expect(discord.sendThreadMessage).toHaveBeenLastCalledWith(
      'thread1',
      '<@&role>\n録音日程はまだ確定していません。候補日を確認して、日程の相談・確定をお願いします。',
      [],
      ['role'],
    );
    expect(schedules.markFinalizing).toHaveBeenCalledTimes(1);

    await service.remindUnansweredRecordingPollVoters();
    expect(discord.sendThreadMessage).toHaveBeenCalledTimes(4);
    expect(discord.sendThreadMessage.mock.calls[3][1]).toContain('録音日程はまだ確定していません');
    expect(schedules.markFinalizing).toHaveBeenCalledTimes(1);

    fixed = true;
    await service.remindUnansweredRecordingPollVoters();
    expect(discord.sendThreadMessage).toHaveBeenCalledTimes(4);
  });

  it('keeps collecting when result posting fails and retries on the next run', async () => {
    const metadata: Record<string, unknown> = {
      discord: { availabilityThreadId: 'thread1', availabilityPolls: [{ messageId: 'm1', channelId: 'thread1', date: '2026/10/01' }] },
    };
    let status: 'collecting' | 'finalizing' = 'collecting';
    const discord = {
      getRoleMemberIds: vi.fn().mockResolvedValue(['u1']),
      getPollVoters: vi.fn().mockResolvedValue([{ label: '○ 参加可能', userNames: ['A'], userIds: ['u1'] }]),
      sendThreadMessage: vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('send failed')).mockResolvedValue(undefined),
    };
    const schedules = {
      findLatestActive: vi.fn().mockImplementation(async () => ({ metadata, status })),
      markFinalizing: vi.fn().mockImplementation(async () => { status = 'finalizing'; }),
    };
    const service = new DiscordSchedulingService(discord as never, schedules as never, () => '2026/10/01', 'guild', 'role');

    await expect(service.remindUnansweredRecordingPollVoters()).rejects.toThrow('send failed');
    expect(status).toBe('collecting');
    expect(schedules.markFinalizing).not.toHaveBeenCalled();

    await expect(service.remindUnansweredRecordingPollVoters()).resolves.toEqual([]);
    expect(discord.sendThreadMessage).toHaveBeenCalledTimes(4);
    expect(discord.sendThreadMessage.mock.calls[2][1]).toContain('全員の回答が揃いました');
    expect(discord.sendThreadMessage.mock.calls[3][1]).toContain('**候補日**');
    expect(status).toBe('finalizing');
  });

  it('completes the latest in-progress schedule with the selected date', async () => {
    const schedules = { complete: vi.fn().mockResolvedValue(undefined) };
    const service = new DiscordSchedulingService({} as never, schedules as never, () => '2026/10/01', 'guild', 'role');

    await service.completeRecordingDate('2026/10/02');

    expect(schedules.complete).toHaveBeenCalledWith('2026/10/02');
  });

  it('skips the active recording coordination', async () => {
    const schedules = { skip: vi.fn().mockResolvedValue(undefined) };
    const service = new DiscordSchedulingService({} as never, schedules as never, () => '2026/10/01', 'guild', 'role');

    await service.skipRecordingCoordination();

    expect(schedules.skip).toHaveBeenCalledOnce();
  });
});
