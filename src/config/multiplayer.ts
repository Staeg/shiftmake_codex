export const DEFAULT_MULTIPLAYER_SERVER_URL = 'ws://localhost:8787';

function isLocalHost(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(hostname.toLowerCase());
}

function trimDefaultUrlPath(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function normalizeMultiplayerServerUrl(
  value: string | undefined | null,
  fallback = DEFAULT_MULTIPLAYER_SERVER_URL,
): string {
  const trimmed = value?.trim() ?? '';
  return trimmed || fallback;
}

export function getConfiguredMultiplayerServerUrl(
  env: Pick<ImportMetaEnv, 'VITE_MULTIPLAYER_SERVER_URL'> = import.meta.env,
): string {
  return normalizeMultiplayerServerUrl(env.VITE_MULTIPLAYER_SERVER_URL);
}

export function hasConfiguredMultiplayerServerUrl(env: Pick<ImportMetaEnv, 'VITE_MULTIPLAYER_SERVER_URL'> = import.meta.env): boolean {
  return !!env.VITE_MULTIPLAYER_SERVER_URL?.trim();
}

export function inferShareableMultiplayerServerUrl(serverUrl: string | undefined | null, pageUrl: string): string {
  const normalizedServerUrl = normalizeMultiplayerServerUrl(serverUrl);
  try {
    const server = new URL(normalizedServerUrl);
    const page = new URL(pageUrl);
    if (!isLocalHost(server.hostname) || isLocalHost(page.hostname)) {
      return normalizedServerUrl;
    }
    server.hostname = page.hostname;
    return trimDefaultUrlPath(server.toString());
  } catch {
    return normalizedServerUrl;
  }
}
