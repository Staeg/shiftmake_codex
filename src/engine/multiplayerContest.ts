import { applyCycleOutcomes, applyContestPlayerProgress, applyScheduledUnlockToContestProgress, extractContestPlayerProgress, getContestPlayerProgress, resolveAssignedRifts } from './game';
import { deriveSeed, generateContestCycleRifts } from './rift';
import type {
  ApplyCycleOutcomeResult,
  BattleInput,
  BattleParticipantKind,
  BattleSideParticipants,
  ContestPlayerId,
  ContestPlayerState,
  ContestRiftController,
  GameState,
  ReplayIndexEntry,
  ReplayPayloadWrite,
  ResolvedCombatantDefinition,
  RiftInstance,
  StoredReplayPayload,
} from './types';

export interface ContestReadiness {
  human: boolean;
  ai: boolean;
}

export interface ContestSubmission {
  playerId: ContestPlayerId;
  projectedState: GameState;
}

export interface ContestAdvanceResult {
  state: GameState;
  replayPayloadWrites: ReplayPayloadWrite[];
  resolvedCycle: boolean;
}

export type ContestPlayerNames = Record<ContestPlayerId, string>;

const PLAYER_IDS: ContestPlayerId[] = ['human', 'ai'];
const PLAYER_SEED_SALTS: Record<ContestPlayerId, number> = {
  human: 71_311,
  ai: 131_071,
};

function otherPlayerId(playerId: ContestPlayerId): ContestPlayerId {
  return playerId === 'human' ? 'ai' : 'human';
}

function swapContestPlayerId(playerId: ContestPlayerId | null | undefined): ContestPlayerId | null | undefined {
  if (!playerId) {
    return playerId;
  }
  return otherPlayerId(playerId);
}

function swapContestRiftController(controller: ContestRiftController | undefined): ContestRiftController | undefined {
  if (controller === 'human') {
    return 'ai';
  }
  if (controller === 'ai') {
    return 'human';
  }
  return controller;
}

export const DEFAULT_CONTEST_PLAYER_NAMES: ContestPlayerNames = {
  human: 'Player 1',
  ai: 'Player 2',
};

function getParticipantLabel(participant: BattleSideParticipants[keyof BattleSideParticipants], playerNames: ContestPlayerNames): string {
  return participant.playerId ? playerNames[participant.playerId] : participant.label;
}

function getLocalParticipantKind(
  participant: BattleSideParticipants[keyof BattleSideParticipants],
  localPlayerId: ContestPlayerId,
): BattleParticipantKind {
  if (!participant.playerId) {
    return participant.kind;
  }
  return participant.playerId === localPlayerId ? 'player' : 'opponent';
}

function localizeSideParticipants(
  sideParticipants: BattleSideParticipants | undefined,
  playerId: ContestPlayerId,
  playerNames: ContestPlayerNames = DEFAULT_CONTEST_PLAYER_NAMES,
): BattleSideParticipants | undefined {
  if (!sideParticipants) {
    return sideParticipants;
  }
  return {
    player: {
      ...sideParticipants.player,
      kind: getLocalParticipantKind(sideParticipants.player, playerId),
      label: getParticipantLabel(sideParticipants.player, playerNames),
    },
    enemy: {
      ...sideParticipants.enemy,
      kind: getLocalParticipantKind(sideParticipants.enemy, playerId),
      label: getParticipantLabel(sideParticipants.enemy, playerNames),
    },
  };
}

function shouldSwapBattleSidesForLocalPlayer(sideParticipants: BattleSideParticipants | undefined): boolean {
  return sideParticipants?.enemy.kind === 'player' && sideParticipants.player.kind !== 'player';
}

function withCombatantSide(combatants: ResolvedCombatantDefinition[], side: 'player' | 'enemy'): ResolvedCombatantDefinition[] {
  return combatants.map((combatant) => ({ ...combatant, side }));
}

function swapBattleInputSides(input: BattleInput, sideParticipants: BattleSideParticipants): BattleInput {
  return {
    ...input,
    sideParticipants: {
      player: sideParticipants.enemy,
      enemy: sideParticipants.player,
    },
    playerFactionUpgradeIds: input.enemyFactionUpgradeIds,
    playerTroopTypeUpgradeIds: input.enemyTroopTypeUpgradeIds,
    enemyFactionUpgradeIds: input.playerFactionUpgradeIds,
    enemyTroopTypeUpgradeIds: input.playerTroopTypeUpgradeIds,
    playerCombatants: withCombatantSide(input.enemyCombatants, 'player'),
    enemyCombatants: withCombatantSide(input.playerCombatants, 'enemy'),
  };
}

