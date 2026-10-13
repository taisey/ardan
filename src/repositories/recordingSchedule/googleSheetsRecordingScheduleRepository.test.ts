import { describe, expect, it, vi } from 'vitest';
import { GoogleSheetsRecordingScheduleRepository } from './googleSheetsRecordingScheduleRepository.js';

function client(rows: string[][] = []) {
  return {
    getSheetTitle: vi.fn().mockResolvedValue('Sheet1'),
    readRows: vi.fn().mockResolvedValue(rows),
    appendRow: vi.fn().mockResolvedValue(undefined),
    updateRow: vi.fn().mockResolvedValue(undefined),
  };
}

describe('GoogleSheetsRecordingScheduleRepository', () => {
  it('claims the next schedule and preserves the metadata column', async () => {
    const sheets = client([['2026-10-01', '2026-10-15', '', '']]);
    const repository = new GoogleSheetsRecordingScheduleRepository(sheets as never, 0);
    await expect(repository.claimNextPollSchedule('2026/10/01')).resolves.toEqual({
      startDate: '2026/10/01', endDate: '2026/10/15', status: 'collecting',
    });
    expect(sheets.updateRow).toHaveBeenCalledWith('Sheet1!A2:E2', [
      '2026/10/01', '2026/10/15', '', 'collecting', '',
    ]);
  });

  it('claims the unstarted non-expired schedule with the earliest end date', async () => {
    const sheets = client([
      ['2026/09/01', '2026/10/15', '', ''],
      ['2026/10/01', '2026/10/20', '', ''],
      ['2026/08/01', '2026/09/01', '2026/08/18', 'done'],
      ['2026/09/15', '2026/09/30', '2026/09/20', 'done'],
      ['2026/09/10', '2026/10/05', '', ''],
    ]);
    const repository = new GoogleSheetsRecordingScheduleRepository(sheets as never, 0);
    await expect(repository.claimNextPollSchedule('2026/10/01')).resolves.toEqual({
      startDate: '2026/09/10', endDate: '2026/10/05', status: 'collecting',
    });
  });

  it('does not claim a schedule while a collecting schedule has not expired', async () => {
    const sheets = client([
      ['2026/10/01', '2026/10/15', '', 'collecting'],
      ['2026/10/16', '2026/10/20', '', ''],
    ]);
    const repository = new GoogleSheetsRecordingScheduleRepository(sheets as never, 0);

    await expect(repository.claimNextPollSchedule('2026/10/10')).resolves.toBeNull();
    expect(sheets.updateRow).not.toHaveBeenCalled();
  });

  it('keeps a finalizing schedule active after its candidate range ends', async () => {
    const sheets = client([
      ['2026/09/01', '2026/09/30', '', 'finalizing'],
      ['2026/10/01', '2026/10/15', '', ''],
    ]);
    const repository = new GoogleSheetsRecordingScheduleRepository(sheets as never, 0);

    await expect(repository.claimNextPollSchedule('2026/10/01')).resolves.toBeNull();
    expect(sheets.updateRow).not.toHaveBeenCalled();
  });

  it('treats a legacy in_progress row as collecting', async () => {
    const sheets = client([['2026/10/01', '2026/10/15', '', 'in_progress']]);
    const repository = new GoogleSheetsRecordingScheduleRepository(sheets as never, 0);

    await expect(repository.findLatestActive()).resolves.toMatchObject({ status: 'collecting' });
  });

  it('marks a collecting schedule as finalizing without changing its metadata', async () => {
    const metadata = '{"discord":{"availabilityThreadId":"thread1"}}';
    const sheets = client([['2026/10/01', '2026/10/15', '', 'collecting', metadata]]);
    const repository = new GoogleSheetsRecordingScheduleRepository(sheets as never, 0);

    await repository.markFinalizing({
      startDate: '2026/10/01', endDate: '2026/10/15', status: 'collecting', metadata: JSON.parse(metadata),
    });
    expect(sheets.updateRow).toHaveBeenCalledWith('Sheet1!D2:D2', ['finalizing']);
  });

  it('does not claim a schedule until the latest completed schedule has expired', async () => {
    const sheets = client([
      ['2026/10/01', '2026/10/15', '2026/10/08', 'done'],
      ['2026/10/16', '2026/10/20', '', ''],
    ]);
    const repository = new GoogleSheetsRecordingScheduleRepository(sheets as never, 0);

    await expect(repository.claimNextPollSchedule('2026/10/15')).resolves.toBeNull();
    expect(sheets.updateRow).not.toHaveBeenCalled();

    await expect(repository.claimNextPollSchedule('2026/10/16')).resolves.toEqual({
      startDate: '2026/10/16', endDate: '2026/10/20', status: 'collecting',
    });
  });

  it('cancels expired collecting schedules before claiming the next schedule', async () => {
    const sheets = client([
      ['2026/09/01', '2026/09/30', '', 'collecting'],
      ['2026/10/01', '2026/10/15', '', ''],
    ]);
    const repository = new GoogleSheetsRecordingScheduleRepository(sheets as never, 0);

    await expect(repository.claimNextPollSchedule('2026/10/01')).resolves.toEqual({
      startDate: '2026/10/01', endDate: '2026/10/15', status: 'collecting',
    });
    expect(sheets.updateRow).toHaveBeenNthCalledWith(1, 'Sheet1!A2:E2', [
      '2026/09/01', '2026/09/30', '', 'canceled', '',
    ]);
    expect(sheets.updateRow).toHaveBeenNthCalledWith(2, 'Sheet1!A3:E3', [
      '2026/10/01', '2026/10/15', '', 'collecting', '',
    ]);
  });

  it('completes the newest active row', async () => {
    const sheets = client([
      ['2026/09/01', '2026/09/15', '', 'collecting'],
      ['2026/10/01', '2026/10/15', '', 'finalizing'],
    ]);
    const repository = new GoogleSheetsRecordingScheduleRepository(sheets as never, 0);
    await repository.complete('2026/10/08');
    expect(sheets.updateRow).toHaveBeenCalledWith('Sheet1!A3:E3', [
      '2026/10/01', '2026/10/15', '2026/10/08', 'done', '',
    ]);
  });

  it('rejects an out-of-period fix date without updating the sheet', async () => {
    const sheets = client([['2026/10/01', '2026/10/15', '', 'collecting']]);
    const repository = new GoogleSheetsRecordingScheduleRepository(sheets as never, 0);
    await expect(repository.complete('2026/10/16')).rejects.toThrow('fixedDate must be between');
    expect(sheets.updateRow).not.toHaveBeenCalled();
  });
});
