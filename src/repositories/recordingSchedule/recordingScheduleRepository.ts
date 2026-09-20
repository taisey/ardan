import type { RecordingSchedule } from '../../models/recordingSchedule.js';

export interface RecordingScheduleRepository {
  findLatestNonExpired(today: string): Promise<RecordingSchedule | null>;
  markInProgress(schedule: RecordingSchedule): Promise<void>;
  complete(fixDate: string): Promise<void>;
}
