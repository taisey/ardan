import type { RecordingSchedule } from '../../models/recordingSchedule.js';

export interface RecordingScheduleRepository {
  findLatestNonExpired(today: string): Promise<RecordingSchedule | null>;
  findLatestInProgress(): Promise<RecordingSchedule | null>;
  markInProgress(schedule: RecordingSchedule): Promise<void>;
  saveMetadata(schedule: RecordingSchedule, metadata: Record<string, unknown>): Promise<void>;
  complete(fixDate: string): Promise<void>;
}
