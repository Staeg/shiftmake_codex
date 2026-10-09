import type { ContestPlayerId, GameState, StoredReplayPayload } from '../engine/types';
import type { ContestPlayerNames } from '../engine/multiplayerContest';

export type MultiplayerStatusCode =
  | 'idle'
  | 'notice'
  | 'cycle-submitted'
  | 'cycle-canceled'
  | 'resolving'
  | 'cycle-resolved'
  | 'contest-updated'
  | 'error'
  | 'unknown';

export type MultiplayerServerMessage =
  | {
      kind: 'room-snapshot';
      roomId: string;
      playerId: ContestPlayerId;
      playerToken: string;
      game: GameState;
      cycleEnded: Record<ContestPlayerId, boolean>;
      connectedPlayers?: Record<ContestPlayerId, boolean>;
      playerNames: ContestPlayerNames;
      replayPayloads: Record<string, StoredReplayPayload>;
      message: string | null;
      statusCode?: MultiplayerStatusCode;
    }
  | { kind: 'room-error'; message: string; statusCode?: 'error' };

const statusCodes: Record<MultiplayerStatusCode, true> = {
  idle: true,
  notice: true,
  'cycle-submitted': true,
  'cycle-canceled': true,
  resolving: true,
  'cycle-resolved': true,
  'contest-updated': true,
  error: true,
  unknown: true,
};

// Remove this adapter when deployments require statusCode-capable servers.
const legacyStatuses = new Map<string, MultiplayerStatusCode>([
  ['Cycle ended. Waiting for the other player.', 'cycle-submitted'],
  ['Cycle end canceled.', 'cycle-canceled'],
  ['Both players submitted. Resolving...', 'resolving'],
  ['Both players submitted. Cycle resolved.', 'cycle-resolved'],
  ['Both players submitted. Contest updated.', 'contest-updated'],
]);

export function multiplayerStatusCode(message: Pick<Extract<MultiplayerServerMessage, { kind: 'room-snapshot' }>, 'message'> & { statusCode?: unknown }): MultiplayerStatusCode {
  if (message.statusCode !== undefined) {
    return typeof message.statusCode === 'string' && Object.hasOwn(statusCodes, message.statusCode)
      ? message.statusCode as MultiplayerStatusCode
      : 'unknown';
  }
  return message.message === null ? 'idle' : legacyStatuses.get(message.message) ?? 'unknown';
}

export function isRoutineMultiplayerStatus(code: MultiplayerStatusCode): boolean {
  return code === 'cycle-submitted' || code === 'cycle-canceled' || code === 'cycle-resolved' || code === 'contest-updated';
}
