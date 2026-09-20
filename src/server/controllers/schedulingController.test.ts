import { describe, expect, it, vi } from 'vitest';
import { createSchedulingController } from './schedulingController.js';
import type { SchedulingService } from '../../services/scheduling/schedulingService.js';

function response() {
  const result = { status: vi.fn(), json: vi.fn() };
  result.status.mockReturnValue(result);
  return result;
}

describe('scheduling controller', () => {
  it('rejects an invalid calendar date before calling the service', async () => {
    const service: SchedulingService = { createRecordingDatePoll: vi.fn() };
    const controller = createSchedulingController(service);
    const result = response();
    await controller.createRecordingDatePoll({ body: { title: 'recording', candidateDates: ['2026-02-30', '2026-03-01'] } } as never, result as never);
    expect(result.status).toHaveBeenCalledWith(400);
    expect(service.createRecordingDatePoll).not.toHaveBeenCalled();
  });

  it('maps a successful create request to 201', async () => {
    const service: SchedulingService = {
      createRecordingDatePoll: vi.fn().mockResolvedValue({ created: true, messageId: 'm1' }),
    };
    const controller = createSchedulingController(service);
    const result = response();
    await controller.createRecordingDatePoll({ body: { title: 'recording', candidateDates: ['2026-03-01', '2026-03-08'] } } as never, result as never);
    expect(result.status).toHaveBeenCalledWith(201);
    expect(result.json).toHaveBeenCalledWith({ created: true, messageId: 'm1' });
  });
});
