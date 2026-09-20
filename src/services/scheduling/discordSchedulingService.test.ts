import { describe, expect, it, vi } from 'vitest';
import { DiscordSchedulingService } from './discordSchedulingService.js';

describe('DiscordSchedulingService', () => {
  it('skips a poll while the latest schedule is in progress', async () => {
    const discord = { createRecordingDatePoll: vi.fn() };
    const schedules = { findLatestNonExpired: vi.fn().mockResolvedValue({ status: 'in_progress' }), markInProgress: vi.fn(), complete: vi.fn() };
    const service = new DiscordSchedulingService(discord as never, schedules, () => '2026-10-01');
    await expect(service.createRecordingDatePoll({ title: '10月録音', candidateDates: ['2026-10-01', '2026-10-15'] }))
      .resolves.toEqual({ created: false });
    expect(discord.createRecordingDatePoll).not.toHaveBeenCalled();
  });

  it('skips a poll while the latest schedule is done', async () => {
    const discord = { createRecordingDatePoll: vi.fn() };
    const schedules = { findLatestNonExpired: vi.fn().mockResolvedValue({ status: 'done', fixDate: '2026-10-08' }), markInProgress: vi.fn(), complete: vi.fn() };
    const service = new DiscordSchedulingService(discord as never, schedules, () => '2026-10-01');
    await expect(service.createRecordingDatePoll({ title: '10月録音', candidateDates: ['2026-10-01', '2026-10-15'] }))
      .resolves.toEqual({ created: false });
    expect(discord.createRecordingDatePoll).not.toHaveBeenCalled();
  });

  it('marks the latest unstarted schedule in progress before posting to Discord', async () => {
    const discord = { createRecordingDatePoll: vi.fn().mockResolvedValue({ messageId: 'm1' }) };
    const schedule = { startDate: '2026-10-01', endDate: '2026-10-15' };
    const schedules = { findLatestNonExpired: vi.fn().mockResolvedValue(schedule), markInProgress: vi.fn(), complete: vi.fn() };
    const service = new DiscordSchedulingService(discord as never, schedules, () => '2026-10-01');
    await expect(service.createRecordingDatePoll({ title: '10月録音', candidateDates: ['2026-10-15', '2026-10-01'] }))
      .resolves.toEqual({ created: true, messageId: 'm1' });
    expect(schedules.findLatestNonExpired).toHaveBeenCalledWith('2026-10-01');
    expect(schedules.markInProgress).toHaveBeenCalledWith(schedule);
  });
});
