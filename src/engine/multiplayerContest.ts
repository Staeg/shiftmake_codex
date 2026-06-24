import {
  applyCycleOutcomes,
  applyContestPlayerProgress,
  applyScheduledUnlockToContestProgress,
  assignTroopToRift,
  claimRaceUnlockOffer,
  claimOpeningTroop,
  claimTroopOffer,
  claimTroopClassUnlockOffer,
  claimUpgradeOffer,
  clearTroopAssignment,
  extractContestPlayerProgress,
  getEssenceDraftCost,
  getContestPlayerProgress,
  revealEssenceDraft,
  resolveAssignedRifts,
  validateAssignments,
} from './game';
import { deriveSeed, generateContestCycleRifts } from './rift';
import type {
  ApplyCycleOutcomeResult,
  BattleInput,
  BattleParticipantKind,
  BattleSideParticipants,
  ContestPlayerId,
  ContestPlayerState,
  ContestRiftController,
  RaceId,
  GameState,
  TroopId,
  TroopUnlockId,
  UpgradeId,
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

export interface ContestTroopAssignmentSubmission {
  troopId: TroopId;
  riftId: string | null;
}

export interface ContestMultiplayerSubmission {
  kind: 'contest-submission';
  cycleNumber: number;
  phase: GameState['phase'];
  selectedStartingTroopUnlockIds: TroopUnlockId[];
  selectedRaceIds: RaceId[];
  selectedTroopUnlockIds: TroopUnlockId[];
  selectedUpgradeIds: UpgradeId[];
  troopAssignments: ContestTroopAssignmentSubmission[];
  endCycleConfirmed: boolean;
}

export interface ContestSubmissionValidationResult {
  ok: boolean;
  projectedState?: GameState;
  error?: string;
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
    playerRaceUpgradeIds: input.enemyRaceUpgradeIds,
    playerTroopClassUpgradeIds: input.enemyTroopClassUpgradeIds,
    enemyRaceUpgradeIds: input.playerRaceUpgradeIds,
    enemyTroopClassUpgradeIds: input.playerTroopClassUpgradeIds,
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

function outcomeFromFinalAliveCounts(
  finalPlayerAlive: number | undefined,
  finalEnemyAlive: number | undefined,
  fallback: ReplayIndexEntry['outcome'],
): ReplayIndexEntry['outcome'] {
  if (finalPlayerAlive === undefined || finalEnemyAlive === undefined) {
    return fallback;
  }
  if (finalPlayerAlive > 0 && finalEnemyAlive <= 0) {
    return 'victory';
  }
  if (finalEnemyAlive > 0 && finalPlayerAlive <= 0) {
    return 'defeat';
  }
  if (finalPlayerAlive <= 0 && finalEnemyAlive <= 0) {
    return 'draw';
  }
  return fallback;
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
    const finalPlayerAlive = swapped ? entry.finalEnemyAlive : entry.finalPlayerAlive;
    const finalEnemyAlive = swapped ? entry.finalPlayerAlive : entry.finalEnemyAlive;
    const finalPlayerHp = swapped ? entry.finalEnemyHp : entry.finalPlayerHp;
    const finalPlayerMaxHp = swapped ? entry.finalEnemyMaxHp : entry.finalPlayerMaxHp;
    const finalEnemyHp = swapped ? entry.finalPlayerHp : entry.finalEnemyHp;
    const finalEnemyMaxHp = swapped ? entry.finalPlayerMaxHp : entry.finalEnemyMaxHp;
    const outcome = outcomeFromFinalAliveCounts(
      finalPlayerAlive,
      finalEnemyAlive,
      swapped ? (entry.outcome === 'victory' ? 'defeat' : entry.outcome === 'defeat' ? 'victory' : entry.outcome) : entry.outcome,
    );
    return {
      ...entry,
      outcome,
      sideParticipants: replayPayload.input.sideParticipants,
      encounterLabel: getEncounterLabelFromParticipants(replayPayload.input.sideParticipants) ?? entry.encounterLabel,
      playerTroopLabels,
      enemyTroopLabels,
      finalPlayerAlive,
      finalEnemyAlive,
      finalPlayerHp,
      finalPlayerMaxHp,
      finalEnemyHp,
      finalEnemyMaxHp,
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

function troopUnlockIdFromTroop(troop: GameState['troops'][number]): TroopUnlockId {
  return `${troop.raceId}/${troop.unitClassId}` as TroopUnlockId;
}

function uniqueInOrder<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function buildContestMultiplayerSubmission(state: GameState): ContestMultiplayerSubmission {
  return {
    kind: 'contest-submission',
    cycleNumber: state.cycleNumber,
    phase: state.phase,
    selectedStartingTroopUnlockIds: uniqueInOrder(state.troops.map(troopUnlockIdFromTroop)),
    selectedRaceIds: uniqueInOrder(state.unlockedRaceIds),
    selectedTroopUnlockIds: uniqueInOrder(state.troops.map(troopUnlockIdFromTroop)),
    selectedUpgradeIds: uniqueInOrder([...state.raceUpgradeIds, ...state.troopClassUpgradeIds]),
    troopAssignments: state.troops.map((troop) => ({ troopId: troop.id, riftId: troop.assignmentRiftId })),
    endCycleConfirmed: state.phase === 'planning',
  };
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

function additionalSelectedIds<T extends string>(baseIds: T[], submittedIds: T[]): T[] {
  const base = new Set(baseIds);
  return uniqueInOrder(submittedIds).filter((id) => !base.has(id));
}

function rejectSubmission(message: string): ContestSubmissionValidationResult {
  return { ok: false, error: message };
}

function applyOpeningSubmission(projected: GameState, submission: ContestMultiplayerSubmission): ContestSubmissionValidationResult {
  if (submission.phase !== 'opening_unlock') {
    return rejectSubmission('That submission is for the wrong phase.');
  }
  if (submission.selectedUpgradeIds.length > 0 || submission.troopAssignments.some((assignment) => assignment.riftId !== null)) {
    return rejectSubmission('Opening submissions can only choose starting troops.');
  }

  let next = { ...projected, troops: [], unlockedRaceIds: [] };
  for (const troopUnlockId of uniqueInOrder(submission.selectedStartingTroopUnlockIds)) {
    const applied = claimOpeningTroop(next, troopUnlockId);
    if (applied === next) {
      return rejectSubmission(`Opening troop ${troopUnlockId} is not a legal starting choice.`);
    }
    next = applied;
  }
  if (next.troops.length !== 2) {
    return rejectSubmission('Choose exactly two legal starting troops.');
  }
  return { ok: true, projectedState: next };
}

function applyScheduledRaceSubmission(projected: GameState, submission: ContestMultiplayerSubmission): ContestSubmissionValidationResult {
  if (submission.troopAssignments.some((assignment) => assignment.riftId !== null)) {
    return rejectSubmission('Troops cannot be assigned during a scheduled unlock.');
  }
  const selectedRaceIds = additionalSelectedIds(projected.unlockedRaceIds, submission.selectedRaceIds);
  if (selectedRaceIds.length !== 1) {
    return rejectSubmission('Choose exactly one scheduled race unlock.');
  }
  const next = claimRaceUnlockOffer(projected, selectedRaceIds[0]!);
  if (next === projected) {
    return rejectSubmission(`Race ${selectedRaceIds[0]} is not a legal scheduled unlock.`);
  }
  return { ok: true, projectedState: next };
}

function applyScheduledTroopClassSubmission(projected: GameState, submission: ContestMultiplayerSubmission): ContestSubmissionValidationResult {
  if (submission.troopAssignments.some((assignment) => assignment.riftId !== null)) {
    return rejectSubmission('Troops cannot be assigned during a scheduled unlock.');
  }

  let next = projected;
  const selectedTroopUnlockIds = additionalSelectedIds(projected.troops.map(troopUnlockIdFromTroop), submission.selectedTroopUnlockIds);
  for (const troopUnlockId of selectedTroopUnlockIds) {
    const applied = claimTroopClassUnlockOffer(next, troopUnlockId);
    if (applied === next) {
      return rejectSubmission(`Troop class ${troopUnlockId} is not a legal scheduled unlock.`);
    }
    next = applied;
  }
  if (next.phase === 'troop_class_unlock') {
    return rejectSubmission('Finish all scheduled troop class choices before submitting.');
  }
  return { ok: true, projectedState: next };
}

function applyPlanningDraftChoices(projected: GameState, submission: ContestMultiplayerSubmission): ContestSubmissionValidationResult {
  let next = projected;
  const troopChoices = additionalSelectedIds(projected.troops.map(troopUnlockIdFromTroop), submission.selectedTroopUnlockIds);
  const upgradeChoices = additionalSelectedIds([...projected.raceUpgradeIds, ...projected.troopClassUpgradeIds], submission.selectedUpgradeIds);
  let guard = 0;

  while (troopChoices.length > 0 || upgradeChoices.length > 0) {
    guard += 1;
    if (guard > 20) {
      return rejectSubmission('Too many draft choices were submitted.');
    }

    if (!next.activeTroopOffer && !next.activeUpgradeOffer) {
      const revealed = revealEssenceDraft(next);
      if (revealed === next) {
        return rejectSubmission('Submitted draft choices cannot be paid for or revealed legally.');
      }
      next = revealed;
    }

    let changed = false;
    const troopChoiceIndex = troopChoices.findIndex((troopUnlockId) => next.activeTroopOffer?.optionTroopUnlockIds.includes(troopUnlockId));
    if (troopChoiceIndex >= 0) {
      const troopUnlockId = troopChoices.splice(troopChoiceIndex, 1)[0]!;
      const applied = claimTroopOffer(next, troopUnlockId);
      if (applied === next) {
        return rejectSubmission(`Troop draft choice ${troopUnlockId} is not legal.`);
      }
      next = applied;
      changed = true;
    }

    const upgradeChoiceIndex = upgradeChoices.findIndex((upgradeId) => next.activeUpgradeOffer?.optionUpgradeIds.includes(upgradeId));
    if (upgradeChoiceIndex >= 0) {
      const upgradeId = upgradeChoices.splice(upgradeChoiceIndex, 1)[0]!;
      const applied = claimUpgradeOffer(next, upgradeId);
      if (applied === next) {
        return rejectSubmission(`Upgrade draft choice ${upgradeId} is not legal.`);
      }
      next = applied;
      changed = true;
    }

    if (!changed) {
      return rejectSubmission('Submitted draft choices do not match the legal offers.');
    }
  }

  return { ok: true, projectedState: next };
}

function applyPlanningAssignments(projected: GameState, submission: ContestMultiplayerSubmission): ContestSubmissionValidationResult {
  const heldTroopIds = new Set(
    projected.openRifts
      .filter((rift) => rift.controller === 'human')
      .flatMap((rift) => rift.occupyingTroopIds ?? []),
  );
  let next = projected.troops.reduce(
    (current, troop) => (troop.assignmentRiftId && !heldTroopIds.has(troop.id) ? clearTroopAssignment(current, troop.id) : current),
    projected,
  );
  const knownTroopIds = new Set(next.troops.map((troop) => troop.id));
  const submittedTroopIds = new Set<TroopId>();

  for (const assignment of submission.troopAssignments) {
    if (!knownTroopIds.has(assignment.troopId)) {
      return rejectSubmission(`Unknown troop ${assignment.troopId} in submission.`);
    }
    if (submittedTroopIds.has(assignment.troopId)) {
      return rejectSubmission(`Troop ${assignment.troopId} was submitted more than once.`);
    }
    submittedTroopIds.add(assignment.troopId);
    if (!assignment.riftId) {
      continue;
    }
    if (heldTroopIds.has(assignment.troopId)) {
      const heldTroop = next.troops.find((troop) => troop.id === assignment.troopId);
      if (heldTroop?.assignmentRiftId === assignment.riftId) {
        continue;
      }
    }
    const applied = assignTroopToRift(next, assignment.troopId, assignment.riftId);
    if (applied === next) {
      return rejectSubmission(`Assignment of ${assignment.troopId} to Rift ${assignment.riftId} is not legal.`);
    }
    next = applied;
  }

  const assignmentValidation = validateAssignments(next);
  const softIssueKinds = new Set(['no_troops_assigned', 'idle_troops_remaining', 'holding_only_no_new_attack']);
  const blockingIssue = assignmentValidation.issues.find((issue) => !softIssueKinds.has(issue.kind));
  if (blockingIssue && next.troops.some((troop) => troop.assignmentRiftId !== null)) {
    return rejectSubmission(blockingIssue.message);
  }
  return { ok: true, projectedState: next };
}

function applyPlanningSubmission(projected: GameState, submission: ContestMultiplayerSubmission): ContestSubmissionValidationResult {
  if (submission.phase !== 'planning' || !submission.endCycleConfirmed) {
    return rejectSubmission('Planning submissions must explicitly end the cycle.');
  }
  const extraRaceIds = additionalSelectedIds(projected.unlockedRaceIds, submission.selectedRaceIds);
  if (extraRaceIds.length > 0) {
    return rejectSubmission('Race unlocks cannot be submitted during planning.');
  }

  const draft = applyPlanningDraftChoices(projected, submission);
  if (!draft.ok || !draft.projectedState) {
    return draft;
  }
  if (
    (draft.projectedState.essence > 0 && getEssenceDraftCost(draft.projectedState) !== null) ||
    draft.projectedState.activeTroopOffer ||
    draft.projectedState.activeUpgradeOffer
  ) {
    return rejectSubmission('Spend all Essence and finish the active draft before submitting ready.');
  }
  return applyPlanningAssignments(draft.projectedState, submission);
}

export function validateAndApplyContestSubmission(
  state: GameState,
  playerId: ContestPlayerId,
  submission: ContestMultiplayerSubmission,
): ContestSubmissionValidationResult {
  if (submission.kind !== 'contest-submission') {
    return rejectSubmission('Unknown multiplayer submission type.');
  }
  if (state.gameMode !== 'contest') {
    return rejectSubmission('Contest submissions can only be used in Contest rooms.');
  }
  if (submission.cycleNumber !== state.cycleNumber) {
    return rejectSubmission('That submission is from an old cycle. Refresh the room and try again.');
  }

  const projected = projectContestStateForPlayer(state, playerId);
  if (state.phase === 'opening_unlock') {
    return applyOpeningSubmission(projected, submission);
  }
  if (state.phase === 'race_unlock') {
    return applyScheduledRaceSubmission(projected, submission);
  }
  if (state.phase === 'troop_class_unlock') {
    return applyScheduledTroopClassSubmission(projected, submission);
  }
  if (state.phase === 'planning') {
    return applyPlanningSubmission(projected, submission);
  }
  return rejectSubmission('Submissions are not accepted in the current phase.');
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
    activeRaceUnlockOffer: null,
    activeTroopClassUnlockOffer: null,
  };
}

function buildScheduledUnlockBaseState(state: GameState): GameState {
  if (state.phase !== 'race_unlock') {
    return state;
  }

  return PLAYER_IDS.reduce(
    (next, playerId) => applyContestPlayerProgress(next, playerId, clearScheduledUnlockProgress(getContestPlayerProgress(next, playerId))),
    {
      ...state,
      phase: 'planning',
      activeRaceUnlockOffer: null,
      activeTroopClassUnlockOffer: null,
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
  const scheduledPhase = progressByPlayer.human.activeRaceUnlockOffer || progressByPlayer.ai.activeRaceUnlockOffer ? 'race_unlock' : base.phase;
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