function projectReplayPayloadForPlayer(
  payload: StoredReplayPayload,
  playerId: ContestPlayerId,
  playerNames: ContestPlayerNames = DEFAULT_CONTEST_PLAYER_NAMES,
): StoredReplayPayload {
  const localizedParticipants = localizeSideParticipants(payload.input.sideParticipants, playerId, playerNames);
  const input = localizedParticipants ? { ...payload.input, sideParticipants: localizedParticipants } : payload.input;
  return {
    ...payload,
    input: shouldSwapBattleSidesForLocalPlayer(localizedParticipants) ? swapBattleInputSides(input, localizedParticipants) : input,
  };
}

export function projectStoredReplayPayloadMapForPlayer(
  replayPayloads: Record<string, StoredReplayPayload>,
  playerId: ContestPlayerId,
  playerNames: ContestPlayerNames = DEFAULT_CONTEST_PLAYER_NAMES,
): Record<string, StoredReplayPayload> {
  return Object.fromEntries(Object.entries(replayPayloads).map(([replayId, replay]) => [replayId, projectReplayPayloadForPlayer(replay, playerId, playerNames)]));
}

function getEncounterLabelFromParticipants(sideParticipants: BattleSideParticipants | undefined): string | undefined {
  if (!sideParticipants) {
    return undefined;
  }
  const left = sideParticipants.player;
  const right = sideParticipants.enemy;
  if (right.kind === 'neutral') {
    return left.kind === 'player' ? right.label : `${left.label} vs ${right.label}`;
  }
  if (left.kind === 'neutral') {
    return right.kind === 'player' ? left.label : `${right.label} vs ${left.label}`;
  }
  return right.kind === 'player' ? left.label : right.label;
}

export function projectReplayIndexForPlayer(
  replayIndex: ReplayIndexEntry[],
  replayPayloads: Record<string, StoredReplayPayload>,
): ReplayIndexEntry[] {
  return replayIndex.map((entry) => {
    const replayPayload = replayPayloads[entry.replayId];
    if (!replayPayload) {
      return entry;
    }
    const playerTroopLabels = replayPayload.input.playerCombatants.map((combatant) => combatant.label);
    const enemyTroopLabels = replayPayload.input.enemyCombatants.map((combatant) => combatant.label);
    const swapped = entry.playerTroopLabels.join('|') !== playerTroopLabels.join('|') && entry.enemyTroopLabels?.join('|') === playerTroopLabels.join('|');
    const outcome = swapped ? (entry.outcome === 'victory' ? 'defeat' : entry.outcome === 'defeat' ? 'victory' : entry.outcome) : entry.outcome;
    const finalPlayerAlive = swapped ? entry.finalEnemyAlive : entry.finalPlayerAlive;
    const finalEnemyAlive = swapped ? entry.finalPlayerAlive : entry.finalEnemyAlive;
    return {
      ...entry,
      outcome,
      sideParticipants: replayPayload.input.sideParticipants,
      encounterLabel: getEncounterLabelFromParticipants(replayPayload.input.sideParticipants) ?? entry.encounterLabel,
      playerTroopLabels,
      enemyTroopLabels,
      finalPlayerAlive,
      finalEnemyAlive,
      summary:
        finalPlayerAlive !== undefined && finalEnemyAlive !== undefined
          ? `${outcome.toUpperCase()} ${finalPlayerAlive}-${finalEnemyAlive}`
          : entry.summary,
    };
  });
}

function projectRiftForOpponent(rift: RiftInstance): RiftInstance {
  const projected: RiftInstance = { ...rift };
  const controller = swapContestRiftController(rift.controller);
  const occupyingPlayerId = swapContestPlayerId(rift.occupyingPlayerId);
  if (controller === undefined) {
    delete projected.controller;
  } else {
    projected.controller = controller;
  }
  if (occupyingPlayerId === undefined) {
    delete projected.occupyingPlayerId;
  } else {
    projected.occupyingPlayerId = occupyingPlayerId;
  }
  return projected;
}

function swapContestPerspective(state: GameState): GameState {
  const human = extractContestPlayerProgress(state);
  const ai = getContestPlayerProgress(state, 'ai');
  return applyContestPlayerProgress(
    {
      ...applyContestPlayerProgress(state, 'human', ai),
      openRifts: state.openRifts.map(projectRiftForOpponent),
      contest: {
        players: {
          ai: human,
        },
        opponentInfo: state.contest?.opponentInfo
          ? {
              cycleNumber: state.contest.opponentInfo.cycleNumber,
              ai: human,
            }
          : null,
      },
    },
    'ai',
    human,
  );
}

export function getContestMultiplayerPlayerSeed(state: Pick<GameState, 'campaignSeed'>, playerId: ContestPlayerId): number {
  return deriveSeed(state.campaignSeed, PLAYER_SEED_SALTS[playerId]);
}

