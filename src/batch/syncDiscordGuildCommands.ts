import { DiscordApplicationCommandsClient } from '../clients/discordApplicationCommands.js';
import { loadDiscordCommandConfig } from '../config/env.js';
import { discordCommandDefinitions } from '../discord/commands/index.js';

async function main(): Promise<void> {
  const config = loadDiscordCommandConfig();
  await new DiscordApplicationCommandsClient(config.botToken, config.applicationId, config.guildId).sync(discordCommandDefinitions);
  console.log(`Synced ${discordCommandDefinitions.length} Discord commands to Guild ${config.guildId}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Discord command sync failed');
  process.exitCode = 1;
});
