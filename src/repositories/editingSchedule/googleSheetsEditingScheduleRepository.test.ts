import { describe, expect, it, vi } from 'vitest';
import { GoogleSheetsEditingScheduleRepository } from './googleSheetsEditingScheduleRepository.js';

describe('GoogleSheetsEditingScheduleRepository', () => {
  it('reads a blank status and preserves it when saving reminder metadata', async () => {
    const sheets = {
      getSheetTitle: vi.fn().mockResolvedValue('editing_schedule'),
      readRows: vi.fn().mockResolvedValue([['#069', '2026/10/12', 'taisei', '']]),
      updateRow: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new GoogleSheetsEditingScheduleRepository(sheets as never, 1, 2, 3);

    await expect(repository.listSchedules()).resolves.toEqual([
      { number: '#069', startDueWeek: '2026/10/12', assign: 'taisei', status: '' },
    ]);
    await repository.saveMetadata('#069', { discord: { reminderThreadId: 'thread-69' } });
    expect(sheets.updateRow).toHaveBeenCalledWith(
      'editing_schedule!A2:E2', ['#069', '2026/10/12', 'taisei', '', '{"discord":{"reminderThreadId":"thread-69"}}'],
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
