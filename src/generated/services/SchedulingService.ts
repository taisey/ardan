/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateRecordingDatePollRequest } from '../models/CreateRecordingDatePollRequest.js';
import type { CreateRecordingDatePollResponse } from '../models/CreateRecordingDatePollResponse.js';
import type { CancelablePromise } from '../core/CancelablePromise.js';
import { OpenAPI } from '../core/OpenAPI.js';
import { request as __request } from '../core/request.js';
export class SchedulingService {
    /**
     * @returns CreateRecordingDatePollResponse No poll was created because the latest schedule is already processed or absent
     * @throws ApiError
     */
    public static createRecordingDatePoll({
        xInternalApiKey,
        requestBody,
    }: {
        xInternalApiKey: string,
        requestBody: CreateRecordingDatePollRequest,
    }): CancelablePromise<CreateRecordingDatePollResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/recording-date-polls',
            headers: {
                'x-internal-api-key': xInternalApiKey,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Invalid request`,
                401: `Internal caller authentication failed`,
                409: `Request conflicts with the current poll state`,
            },
        });
    }
}
