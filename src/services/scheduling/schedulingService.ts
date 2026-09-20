export type CreatedRecordingDatePoll = { created: boolean; messageId?: string };

export type AvailabilityResult = {
  date: string;
  available: string[];
  tentative: string[];
  unavailable: string[];
};

export interface SchedulingService {
  createRecordingDatePoll(): Promise<CreatedRecordingDatePoll>;
  aggregatePollResults(): Promise<AvailabilityResult[]>;
  completeRecordingDate(fixedDate: string): Promise<void>;
}
