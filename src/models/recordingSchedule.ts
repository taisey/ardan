export type RecordingScheduleStatus = 'in_progress' | 'done';

export interface RecordingSchedule {
  startDate: string;
  endDate: string;
  fixedDate?: string;
  status?: RecordingScheduleStatus;
  metadata?: Record<string, unknown>;
}

export function assertValidRecordingSchedule(schedule: RecordingSchedule): void {
  if (schedule.status !== undefined && schedule.status !== 'in_progress' && schedule.status !== 'done') {
    throw new Error('status must be in_progress or done');
  }
  if (!isLocalDate(schedule.startDate) || !isLocalDate(schedule.endDate)) {
    throw new Error('startDate and endDate must be YYYY/MM/DD calendar dates');
  }
  if (schedule.startDate > schedule.endDate) throw new Error('startDate must not be later than endDate');
  if ((schedule.status === undefined || schedule.status === 'in_progress') && schedule.fixedDate) {
    throw new Error('unstarted and in_progress schedules must not have fixedDate');
  }
  if (schedule.status === 'done' && !isLocalDate(schedule.fixedDate ?? '')) {
    throw new Error('done schedules require a YYYY/MM/DD fixedDate');
  }
}

function isLocalDate(value: string): boolean {
  if (!/^\d{4}\/\d{2}\/\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value.replaceAll('/', '-')}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10).replaceAll('-', '/') === value;
}
