import { describe, expect, it, vi } from 'vitest';
import { GoogleSheetsEditingScheduleRepository } from './googleSheetsEditingScheduleRepository.js';

describe('GoogleSheetsEditingScheduleRepository', () => {
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