export function projectContestStateForPlayer(state: GameState, playerId: ContestPlayerId): GameState {
  const projected = playerId === 'human' ? state : swapContestPerspective(state);
  return {
    ...projected,
    campaignSeed: getContestMultiplayerPlayerSeed(state, playerId),
  };
}

export function projectContestRoomStateForPlayer(
  state: GameState,
  playerId: ContestPlayerId,
  submissions: Partial<Record<ContestPlayerId, GameState>> = {},
): GameState {
  return submissions[playerId] ?? projectContestStateForPlayer(state, playerId);
}

export function extractSubmissionProgress(submission: ContestSubmission): ContestPlayerState {
  return extractContestPlayerProgress(submission.projectedState);
}

export function mergeContestSubmissions(state: GameState, submissions: Record<ContestPlayerId, GameState>): GameState {
  return PLAYER_IDS.reduce(
    (next, playerId) => applyContestPlayerProgress(next, playerId, extractContestPlayerProgress(submissions[playerId])),
    state,
  );
}

function startSubmittedContest(state: GameState): GameState {
  const withEssence = PLAYER_IDS.reduce((next, playerId) => {
    const progress = getContestPlayerProgress(next, playerId);
    return applyContestPlayerProgress(next, playerId, { ...progress, essence: 2 });
  }, state);

  return {
    ...withEssence,
    phase: 'planning',
    essence: getContestPlayerProgress(withEssence, 'human').essence,
    openRifts: generateContestCycleRifts(withEssence),
  };
}

function clearScheduledUnlockProgress(progress: ContestPlayerState): ContestPlayerState {
  return {
    ...progress,
    activeFactionUnlockOffer: null,
    activeTroopTypeUnlockOffer: null,
  };
}

function buildScheduledUnlockBaseState(state: GameState): GameState {
  if (state.phase !== 'faction_unlock') {
    return state;
  }

  return PLAYER_IDS.reduce(
    (next, playerId) => applyContestPlayerProgress(next, playerId, clearScheduledUnlockProgress(getContestPlayerProgress(next, playerId))),
    {
      ...state,
      phase: 'planning',
      activeFactionUnlockOffer: null,
      activeTroopTypeUnlockOffer: null,
    },
  );
}

function applyScheduledUnlocksToBothPlayers(state: GameState): GameState {
  const base = buildScheduledUnlockBaseState(state);
  const progressByPlayer = Object.fromEntries(
    PLAYER_IDS.map((playerId) => [
      playerId,
      applyScheduledUnlockToContestProgress(
        {
          ...base,
          campaignSeed: getContestMultiplayerPlayerSeed(base, playerId),
        },
        getContestPlayerProgress(base, playerId),
      ),
    ]),
  ) as Record<ContestPlayerId, ContestPlayerState>;

  const next = PLAYER_IDS.reduce((current, playerId) => applyContestPlayerProgress(current, playerId, progressByPlayer[playerId]), base);
  const scheduledPhase = progressByPlayer.human.activeFactionUnlockOffer || progressByPlayer.ai.activeFactionUnlockOffer ? 'faction_unlock' : base.phase;
  return {
    ...next,
    phase: scheduledPhase,
  };
}

function completeNonPlanningHandshake(state: GameState, submissions: Record<ContestPlayerId, GameState>): GameState {
  const merged = mergeContestSubmissions(state, submissions);
  if (state.phase === 'opening_unlock') {
    return startSubmittedContest(merged);
  }

  const bothReturnedToPlanning = PLAYER_IDS.every((playerId) => submissions[playerId].phase === 'planning');
  return bothReturnedToPlanning ? { ...merged, phase: 'planning' } : merged;
}

export function advanceContestMultiplayerRoom(state: GameState, submissions: Record<ContestPlayerId, GameState>): ContestAdvanceResult {
  if (state.gameMode !== 'contest') {
    return { state, replayPayloadWrites: [], resolvedCycle: false };
  }

  if (state.phase !== 'planning') {
    return {
      state: completeNonPlanningHandshake(state, submissions),
      replayPayloadWrites: [],
      resolvedCycle: false,
    };
  }

  const merged = mergeContestSubmissions(state, submissions);
  const aiProgress = getContestPlayerProgress(merged, 'ai');
  const resolution = resolveAssignedRifts(merged, aiProgress);
  const applied: ApplyCycleOutcomeResult = applyCycleOutcomes(merged, resolution);
  return {
    state: applyScheduledUnlocksToBothPlayers(applied.nextState),
    replayPayloadWrites: applied.replayPayloadWrites,
    resolvedCycle: true,
  };
}

export function buildStoredReplayPayloadMap(writes: ReplayPayloadWrite[]): Record<string, StoredReplayPayload> {
  return Object.fromEntries(writes.map((write) => [write.replayId, write.replay]));
}
