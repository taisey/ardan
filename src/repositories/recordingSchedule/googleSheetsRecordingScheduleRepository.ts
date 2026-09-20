import { assertValidRecordingSchedule, type RecordingSchedule } from '../../models/recordingSchedule.js';
import type { GoogleSheetsClient } from '../../clients/googleSheets.js';
import type { RecordingScheduleRepository } from './recordingScheduleRepository.js';

const SHEET_NAME = 'recording_schedule';
const HEADER = ['start_date', 'end_date', 'fix_date', 'status'];

export class GoogleSheetsRecordingScheduleRepository implements RecordingScheduleRepository {
  constructor(private readonly sheets: GoogleSheetsClient) {}

  async findLatestNonExpired(today: string): Promise<RecordingSchedule | null> {
    const candidates = (await this.readSchedules())
      .filter(({ schedule }) => schedule.endDate >= today)
      .sort((left, right) => right.schedule.startDate.localeCompare(left.schedule.startDate));
    if (candidates.length > 1 && candidates[0].schedule.startDate === candidates[1].schedule.startDate) {
      throw new Error('Multiple non-expired recording schedules share the latest startDate');
    }
    return candidates[0]?.schedule ?? null;
  }

  async markInProgress(schedule: RecordingSchedule): Promise<void> {
    assertValidRecordingSchedule(schedule);
    if (schedule.status !== undefined) throw new Error('Only an unstarted schedule can be marked in_progress');
    const match = (await this.readSchedules()).find(({ schedule: stored }) =>
      stored.startDate === schedule.startDate && stored.endDate === schedule.endDate && stored.status === undefined,
    );
    if (!match) throw new Error('The selected unstarted recording schedule no longer exists');
    await this.sheets.updateRow(`${SHEET_NAME}!A${match.rowNumber}:D${match.rowNumber}`, this.toRow({ ...schedule, status: 'in_progress' }));
  }

  async complete(fixDate: string): Promise<void> {
    const schedules = await this.readSchedules();
    const latest = schedules
      .filter(({ schedule }) => schedule.status === 'in_progress')
      .sort((left, right) => right.schedule.startDate.localeCompare(left.schedule.startDate))[0];
    if (!latest) throw new Error('No in_progress recording schedule exists');
    if (fixDate < latest.schedule.startDate || fixDate > latest.schedule.endDate) {
      throw new Error(`fixDate must be between ${latest.schedule.startDate} and ${latest.schedule.endDate}`);
    }
    const completed: RecordingSchedule = { ...latest.schedule, fixDate, status: 'done' };
    assertValidRecordingSchedule(completed);
    await this.sheets.updateRow(`${SHEET_NAME}!A${latest.rowNumber}:D${latest.rowNumber}`, this.toRow(completed));
  }

  private async readSchedules(): Promise<Array<{ rowNumber: number; schedule: RecordingSchedule }>> {
    await this.sheets.ensureSheet(SHEET_NAME, HEADER);
    const rows = await this.sheets.readRows(`${SHEET_NAME}!A2:D`);
    return rows.flatMap((row, index) => {
      if (!row.some(Boolean)) return [];
      const schedule: RecordingSchedule = {
        startDate: row[0] ?? '', endDate: row[1] ?? '', fixDate: row[2] || undefined,
        status: row[3] ? row[3] as RecordingSchedule['status'] : undefined,
      };
      assertValidRecordingSchedule(schedule);
      return { rowNumber: index + 2, schedule };
    });
  }

  private toRow(schedule: RecordingSchedule): string[] {
    return [schedule.startDate, schedule.endDate, schedule.fixDate ?? '', schedule.status ?? ''];
  }
}
