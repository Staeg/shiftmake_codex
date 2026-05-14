import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MULTIPLAYER_PORT,
  describeMultiplayerListenAddress,
  getMultiplayerServerConfig,
  parseMultiplayerPort,
  parseAllowedOrigins,
} from './multiplayerServerConfig';

describe('multiplayer server config', () => {
  it('defaults the WebSocket server port when none is configured', () => {
    expect(parseMultiplayerPort(undefined)).toBe(DEFAULT_MULTIPLAYER_PORT);
    expect(parseMultiplayerPort('   ')).toBe(DEFAULT_MULTIPLAYER_PORT);
  });

  it('parses an explicit WebSocket server port', () => {
    expect(parseMultiplayerPort(' 9876 ')).toBe(9876);
    expect(getMultiplayerServerConfig({ SHIFTMAKE_MULTIPLAYER_PORT: '9090', SHIFTMAKE_MULTIPLAYER_HOST: '0.0.0.0' })).toEqual({
      port: 9090,
      host: '0.0.0.0',
      allowedOrigins: [],
    });
  });

  it('rejects invalid WebSocket server ports', () => {
    expect(() => parseMultiplayerPort('0')).toThrow('1 to 65535');
    expect(() => parseMultiplayerPort('70000')).toThrow('1 to 65535');
    expect(() => parseMultiplayerPort('not-a-port')).toThrow('1 to 65535');
  });

  it('describes externally reachable bind addresses without implying localhost-only hosting', () => {
    expect(describeMultiplayerListenAddress({ port: 8787, host: undefined, allowedOrigins: [] })).toContain('all interfaces');
    expect(describeMultiplayerListenAddress({ port: 8787, host: '0.0.0.0', allowedOrigins: [] })).toContain('0.0.0.0');
  });

  it('parses comma-separated allowed origins', () => {
    expect(parseAllowedOrigins(' https://one.example,https://two.example ,, ')).toEqual(['https://one.example', 'https://two.example']);
    expect(getMultiplayerServerConfig({ SHIFTMAKE_MULTIPLAYER_ALLOWED_ORIGINS: 'https://shiftmake.example' })).toMatchObject({
      allowedOrigins: ['https://shiftmake.example'],
    });
  });
});
