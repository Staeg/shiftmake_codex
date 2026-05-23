export const DEFAULT_MULTIPLAYER_PORT = 8787;

export interface MultiplayerServerConfig {
  port: number;
  host: string | undefined;
  allowedOrigins: string[];
}

export function parseMultiplayerPort(value: string | undefined, fallback = DEFAULT_MULTIPLAYER_PORT): number {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return fallback;
  }

  const port = Number(trimmed);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`SHIFTMAKE_MULTIPLAYER_PORT must be an integer from 1 to 65535; received "${value}".`);
  }

  return port;
}

export function parseMultiplayerHost(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed || undefined;
}

export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getMultiplayerServerConfig(env: NodeJS.ProcessEnv = process.env): MultiplayerServerConfig {
  return {
    port: parseMultiplayerPort(env.SHIFTMAKE_MULTIPLAYER_PORT ?? env.PORT),
    host: parseMultiplayerHost(env.SHIFTMAKE_MULTIPLAYER_HOST),
    allowedOrigins: parseAllowedOrigins(env.SHIFTMAKE_MULTIPLAYER_ALLOWED_ORIGINS),
  };
}

export function describeMultiplayerListenAddress(config: MultiplayerServerConfig): string {
  const bindTarget = config.host ?? 'all interfaces';
  return `Shiftmake Contest multiplayer server listening on port ${config.port} (${bindTarget}). Use ws://<server-host>:${config.port} from other devices.`;
}
