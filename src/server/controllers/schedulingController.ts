import type { Request, Response } from 'express';
import type { SchedulingService } from '../../services/scheduling/schedulingService.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
class RequestValidationError extends Error {}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function string(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new RequestValidationError(`${field} is required`);
  return value.trim();
}
function localDate(value: unknown, field: string): string {
  const date = string(value, field);
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!DATE.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new RequestValidationError(`${field} must be an ISO calendar date (YYYY-MM-DD)`);
  }
  return date;
}
function sendError(response: Response, error: unknown): void {
  if (error instanceof RequestValidationError) {
    response.status(400).json({ message: error.message }); return;
  }
  console.error('Scheduling operation failed', error);
  response.status(502).json({ message: 'Scheduling provider operation failed' });
}

export function createSchedulingController(service: SchedulingService) {
  return {
    createRecordingDatePoll: async (request: Request, response: Response): Promise<void> => {
      try {
        if (!isObject(request.body)) throw new RequestValidationError('Request body must be an object');
        const candidateDates = request.body.candidateDates;
        if (!Array.isArray(candidateDates) || candidateDates.length < 2 || candidateDates.length > 10) {
          throw new RequestValidationError('candidateDates must contain between 2 and 10 dates');
        }
        const dates = candidateDates.map((date, index) => localDate(date, `candidateDates[${index}]`));
        if (new Set(dates).size !== dates.length) throw new RequestValidationError('candidateDates must not contain duplicates');
        const result = await service.createRecordingDatePoll({
          title: string(request.body.title, 'title'),
          candidateDates: dates,
        });
        response.status(result.created ? 201 : 200).json(result);
      } catch (error) { sendError(response, error); }
    },
  };
}
