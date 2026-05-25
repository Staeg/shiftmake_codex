import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawData } from 'ws';
import { claimOpeningTroop, getOpeningFactionStarterTroopUnlockIds, startNewGame } from '../engine/game';
import { buildContestMultiplayerSubmission, projectContestStateForPlayer } from '../engine/multiplayerContest';
import type { GameState, TroopUnlockId } from '../engine/types';
import { contestMultiplayerServerInternals } from './contestMultiplayerServer';

type SnapshotMessage = {
  kind: 'room-snapshot';
  roomId: string;
  playerId: 'human' | 'ai';
  playerToken: string;
  readiness: { human: boolean; ai: boolean };
  connectedPlayers: { human: boolean; ai: boolean };
  playerNames: { human: string; ai: string };
};

type ErrorMessage = {
  kind: 'room-error';
  message: string;
};

type CapturedServerMessage = SnapshotMessage | ErrorMessage;

class FakeSocket {
  readonly OPEN = 1;
  readyState = 1;
  sent: CapturedServerMessage[] = [];
  closeCalls: Array<{ code: number | undefined; reason: string | undefined }> = [];
  pingCalls = 0;

  send(message: string): void {
    this.sent.push(JSON.parse(message) as CapturedServerMessage);
  }

  ping(): void {
    this.pingCalls += 1;
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.closeCalls.push({ code, reason });
  }
}

function sendClientMessage(socket: FakeSocket, message: unknown): void {
  contestMultiplayerServerInternals.handleMessage(socket as never, Buffer.from(JSON.stringify(message)) as RawData);
}

function latestSnapshot(socket: FakeSocket): SnapshotMessage {
  for (let index = socket.sent.length - 1; index >= 0; index -= 1) {
    const message = socket.sent[index];
    if (message?.kind === 'room-snapshot') {
      return message;
    }
  }
  throw new Error('Expected a room snapshot.');
}

function latestError(socket: FakeSocket): ErrorMessage {
  for (let index = socket.sent.length - 1; index >= 0; index -= 1) {
    const message = socket.sent[index];
    if (message?.kind === 'room-error') {
      return message;
    }
  }
  throw new Error('Expected a room error.');
}

function chooseFirstTwoOpeningTroops(state: GameState): GameState {
  const starters = Object.values(getOpeningFactionStarterTroopUnlockIds(state)) as TroopUnlockId[];
  return starters.slice(0, 2).reduce((next, troopUnlockId) => claimOpeningTroop(next, troopUnlockId), state);
}

