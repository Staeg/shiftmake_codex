import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MULTIPLAYER_SERVER_URL,
  getConfiguredMultiplayerServerUrl,
  hasConfiguredMultiplayerServerUrl,
  inferShareableMultiplayerServerUrl,
  normalizeMultiplayerServerUrl,
} from './multiplayer';

describe('multiplayer client config', () => {
  it('falls back to localhost only when no URL is configured', () => {
    expect(getConfiguredMultiplayerServerUrl({ VITE_MULTIPLAYER_SERVER_URL: undefined })).toBe(DEFAULT_MULTIPLAYER_SERVER_URL);
    expect(getConfiguredMultiplayerServerUrl({ VITE_MULTIPLAYER_SERVER_URL: '   ' })).toBe(DEFAULT_MULTIPLAYER_SERVER_URL);
  });

  it('uses a configured WebSocket URL after trimming it', () => {
    expect(getConfiguredMultiplayerServerUrl({ VITE_MULTIPLAYER_SERVER_URL: ' ws://192.168.1.20:8787 ' })).toBe('ws://192.168.1.20:8787');
    expect(hasConfiguredMultiplayerServerUrl({ VITE_MULTIPLAYER_SERVER_URL: ' ws://192.168.1.20:8787 ' })).toBe(true);
    expect(hasConfiguredMultiplayerServerUrl({ VITE_MULTIPLAYER_SERVER_URL: '   ' })).toBe(false);
  });

  it('preserves secure WebSocket URLs', () => {
    expect(normalizeMultiplayerServerUrl(' wss://shiftmake.example.com/contest ')).toBe('wss://shiftmake.example.com/contest');
  });

  it('rewrites localhost multiplayer URLs for share links opened through a LAN host', () => {
    expect(inferShareableMultiplayerServerUrl('ws://localhost:8787', 'http://192.168.1.20:5173/?room=ABCD')).toBe('ws://192.168.1.20:8787');
    expect(inferShareableMultiplayerServerUrl('ws://127.0.0.1:8787/contest', 'http://shiftmake-lan:5173/')).toBe('ws://shiftmake-lan:8787/contest');
  });

  it('keeps explicit and local-only multiplayer URLs unchanged for share links', () => {
    expect(inferShareableMultiplayerServerUrl('ws://game-host:8787', 'http://192.168.1.20:5173/')).toBe('ws://game-host:8787');
    expect(inferShareableMultiplayerServerUrl('ws://localhost:8787', 'http://localhost:5173/')).toBe('ws://localhost:8787');
  });
});
