import type { RecordingSchedule } from '../../models/recordingSchedule.js';

export interface RecordingScheduleRepository {
  claimNextPollSchedule(today: string): Promise<RecordingSchedule | null>;
  findLatestInProgress(): Promise<RecordingSchedule | null>;
  saveMetadata(schedule: RecordingSchedule, metadata: Record<string, unknown>): Promise<void>;
  complete(fixedDate: string): Promise<void>;
}
