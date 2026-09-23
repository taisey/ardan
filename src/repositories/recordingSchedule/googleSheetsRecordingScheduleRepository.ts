import { assertValidRecordingSchedule, type RecordingSchedule } from '../../models/recordingSchedule.js';
import type { GoogleSheetsClient } from '../../clients/googleSheets.js';
import type { RecordingScheduleRepository } from './recordingScheduleRepository.js';

export class GoogleSheetsRecordingScheduleRepository implements RecordingScheduleRepository {
  private sheetTitle: Promise<string> | undefined;

  constructor(
    private readonly sheets: GoogleSheetsClient,
    private readonly sheetGid: number,
  ) {}

  async claimNextPollSchedule(today: string): Promise<RecordingSchedule | null> {
    const schedules = await this.readSchedules();
    const title = await this.getSheetTitle();

    for (const expired of schedules.filter(({ schedule }) => schedule.status === 'in_progress' && schedule.endDate < today)) {
      await this.sheets.updateRow(`${title}!A${expired.rowNumber}:E${expired.rowNumber}`, this.toRow({ ...expired.schedule, status: 'canceled' }));
    }

    if (schedules.some(({ schedule }) => schedule.status === 'in_progress' && schedule.endDate >= today)) {
      return null;
    }

    const latestCompletedEndDate = schedules
      .filter(({ schedule }) => schedule.status === 'done')
      .map(({ schedule }) => schedule.endDate)
      .sort((left, right) => right.localeCompare(left))[0];
    if (latestCompletedEndDate && latestCompletedEndDate >= today) return null;

    const candidates = schedules
      .filter(({ schedule }) => schedule.status === undefined && schedule.endDate >= today)
      .sort((left, right) => left.schedule.endDate.localeCompare(right.schedule.endDate));
    if (candidates.length > 1 && candidates[0].schedule.endDate === candidates[1].schedule.endDate) {
      throw new Error('Multiple unstarted non-expired recording schedules share the earliest endDate');
    }
    const candidate = candidates[0];
    if (!candidate) return null;
    const inProgress: RecordingSchedule = { ...candidate.schedule, status: 'in_progress' };
    await this.sheets.updateRow(`${title}!A${candidate.rowNumber}:E${candidate.rowNumber}`, this.toRow(inProgress));
    return inProgress;
  }

  async findLatestInProgress(): Promise<RecordingSchedule | null> {
    const schedules = await this.readSchedules();
    return schedules
      .filter(({ schedule }) => schedule.status === 'in_progress')
      .sort((left, right) => right.schedule.startDate.localeCompare(left.schedule.startDate))[0]?.schedule ?? null;
  }

  async saveMetadata(schedule: RecordingSchedule, metadata: Record<string, unknown>): Promise<void> {
    const match = (await this.readSchedules()).find(({ schedule: stored }) =>
      stored.startDate === schedule.startDate && stored.endDate === schedule.endDate,
    );
    if (!match) throw new Error('The selected schedule no longer exists');
    const title = await this.getSheetTitle();
    await this.sheets.updateRow(`${title}!A${match.rowNumber}:E${match.rowNumber}`, this.toRow({ ...match.schedule, metadata }));
  }

  async complete(fixedDate: string): Promise<void> {
    const schedules = await this.readSchedules();
    const latest = schedules
      .filter(({ schedule }) => schedule.status === 'in_progress')
      .sort((left, right) => right.schedule.startDate.localeCompare(left.schedule.startDate))[0];
    if (!latest) throw new Error('No in_progress recording schedule exists');
    if (fixedDate < latest.schedule.startDate || fixedDate > latest.schedule.endDate) {
      throw new Error(`fixedDate must be between ${latest.schedule.startDate} and ${latest.schedule.endDate}`);
    }
    const completed: RecordingSchedule = { ...latest.schedule, fixedDate, status: 'done' };
    assertValidRecordingSchedule(completed);
    const title = await this.getSheetTitle();
    await this.sheets.updateRow(`${title}!A${latest.rowNumber}:E${latest.rowNumber}`, this.toRow(completed));
  }

  private async readSchedules(): Promise<Array<{ rowNumber: number; schedule: RecordingSchedule }>> {
    const title = await this.getSheetTitle();
    const rows = await this.sheets.readRows(`${title}!A2:E`);
    return rows.flatMap((row, index) => {
      if (!row.some(Boolean)) return [];
      const schedule: RecordingSchedule = {
        startDate: this.toSlashDate(row[0] ?? ''), endDate: this.toSlashDate(row[1] ?? ''), fixedDate: row[2] ? this.toSlashDate(row[2]) : undefined,
        status: row[3] ? row[3] as RecordingSchedule['status'] : undefined,
        metadata: this.parseMetadata(row[4]),
      };
      assertValidRecordingSchedule(schedule);
      return { rowNumber: index + 2, schedule };
    });
  }

  private toRow(schedule: RecordingSchedule): string[] {
    return [schedule.startDate, schedule.endDate, schedule.fixedDate ?? '', schedule.status ?? '', schedule.metadata ? JSON.stringify(schedule.metadata) : ''];
  }

  private getSheetTitle(): Promise<string> {
    this.sheetTitle ??= this.sheets.getSheetTitle(this.sheetGid);
    return this.sheetTitle;
  }

  private parseMetadata(value: string | undefined): Record<string, unknown> | undefined {
    if (!value) return undefined;
    try {
      const parsed: unknown = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
      return parsed as Record<string, unknown>;
    } catch {
      throw new Error('metadata must be a JSON object');
    }
  }

  private toSlashDate(value: string): string {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replaceAll('-', '/') : value;
  }
}
