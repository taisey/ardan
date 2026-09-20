export type LocalDate = string;

export type CreateRecordingDatePoll = {
  title: string;
  candidateDates: LocalDate[];
};

export type CreatedRecordingDatePoll = { created: boolean; messageId?: string };

export interface SchedulingService {
  createRecordingDatePoll(input: CreateRecordingDatePoll): Promise<CreatedRecordingDatePoll>;
}
