import { describe, expect, it, vi } from 'vitest';
import { GoogleSheetsEditingScheduleRepository } from './googleSheetsEditingScheduleRepository.js';

describe('GoogleSheetsEditingScheduleRepository', () => {
  it('starts a blank schedule before saving reminder metadata', async () => {
    const sheets = {
      getSheetTitle: vi.fn().mockResolvedValue('editing_schedule'),
      readRows: vi.fn().mockImplementation((range: string) => range.endsWith('A1:E1')
        ? [['#', 'due_date', 'assign', 'status', 'metadata']]
        : [['#069', '2026/10/12', 'taisei', '']]),
      updateRow: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new GoogleSheetsEditingScheduleRepository(sheets as never, 1, 2, 3);

    await expect(repository.listSchedules()).resolves.toEqual([
      { number: '#069', dueDate: '2026/10/12', assign: 'taisei', status: '' },
    ]);
    await expect(repository.markInProgress('#69')).resolves.toEqual({
      number: '#069', dueDate: '2026/10/12', assign: 'taisei', status: 'in_progress',
    });
    sheets.readRows.mockImplementation((range: string) => range.endsWith('A1:E1')
      ? [['#', 'due_date', 'assign', 'status', 'metadata']]
      : [['#069', '2026/10/12', 'taisei', 'in_progress']]);
    await repository.saveMetadata('#069', { discord: { reminderThreadId: 'thread-69' } });
    expect(sheets.updateRow).toHaveBeenNthCalledWith(1, 'editing_schedule!D2:D2', ['in_progress']);
    expect(sheets.updateRow).toHaveBeenCalledWith(
      'editing_schedule!A2:E2', ['#069', '2026/10/12', 'taisei', 'in_progress', '{"discord":{"reminderThreadId":"thread-69"}}'],
    );
  });

  it('marks a zero-padded schedule done when the command omits leading zeros', async () => {
    const sheets = {
      getSheetTitle: vi.fn().mockResolvedValue('editing_schedule'),
      readRows: vi.fn().mockImplementation((range: string) => range.endsWith('A1:E1')
        ? [['#', 'due_date', 'assign', 'status', 'metadata']]
        : [['#068', '2026/09/28', 'yuma', 'in_progress']]),
      updateRow: vi.fn().mockResolvedValue(undefined),
    };
    const repository = new GoogleSheetsEditingScheduleRepository(sheets as never, 1, 2, 3);

    await expect(repository.markDone('#68')).resolves.toEqual({
      number: '#068', dueDate: '2026/09/28', assign: 'yuma', status: 'done',
    });
    expect(sheets.updateRow).toHaveBeenCalledWith('editing_schedule!A2:E2', ['#068', '2026/09/28', 'yuma', 'done', '']);
  });

  it('requires a due_date header', async () => {
    const sheets = {
      getSheetTitle: vi.fn().mockResolvedValue('editing_schedule'),
      readRows: vi.fn().mockResolvedValue([['#', 'other_date', 'assign', 'status', 'metadata']]),
    };
    const repository = new GoogleSheetsEditingScheduleRepository(sheets as never, 1, 2, 3);
    await expect(repository.listSchedules()).rejects.toThrow('column B must be due_date');
    expect(sheets.readRows).toHaveBeenCalledOnce();
  });
});