describe('Contest multiplayer reconnect rooms', () => {
  beforeEach(() => {
    vi.useRealTimers();
    contestMultiplayerServerInternals.rooms.clear();
    contestMultiplayerServerInternals.socketRooms.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a token when player one creates a room', () => {
    const socket = new FakeSocket();

    sendClientMessage(socket, { kind: 'create-room', roomId: 'ROOM1', seed: 1, playerName: 'One' });

    const snapshot = latestSnapshot(socket);
    expect(snapshot.roomId).toBe('ROOM1');
    expect(snapshot.playerId).toBe('human');
    expect(snapshot.playerToken).toEqual(expect.any(String));
    expect(snapshot.playerToken.length).toBeGreaterThan(20);
  });

  it('returns a distinct token when player two joins', () => {
    const playerOne = new FakeSocket();
    const playerTwo = new FakeSocket();
    sendClientMessage(playerOne, { kind: 'create-room', roomId: 'ROOM2', seed: 2, playerName: 'One' });

    sendClientMessage(playerTwo, { kind: 'join-room', roomId: 'ROOM2', playerName: 'Two' });

    const firstSnapshot = latestSnapshot(playerOne);
    const secondSnapshot = latestSnapshot(playerTwo);
    expect(secondSnapshot.playerId).toBe('ai');
    expect(secondSnapshot.playerToken).toEqual(expect.any(String));
    expect(secondSnapshot.playerToken).not.toBe(firstSnapshot.playerToken);
  });

  it('updates the host snapshot with the joining player name', () => {
    const playerOne = new FakeSocket();
    const playerTwo = new FakeSocket();
    sendClientMessage(playerOne, { kind: 'create-room', roomId: 'ROOM16', seed: 16, playerName: 'Ada' });

    sendClientMessage(playerTwo, { kind: 'join-room', roomId: 'ROOM16', playerName: 'Byron' });

    expect(latestSnapshot(playerOne).playerNames).toEqual({ human: 'Ada', ai: 'Byron' });
    expect(latestSnapshot(playerOne).connectedPlayers).toEqual({ human: true, ai: true });
  });

  it('lets a player explicitly leave and frees their seat and name', () => {
    const playerOne = new FakeSocket();
    const playerTwo = new FakeSocket();
    sendClientMessage(playerOne, { kind: 'create-room', roomId: 'ROOM17', seed: 17, playerName: 'Ada' });
    sendClientMessage(playerTwo, { kind: 'join-room', roomId: 'ROOM17', playerName: 'Byron' });

    sendClientMessage(playerTwo, { kind: 'leave-room' });

    const hostSnapshot = latestSnapshot(playerOne);
    expect(hostSnapshot.playerNames).toEqual({ human: 'Ada', ai: 'Player 2' });
    expect(hostSnapshot.connectedPlayers).toEqual({ human: true, ai: false });
    expect(contestMultiplayerServerInternals.rooms.get('ROOM17')?.playerTokens.ai).toBeUndefined();
    expect(contestMultiplayerServerInternals.socketRooms.has(playerTwo as never)).toBe(false);
    expect(playerTwo.closeCalls.at(-1)).toEqual({ code: 1000, reason: 'Left multiplayer room.' });
  });

  it('allows token reconnects after a pre-start disconnect while the seat is still open', () => {
    const playerOne = new FakeSocket();
    sendClientMessage(playerOne, { kind: 'create-room', roomId: 'ROOM3', seed: 3, playerName: 'One' });
    const token = latestSnapshot(playerOne).playerToken;
    contestMultiplayerServerInternals.handleSocketClose(playerOne as never);

    const reconnect = new FakeSocket();
    sendClientMessage(reconnect, { kind: 'reconnect-room', roomId: 'ROOM3', playerId: 'human', token, playerName: 'One Again' });

    const snapshot = latestSnapshot(reconnect);
    expect(snapshot.playerId).toBe('human');
    expect(snapshot.playerNames.human).toBe('One Again');
    expect(snapshot.connectedPlayers.human).toBe(true);
  });

  it('frees a disconnected pre-start seat for any later joiner', () => {
    const playerOne = new FakeSocket();
    const playerTwo = new FakeSocket();
    sendClientMessage(playerOne, { kind: 'create-room', roomId: 'ROOM14', seed: 14, playerName: 'One' });
    sendClientMessage(playerTwo, { kind: 'join-room', roomId: 'ROOM14', playerName: 'Two' });

    contestMultiplayerServerInternals.handleSocketClose(playerTwo as never);

    const replacement = new FakeSocket();
    sendClientMessage(replacement, { kind: 'join-room', roomId: 'ROOM14', playerName: 'Three' });

    const snapshot = latestSnapshot(replacement);
    expect(snapshot.playerId).toBe('ai');
    expect(snapshot.playerNames.ai).toBe('Three');
    expect(snapshot.connectedPlayers).toEqual({ human: true, ai: true });
  });

  it('allows a normal join to claim the host seat after a pre-start host disconnect', () => {
    const playerOne = new FakeSocket();
    sendClientMessage(playerOne, { kind: 'create-room', roomId: 'ROOM15', seed: 15, playerName: 'One' });
    contestMultiplayerServerInternals.handleSocketClose(playerOne as never);

    const replacement = new FakeSocket();
    sendClientMessage(replacement, { kind: 'join-room', roomId: 'ROOM15', playerName: 'Three' });

    const snapshot = latestSnapshot(replacement);
    expect(snapshot.playerId).toBe('human');
    expect(snapshot.playerNames.human).toBe('Three');
  });

  it('rejects reconnects with the wrong token', () => {
    const playerOne = new FakeSocket();
    sendClientMessage(playerOne, { kind: 'create-room', roomId: 'ROOM4', seed: 4, playerName: 'One' });

    const reconnect = new FakeSocket();
    sendClientMessage(reconnect, { kind: 'reconnect-room', roomId: 'ROOM4', playerId: 'human', token: 'wrong-token', playerName: 'Imposter' });

    expect(latestError(reconnect).message).toContain('Could not reconnect');
  });

  it('replacing a socket for the same token preserves that player readiness', () => {
    const playerOne = new FakeSocket();
    sendClientMessage(playerOne, { kind: 'create-room', roomId: 'ROOM5', seed: 5, playerName: 'One' });
    const token = latestSnapshot(playerOne).playerToken;
    const room = contestMultiplayerServerInternals.rooms.get('ROOM5')!;
    sendClientMessage(playerOne, {
      kind: 'submit-ready',
      submission: buildContestMultiplayerSubmission(chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room.game, 'human'))),
    });

    const reconnect = new FakeSocket();
    sendClientMessage(reconnect, { kind: 'reconnect-room', roomId: 'ROOM5', playerId: 'human', token, playerName: 'One' });
    contestMultiplayerServerInternals.handleSocketClose(playerOne as never);

    const snapshot = latestSnapshot(reconnect);
    expect(snapshot.playerId).toBe('human');
    expect(snapshot.readiness.human).toBe(true);
    expect(contestMultiplayerServerInternals.rooms.get('ROOM5')?.clients.human?.socket).toBe(reconnect);
  });

  it('rejects legacy full-state ready submissions', () => {
    const playerOne = new FakeSocket();
    sendClientMessage(playerOne, { kind: 'create-room', roomId: 'ROOM6', seed: 6, playerName: 'One' });

    sendClientMessage(playerOne, { kind: 'submit-ready', game: chooseFirstTwoOpeningTroops(startNewGame(6, 'contest')) });

    expect(latestError(playerOne).message).toContain('Full-state multiplayer submissions');
    expect(contestMultiplayerServerInternals.rooms.get('ROOM6')?.submissions.human).toBeUndefined();
  });

  it('removes empty rooms after the lifecycle TTL', () => {
    const room = contestMultiplayerServerInternals.createRoom(7, 'ROOM7');
    room.lastEmptyAt = 1_000;

    const removed = contestMultiplayerServerInternals.cleanupEmptyRooms(1_000 + contestMultiplayerServerInternals.EMPTY_ROOM_TTL_MS);

    expect(removed).toEqual(['ROOM7']);
    expect(contestMultiplayerServerInternals.rooms.has('ROOM7')).toBe(false);
  });

  it('keeps non-empty rooms during lifecycle cleanup', () => {
    const playerOne = new FakeSocket();
    sendClientMessage(playerOne, { kind: 'create-room', roomId: 'ROOM8', seed: 8, playerName: 'One' });
    const room = contestMultiplayerServerInternals.rooms.get('ROOM8')!;
    room.lastEmptyAt = 1_000;

    const removed = contestMultiplayerServerInternals.cleanupEmptyRooms(1_000 + contestMultiplayerServerInternals.EMPTY_ROOM_TTL_MS * 2);

    expect(removed).toEqual([]);
    expect(contestMultiplayerServerInternals.rooms.has('ROOM8')).toBe(true);
  });

  it('refreshes room updatedAt when a player submits readiness', () => {
    vi.useFakeTimers();
    vi.setSystemTime(2_000);
    const playerOne = new FakeSocket();
    sendClientMessage(playerOne, { kind: 'create-room', roomId: 'ROOM9', seed: 9, playerName: 'One' });
    const room = contestMultiplayerServerInternals.rooms.get('ROOM9')!;
    expect(room.updatedAt).toBe(2_000);

    vi.setSystemTime(5_000);
    sendClientMessage(playerOne, {
      kind: 'submit-ready',
      submission: buildContestMultiplayerSubmission(chooseFirstTwoOpeningTroops(projectContestStateForPlayer(room.game, 'human'))),
    });

    expect(room.updatedAt).toBe(5_000);
  });

  it('reports a friendly error when joining an expired room', () => {
    const room = contestMultiplayerServerInternals.createRoom(10, 'ROOM10');
    room.lastEmptyAt = 1_000;
    const playerTwo = new FakeSocket();

    contestMultiplayerServerInternals.cleanupEmptyRooms(1_000 + contestMultiplayerServerInternals.EMPTY_ROOM_TTL_MS);
    sendClientMessage(playerTwo, { kind: 'join-room', roomId: 'ROOM10', playerName: 'Two' });

    expect(latestError(playerTwo).message).toContain('was not found or has expired');
  });

  it('returns a structured error for malformed JSON', () => {
    const socket = new FakeSocket();

    contestMultiplayerServerInternals.handleMessage(socket as never, Buffer.from('{not-json') as RawData);

    expect(latestError(socket).message).toContain('Malformed JSON');
  });

  it('returns a structured error for unknown message kinds', () => {
    const socket = new FakeSocket();

    sendClientMessage(socket, { kind: 'dance-party' });

    expect(latestError(socket).message).toContain('dance-party');
  });

  it('rejects oversized messages and closes intentionally', () => {
    const socket = new FakeSocket();
    const oversized = Buffer.from('x'.repeat(contestMultiplayerServerInternals.MAX_MESSAGE_BYTES + 1));

    contestMultiplayerServerInternals.handleMessage(socket as never, oversized as RawData);

    expect(latestError(socket).message).toContain('too large');
    expect(socket.closeCalls.at(-1)).toEqual({ code: 1009, reason: 'Multiplayer message is too large.' });
  });

  it('normalizes lowercase room ids for joins', () => {
    const playerOne = new FakeSocket();
    const playerTwo = new FakeSocket();
    sendClientMessage(playerOne, { kind: 'create-room', roomId: 'room11', seed: 11, playerName: 'One' });

    sendClientMessage(playerTwo, { kind: 'join-room', roomId: 'room11', playerName: 'Two' });

    expect(latestSnapshot(playerOne).roomId).toBe('ROOM11');
    expect(latestSnapshot(playerTwo).playerId).toBe('ai');
  });

  it('rejects duplicate requested room ids instead of hijacking an existing room', () => {
    const playerOne = new FakeSocket();
    const attacker = new FakeSocket();
    sendClientMessage(playerOne, { kind: 'create-room', roomId: 'ROOM12', seed: 12, playerName: 'One' });

    sendClientMessage(attacker, { kind: 'create-room', roomId: 'room12', seed: 13, playerName: 'Other' });

    expect(latestError(attacker).message).toContain('already exists');
    expect(contestMultiplayerServerInternals.rooms.get('ROOM12')?.game.campaignSeed).toBe(12);
  });

  it('rate limits noisy sockets with a structured error', () => {
    const socket = new FakeSocket();

    for (let index = 0; index <= contestMultiplayerServerInternals.MAX_MESSAGES_PER_WINDOW; index += 1) {
      sendClientMessage(socket, { kind: 'unsubmit-ready' });
    }

    expect(latestError(socket).message).toContain('Too many');
    expect(socket.closeCalls.at(-1)?.code).toBe(1008);
  });

  it('checks allowed origins when configured', () => {
    expect(contestMultiplayerServerInternals.isOriginAllowed('https://shiftmake.example', ['https://shiftmake.example'])).toBe(true);
    expect(contestMultiplayerServerInternals.isOriginAllowed('https://other.example', ['https://shiftmake.example'])).toBe(false);
    expect(contestMultiplayerServerInternals.isOriginAllowed(undefined, ['https://shiftmake.example'])).toBe(false);
  });

  it('uses forwarded client addresses before proxy socket addresses', () => {
    const request = {
      headers: {
        'x-forwarded-for': '203.0.113.10, 10.0.0.1',
        'x-real-ip': '198.51.100.20',
      },
      socket: {
        remoteAddress: '10.0.0.2',
      },
    };

    expect(contestMultiplayerServerInternals.getRequestClientAddress(request as never)).toBe('203.0.113.10');
  });

  it('falls back through real-ip and socket addresses', () => {
    expect(
      contestMultiplayerServerInternals.getRequestClientAddress({
        headers: { 'x-real-ip': '198.51.100.20' },
        socket: { remoteAddress: '10.0.0.2' },
      } as never),
    ).toBe('198.51.100.20');
    expect(
      contestMultiplayerServerInternals.getRequestClientAddress({
        headers: {},
        socket: { remoteAddress: '10.0.0.2' },
      } as never),
    ).toBe('10.0.0.2');
  });

  it('cleans up idle sockets when heartbeat fails', () => {
    const playerOne = new FakeSocket();
    sendClientMessage(playerOne, { kind: 'create-room', roomId: 'ROOM13', seed: 13, playerName: 'One' });
    contestMultiplayerServerInternals.markSocketAlive(playerOne as never);

    expect(contestMultiplayerServerInternals.checkSocketHeartbeat(playerOne as never)).toBe(true);
    expect(playerOne.pingCalls).toBe(1);
    expect(contestMultiplayerServerInternals.checkSocketHeartbeat(playerOne as never)).toBe(false);

    expect(playerOne.closeCalls.at(-1)?.code).toBe(1001);
    expect(contestMultiplayerServerInternals.rooms.get('ROOM13')?.clients.human).toBeUndefined();
  });
});
