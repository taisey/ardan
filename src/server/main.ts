import { randomBytes } from 'node:crypto';
import express, { type Request, type Response } from 'express';
import { DiscordClient } from '../clients/discord.js';
import { GoogleSheetsClient } from '../clients/googleSheets.js';
import { loadAppConfig } from '../config/env.js';
import { DiscordInteractionHandler } from '../handlers/discordInteractionHandler.js';
import { GoogleSheetsRecordingScheduleRepository } from '../repositories/recordingSchedule/googleSheetsRecordingScheduleRepository.js';
import { DiscordSchedulingService, todayInTimeZone } from '../services/scheduling/discordSchedulingService.js';
import { createSchedulingController } from './controllers/schedulingController.js';

const config = loadAppConfig();
const discord = new DiscordClient(config.discord.botToken, config.discord.noticeChannelId);
const sheets = new GoogleSheetsClient(config.google.serviceAccount, config.google.spreadsheetId);
const recordingSchedules = new GoogleSheetsRecordingScheduleRepository(sheets);
const service = new DiscordSchedulingService(discord, recordingSchedules, () => todayInTimeZone(config.timezone));
const internalApiKey = randomBytes(32).toString('hex');
const apiBaseUrl = `http://127.0.0.1:${config.port}`;
const interactionHandler = new DiscordInteractionHandler(
  config.discord.publicKey, apiBaseUrl, internalApiKey, config.discord.applicationId,
);
const controller = createSchedulingController(service);
const app = express();

app.post('/interactions', express.raw({ type: 'application/json' }), (request: Request, response: Response) => {
  const rawBody = request.body;
  if (!Buffer.isBuffer(rawBody) || !interactionHandler.verify(
    request.header('X-Signature-Ed25519') ?? undefined,
    request.header('X-Signature-Timestamp') ?? undefined,
    rawBody,
  )) {
    response.status(401).json({ message: 'Invalid Discord request signature' });
    return;
  }
  let interaction: unknown;
  try { interaction = JSON.parse(rawBody.toString('utf8')); }
  catch { response.status(400).json({ message: 'Invalid JSON payload' }); return; }
  const result = interactionHandler.handle(interaction as Parameters<DiscordInteractionHandler['handle']>[0]);
  response.json(result.response);
  if (result.afterResponse) void result.afterResponse();
});

app.use(express.json({ limit: '64kb' }));
app.use('/recording-date-polls', (request, response, next) => {
  if (request.header('x-internal-api-key') !== internalApiKey) {
    response.status(401).json({ message: 'Internal caller authentication failed' });
    return;
  }
  next();
});
app.post('/recording-date-polls', controller.createRecordingDatePoll);

const server = app.listen(config.port, '0.0.0.0', () => console.log(`Listening on port ${config.port}`));
function shutdown(signal: string): void {
  console.log(`Received ${signal}; shutting down`);
  server.close((error) => process.exitCode = error ? 1 : 0);
}
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
