import { describe, expect, it, vi } from 'vitest';
import { GoogleSheetsRecordingScheduleRepository } from './googleSheetsRecordingScheduleRepository.js';

function client(rows: string[][] = []) {
  return {
    ensureSheet: vi.fn().mockResolvedValue(undefined),
    readRows: vi.fn().mockResolvedValue(rows),
    appendRow: vi.fn().mockResolvedValue(undefined),
    updateRow: vi.fn().mockResolvedValue(undefined),
  };
}

describe('GoogleSheetsRecordingScheduleRepository', () => {
  it('marks exactly the four configured columns in progress', async () => {
    const sheets = client([['2026-10-01', '2026-10-15', '', '']]);
    const repository = new GoogleSheetsRecordingScheduleRepository(sheets as never);
    await repository.markInProgress({ startDate: '2026-10-01', endDate: '2026-10-15' });
    expect(sheets.updateRow).toHaveBeenCalledWith('recording_schedule!A2:D2', [
      '2026-10-01', '2026-10-15', '', 'in_progress',
    ]);
  });

  it('finds the newest non-expired schedule even when older rows are present', async () => {
    const sheets = client([
      ['2026-09-01', '2026-09-15', '', ''],
      ['2026-10-01', '2026-10-15', '', ''],
      ['2026-08-01', '2026-10-01', '2026-09-18', 'done'],
    ]);
    const repository = new GoogleSheetsRecordingScheduleRepository(sheets as never);
    await expect(repository.findLatestNonExpired('2026-10-01')).resolves.toEqual({ startDate: '2026-10-01', endDate: '2026-10-15' });
  });

  it('completes the newest in-progress row', async () => {
    const sheets = client([
      ['2026-09-01', '2026-09-15', '', 'in_progress'],
      ['2026-10-01', '2026-10-15', '', 'in_progress'],
    ]);
    const repository = new GoogleSheetsRecordingScheduleRepository(sheets as never);
    await repository.complete('2026-10-08');
    expect(sheets.updateRow).toHaveBeenCalledWith('recording_schedule!A3:D3', [
      '2026-10-01', '2026-10-15', '2026-10-08', 'done',
    ]);
  });

  it('rejects an out-of-period fix date without updating the sheet', async () => {
    const sheets = client([['2026-10-01', '2026-10-15', '', 'in_progress']]);
    const repository = new GoogleSheetsRecordingScheduleRepository(sheets as never);
    await expect(repository.complete('2026-10-16')).rejects.toThrow('fixDate must be between');
    expect(sheets.updateRow).not.toHaveBeenCalled();
  });
});
