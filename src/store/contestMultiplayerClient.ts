import type { GameState, StoredReplayPayload } from '../engine/types';
import type { ContestPlayerNames } from '../engine/multiplayerContest';

export interface MultiplayerSession {
  connected: boolean;
  serverUrl: string;
  roomId: string | null;
  playerId: 'playerOne' | 'playerTwo' | null;
  playerToken: string | null;
  cycleEnded: { playerOne: boolean; playerTwo: boolean };
  connectedPlayers: { playerOne: boolean; playerTwo: boolean };
  playerNames: ContestPlayerNames;
  message: string | null;
}

export type MultiplayerServerMessage =
  | {
      kind: 'room-snapshot';
      roomId: string;
      playerId: 'playerOne' | 'playerTwo';
      playerToken: string;
      game: GameState;
      cycleEnded: { playerOne: boolean; playerTwo: boolean };
      connectedPlayers?: { playerOne: boolean; playerTwo: boolean };
      playerNames: ContestPlayerNames;
      replayPayloads: Record<string, StoredReplayPayload>;
      message: string | null;
    }
  | { kind: 'room-error'; message: string };

export interface StoredMultiplayerIdentity {
  serverUrl: string;
  roomId: string;
  playerId: 'playerOne' | 'playerTwo';
  playerToken: string;
}

type ConnectOptions = {
  serverUrl: string;
  roomId?: string;
  playerName?: string;
  onMessage: (message: MultiplayerServerMessage, previousReplayPayloads: Record<string, StoredReplayPayload>) => void;
  onClose: (shouldReconnect: boolean) => void;
  onError: () => void;
};

const MULTIPLAYER_IDENTITY_KEY_PREFIX = 'shiftmake:multiplayer:contest:identity:';
const MULTIPLAYER_LAST_PLAYER_NAME_KEY = 'shiftmake:multiplayer:contest:last-player-name';
const MULTIPLAYER_LAST_SERVER_URL_KEY = 'shiftmake:multiplayer:contest:last-server-url';

let multiplayerSocket: WebSocket | null = null;
let multiplayerReplayPayloads: Record<string, StoredReplayPayload> = {};
let intentionallyClosedMultiplayerSocket = false;

function multiplayerIdentityStorageKey(serverUrl: string, roomId: string): string {
  return `${MULTIPLAYER_IDENTITY_KEY_PREFIX}${serverUrl}|${roomId}`;
}

export function readStoredMultiplayerIdentity(serverUrl: string, roomId: string | undefined): StoredMultiplayerIdentity | null {
  if (!roomId || typeof sessionStorage === 'undefined') {
    return null;
  }
  try {
    const raw = sessionStorage.getItem(multiplayerIdentityStorageKey(serverUrl, roomId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredMultiplayerIdentity>;
    if (
      parsed.serverUrl === serverUrl &&
      parsed.roomId === roomId &&
      (parsed.playerId === 'playerOne' || parsed.playerId === 'playerTwo') &&
      typeof parsed.playerToken === 'string' &&
      parsed.playerToken
    ) {
      return {
        serverUrl,
        roomId,
        playerId: parsed.playerId,
        playerToken: parsed.playerToken,
      };
    }
  } catch {
    return null;
  }
  return null;
}

function writeStoredMultiplayerIdentity(identity: StoredMultiplayerIdentity): void {
  if (typeof sessionStorage === 'undefined') {
    return;
  }
  try {
    sessionStorage.setItem(multiplayerIdentityStorageKey(identity.serverUrl, identity.roomId), JSON.stringify(identity));
  } catch {
    // Session storage is a convenience for refresh reconnects; live memory still has the token.
  }
}

function readStoredString(key: string): string | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const value = localStorage.getItem(key)?.trim() ?? '';
    return value || null;
  } catch {
    return null;
  }
}

function writeStoredString(key: string, value: string | undefined): void {
  if (typeof localStorage === 'undefined') {
    return;
  }
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    return;
  }
  try {
    localStorage.setItem(key, trimmed);
  } catch {
    // Multiplayer preferences are convenience-only and should never block room flow.
  }
}

function persistMultiplayerPreferences(serverUrl: string, playerName?: string): void {
  writeStoredString(MULTIPLAYER_LAST_SERVER_URL_KEY, serverUrl);
  writeStoredString(MULTIPLAYER_LAST_PLAYER_NAME_KEY, playerName);
}

export function readLastMultiplayerPlayerName(): string | null {
  return readStoredString(MULTIPLAYER_LAST_PLAYER_NAME_KEY);
}

export function readLastMultiplayerServerUrl(): string | null {
  return readStoredString(MULTIPLAYER_LAST_SERVER_URL_KEY);
}

export function connectContestMultiplayer(options: ConnectOptions): void {
  closeContestMultiplayerSocket();
  intentionallyClosedMultiplayerSocket = false;
  multiplayerReplayPayloads = {};
  persistMultiplayerPreferences(options.serverUrl, options.playerName);
  const storedIdentity = readStoredMultiplayerIdentity(options.serverUrl, options.roomId);
  const socket = new WebSocket(options.serverUrl);
  multiplayerSocket = socket;

  socket.onopen = () => {
    socket.send(
      JSON.stringify(
        storedIdentity
          ? { kind: 'reconnect-room', roomId: storedIdentity.roomId, playerId: storedIdentity.playerId, token: storedIdentity.playerToken, playerName: options.playerName }
          : options.roomId
            ? { kind: 'join-room', roomId: options.roomId, playerName: options.playerName }
            : { kind: 'create-room', playerName: options.playerName },
      ),
    );
  };

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data) as MultiplayerServerMessage;
    if (message.kind === 'room-snapshot') {
      const previousMultiplayerReplayPayloads = multiplayerReplayPayloads;
      multiplayerReplayPayloads = {
        ...multiplayerReplayPayloads,
        ...message.replayPayloads,
      };
      writeStoredMultiplayerIdentity({
        serverUrl: options.serverUrl,
        roomId: message.roomId,
        playerId: message.playerId,
        playerToken: message.playerToken,
      });
      options.onMessage(message, previousMultiplayerReplayPayloads);
      return;
    }

    options.onMessage(message, multiplayerReplayPayloads);
  };

  socket.onclose = () => {
    options.onClose(!intentionallyClosedMultiplayerSocket);
  };

  socket.onerror = () => {
    options.onError();
  };
}

export function closeContestMultiplayerSocket(options: { notifyServer: boolean } = { notifyServer: false }): void {
  intentionallyClosedMultiplayerSocket = true;
  const socket = multiplayerSocket;
  multiplayerSocket = null;
  if (!socket) {
    return;
  }
  if (options.notifyServer && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ kind: 'leave-room' }));
  }
  socket.onopen = null;
  socket.onmessage = null;
  socket.onclose = null;
  socket.onerror = null;
  socket.close();
}

export function clearContestMultiplayerReplayPayloads(): void {
  multiplayerReplayPayloads = {};
}

export function isContestMultiplayerSocketOpen(): boolean {
  return !!multiplayerSocket && multiplayerSocket.readyState === WebSocket.OPEN;
}

export function sendContestMultiplayerMessage(message: unknown): void {
  multiplayerSocket?.send(JSON.stringify(message));
}

export function readContestMultiplayerReplayPayload(replayId: string): StoredReplayPayload | null {
  return multiplayerReplayPayloads[replayId] ?? null;
}

export function hasContestMultiplayerReplayPayload(replayId: string): boolean {
  return !!multiplayerReplayPayloads[replayId];
}
