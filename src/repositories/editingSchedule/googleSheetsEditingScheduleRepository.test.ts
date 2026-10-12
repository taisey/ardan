import { describe, expect, it, vi } from 'vitest';
import { GoogleSheetsEditingScheduleRepository } from './googleSheetsEditingScheduleRepository.js';

describe('GoogleSheetsEditingScheduleRepository', () => {
  it('starts a blank schedule before saving reminder metadata', async () => {
    const sheets = {
      getSheetTitle: vi.fn().mockResolvedValue('editing_schedule'),
      readRows: vi.fn()
        .mockResolvedValueOnce([['#069', '2026/10/12', 'taisei', '']])
        .mockResolvedValueOnce([['#069', '2026/10/12', 'taisei', '']])
        .mockResolvedValue([['#069', '2026/10/12', 'taisei', 'in_progress']]),
      updateRow: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new GoogleSheetsEditingScheduleRepository(sheets as never, 1, 2, 3);

    await expect(repository.listSchedules()).resolves.toEqual([
      { number: '#069', startDueWeek: '2026/10/12', assign: 'taisei', status: '' },
    ]);
    await expect(repository.markInProgress('#69')).resolves.toEqual({
      number: '#069', startDueWeek: '2026/10/12', assign: 'taisei', status: 'in_progress',
    });
    await repository.saveMetadata('#069', { discord: { reminderThreadId: 'thread-69' } });
    expect(sheets.updateRow).toHaveBeenNthCalledWith(1, 'editing_schedule!D2:D2', ['in_progress']);
    expect(sheets.updateRow).toHaveBeenCalledWith(
      'editing_schedule!A2:E2', ['#069', '2026/10/12', 'taisei', 'in_progress', '{"discord":{"reminderThreadId":"thread-69"}}'],
    );
  });

  it('marks a zero-padded schedule done when the command omits leading zeros', async () => {
    const sheets = {
      getSheetTitle: vi.fn().mockResolvedValue('editing_schedule'),
      readRows: vi.fn().mockResolvedValue([['#068', '2026/09/28', 'yuma', 'in_progress']]),
      updateRow: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new GoogleSheetsEditingScheduleRepository(sheets as never, 1, 2, 3);

    await expect(repository.markDone('#68')).resolves.toEqual({
      number: '#068', startDueWeek: '2026/09/28', assign: 'yuma', status: 'done',
    });
    expect(sheets.updateRow).toHaveBeenCalledWith('editing_schedule!A2:E2', ['#068', '2026/09/28', 'yuma', 'done', '']);
  });
});
