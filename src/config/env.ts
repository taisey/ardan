type Environment = Record<string, string | undefined>;

export type DiscordConfig = {
  publicKey: string;
  botToken: string;
  applicationId: string;
  guildId: string;
  noticeChannelId: string;
};

export type GoogleConfig = {
  spreadsheetId: string;
  serviceAccount: Record<string, unknown>;
};

export type AppConfig = {
  port: number;
  timezone: string;
  discord: DiscordConfig;
  google: GoogleConfig;
};

export type SchedulingConfig = Pick<AppConfig, 'discord' | 'google' | 'timezone'>;

function required(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

function parseServiceAccount(value: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON must be valid JSON');
  }
}

export function loadSchedulingConfig(env: Environment = process.env): SchedulingConfig {
  return {
    timezone: env.TZ?.trim() || 'Asia/Tokyo',
    discord: {
      publicKey: '',
      botToken: required(env, 'DISCORD_BOT_TOKEN'),
      applicationId: '',
      guildId: '',
      noticeChannelId: required(env, 'DISCORD_NOTICE_CHANNEL_ID'),
    },
    google: {
      spreadsheetId: required(env, 'GOOGLE_SPREADSHEET_ID'),
      serviceAccount: parseServiceAccount(required(env, 'GOOGLE_SERVICE_ACCOUNT_JSON')),
    },
  };
}

export function loadAppConfig(env: Environment = process.env): AppConfig {
  const scheduling = loadSchedulingConfig(env);
  return {
    port: parsePort(env.PORT ?? '3000'),
    timezone: scheduling.timezone,
    discord: {
      ...scheduling.discord,
      publicKey: required(env, 'DISCORD_PUBLIC_KEY'),
      applicationId: required(env, 'DISCORD_APPLICATION_ID'),
      guildId: required(env, 'DISCORD_GUILD_ID'),
    },
    google: scheduling.google,
  };
}
