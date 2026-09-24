import { describe, expect, it, vi } from 'vitest';
import { EditingScheduleService, weekStart } from './editingScheduleService.js';

describe('EditingScheduleService', () => {
  it('adds Drive episodes after the latest done assignment and schedules stale weeks for next week', async () => {
    const drive = { listChildNames: vi.fn().mockResolvedValue(['#12', '#11', 'draft']) };
    const schedules = {
      listSchedules: vi.fn().mockResolvedValue([{ number: '#10', startDueWeek: '2026/09/14', assign: 'B', status: 'done' }]),
      listAssignees: vi.fn().mockResolvedValue([{ order: 1, name: 'A' }, { order: 2, name: 'B' }, { order: 3, name: 'C' }]),
      append: vi.fn().mockResolvedValue(undefined),
    };
    const service = new EditingScheduleService(drive as never, schedules as never, {} as never, 'folder', () => '2026/09/24');

    await expect(service.syncFromDrive()).resolves.toEqual([
      { number: '#11', startDueWeek: '2026/09/28', assign: 'C', status: 'in_progress' },
      { number: '#12', startDueWeek: '2026/10/05', assign: 'A', status: 'in_progress' },
    ]);
  });

  it('uses an existing bare episode number as the latest done row', async () => {
    const drive = { listChildNames: vi.fn().mockResolvedValue(['#001', '#046', '#068']) };
    const schedules = {
      listSchedules: vi.fn().mockResolvedValue([{ number: '67', startDueWeek: '2026/09/28', assign: 'Yuma', status: 'done' }]),
      listAssignees: vi.fn().mockResolvedValue([{ order: 1, name: 'Yuma' }, { order: 2, name: 'Aoi' }]),
      append: vi.fn().mockResolvedValue(undefined),
    };
    const service = new EditingScheduleService(drive as never, schedules as never, {} as never, 'folder', () => '2026/09/24');

    await expect(service.syncFromDrive()).resolves.toEqual([
      { number: '#068', startDueWeek: '2026/10/05', assign: 'Aoi', status: 'in_progress' },
    ]);
  });

  it('mentions the assigned Discord user for unfinished items due this week', async () => {
    const schedules = {
      listSchedules: vi.fn().mockResolvedValue([
        { number: '#11', startDueWeek: '2026/09/21', assign: 'A', status: 'in_progress' },
        { number: '#12', startDueWeek: '2026/09/28', assign: 'B', status: 'in_progress' },
        { number: '#10', startDueWeek: '2026/09/14', assign: 'C', status: 'in_progress' },
      ]),
      listUsers: vi.fn().mockResolvedValue([{ name: 'A', discordId: '123' }]),
      saveMetadata: vi.fn().mockResolvedValue(undefined),
    };
    const discord = {
      createEditingReminderThread: vi.fn().mockResolvedValue({ threadId: 'thread-11' }),
      sendThreadMessage: vi.fn().mockResolvedValue(undefined),
    };
    const service = new EditingScheduleService({} as never, schedules as never, discord as never, 'folder', () => '2026/09/24');

    await expect(service.remindDueEditors()).resolves.toHaveLength(1);
    expect(discord.createEditingReminderThread).toHaveBeenCalledWith('#11', '2026/09/21');
    expect(schedules.saveMetadata).toHaveBeenCalledWith('#11', { discord: { reminderThreadId: 'thread-11' } });
    expect(discord.sendThreadMessage).toHaveBeenCalledWith(
      'thread-11', '<@123> #11 の編集をお願いします（開始予定週: 2026/09/21）。', ['123'],
    );
  });

  it('reuses a reminder thread saved in metadata', async () => {
    const schedules = {
      listSchedules: vi.fn().mockResolvedValue([{
        number: '#11', startDueWeek: '2026/09/21', assign: 'A', status: 'in_progress',
        metadata: { discord: { reminderThreadId: 'existing-thread' } },
      }]),
      listUsers: vi.fn().mockResolvedValue([{ name: 'A', discordId: '123' }]),
    };
    const discord = { createEditingReminderThread: vi.fn(), sendThreadMessage: vi.fn().mockResolvedValue(undefined) };
    const service = new EditingScheduleService({} as never, schedules as never, discord as never, 'folder', () => '2026/09/24');

    await service.remindDueEditors();
    expect(discord.createEditingReminderThread).not.toHaveBeenCalled();
    expect(discord.sendThreadMessage).toHaveBeenCalledWith(
      'existing-thread', '<@123> #11 の編集をお願いします（開始予定週: 2026/09/21）。', ['123'],
    );
  });

  it('normalizes a due date to its Monday', () => {
    expect(weekStart('2026-09-24')).toBe('2026/09/21');
  });
});
