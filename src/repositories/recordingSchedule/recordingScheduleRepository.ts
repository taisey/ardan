import type { RecordingSchedule } from '../../models/recordingSchedule.js';

export interface RecordingScheduleRepository {
  claimNextPollSchedule(today: string): Promise<RecordingSchedule | null>;
  findLatestActive(): Promise<RecordingSchedule | null>;
  markFinalizing(schedule: RecordingSchedule): Promise<void>;
  saveMetadata(schedule: RecordingSchedule, metadata: Record<string, unknown>): Promise<void>;
  complete(fixedDate: string): Promise<void>;
  skip(): Promise<void>;
}
