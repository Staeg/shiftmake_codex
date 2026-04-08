import { buildBattleInputFromResolvedCombatants, resolveBattle } from './battle';
import {
  createTroopInstance,
  DEFEAT_RECOVERY,
  getTroopById,
  getTroopsAssignedToRift,
  isFactionUnited,
  resolveTroopCombatant,
  tickRecovery,
  VICTORY_RECOVERY,
} from './army';
import { fixed } from './fixed';
import { createRng } from './rng';
import { deserializeGameState, serializeGameState } from './save';
import { deriveSeed, generateCycleRifts } from './rift';
import { FACTION_UPGRADES, TROOP_TYPE_UPGRADES, ALL_TROOP_UNLOCK_IDS, NATIVE_TROOP_UNLOCK_IDS, getFaction, getMutator, isNativeTroopUnlockId } from './unitCatalog';
import { getClaimableTroopUnlockIds } from './upgrades';
import type {
  ApplyCycleOutcomeResult,
  CycleResolution,
  FactionId,
  GameState,
  ReplayIndexEntry,
  RiftInstance,
  StoredReplayPayload,
  TroopDraftOffer,
  TroopId,
  TroopUnlockId,
  UnitTypeId,
  UpgradeDraftOffer,
  UpgradeId,
  ValidationIssue,
  ValidationResult,
} from './types';

function buildInitialState(seed: number): GameState {
  return {
    version: 3,
    campaignSeed: seed,
    cycleNumber: 1,
    phase: 'opening_unlock',
    essence: 0,
    victoryPoints: 0,
    unlockedFactionIds: [],
    unlockedTroopUnlockIds: [],
    recentTroopUnlockIds: [],
    troops: [],
    factionUpgradeIds: [],
    troopTypeUpgradeIds: [],
    activeTroopOffer: null,
    activeUpgradeOffer: null,
    troopOfferRolls: 0,
    upgradeOfferRolls: 0,
    postgameDismissed: false,
    openRifts: [],
    replayIndex: [],
  };
}

function markExistingRiftsInactive(rifts: RiftInstance[]): RiftInstance[] {
  return rifts.map((rift) => (rift.state === 'discovered' ? { ...rift, state: 'expired' } : rift));
}

function buildReplayIndexEntry(
  cycleNumber: number,
  replay: CycleResolution['records'][number]['replay'],
  estimatedBytes: number,
): ReplayIndexEntry {
  return {
    id: replay.id,
    replayId: replay.id,
    riftId: replay.riftId,
    cycleNumber,
    battleSeed: replay.seed,
    outcome: replay.outcome,
    playerTroopLabels: replay.summary.playerTroops,
    mutatorIds: replay.mutatorIds,
    summary: `${replay.outcome.toUpperCase()} ${replay.summary.finalPlayerAlive}-${replay.summary.finalEnemyAlive}`,
    estimatedBytes,
  };
}

function buildStoredReplayPayload(record: CycleResolution['records'][number]): StoredReplayPayload {
  return {
    version: 1,
    input: record.battleInput,
  };
}

function getOwnedTroopUnlockIds(state: Pick<GameState, 'troops'>): TroopUnlockId[] {
  return state.troops.map((troop) => `${troop.factionId}/${troop.unitTypeId}`);
}

function getOwnedUnitTypeIds(state: Pick<GameState, 'troops'>): UnitTypeId[] {
  return [...new Set(state.troops.map((troop) => troop.unitTypeId))];
}

function addTroopToRoster(state: GameState, troopUnlockId: TroopUnlockId): GameState {
  const [factionId, unitTypeId] = troopUnlockId.split('/') as [FactionId, UnitTypeId];
  if (getOwnedTroopUnlockIds(state).includes(troopUnlockId)) {
    return state;
  }
  return {
    ...state,
    unlockedFactionIds: state.unlockedFactionIds.includes(factionId) ? state.unlockedFactionIds : [...state.unlockedFactionIds, factionId],
    troops: [...state.troops, createTroopInstance(factionId, unitTypeId)],
  };
}

function grantTroopUnlock(state: GameState, troopUnlockId: TroopUnlockId): GameState {
  if (isNativeTroopUnlockId(troopUnlockId) || state.unlockedTroopUnlockIds.includes(troopUnlockId)) {
    return state;
  }

  return {
    ...state,
    unlockedTroopUnlockIds: [...state.unlockedTroopUnlockIds, troopUnlockId],
  };
}

function addUpgradeUnlock(state: GameState, upgradeId: UpgradeId): GameState {
  if (upgradeId in FACTION_UPGRADES) {
    if (state.factionUpgradeIds.includes(upgradeId)) {
      return state;
    }
    return {
      ...state,
      factionUpgradeIds: [...state.factionUpgradeIds, upgradeId],
    };
  }

  if (upgradeId in TROOP_TYPE_UPGRADES) {
    if (state.troopTypeUpgradeIds.includes(upgradeId)) {
      return state;
    }
    return {
      ...state,
      troopTypeUpgradeIds: [...state.troopTypeUpgradeIds, upgradeId],
    };
  }

  return state;
}

function splitTroopUnlockId(troopUnlockId: TroopUnlockId): [FactionId, UnitTypeId] {
  return troopUnlockId.split('/') as [FactionId, UnitTypeId];
}

function getAvailableTroopUnlockIds(state: GameState): TroopUnlockId[] {
  const ownedTroopUnlockIds = new Set(getOwnedTroopUnlockIds(state));
  return getClaimableTroopUnlockIds(state).filter((troopUnlockId) => !ownedTroopUnlockIds.has(troopUnlockId));
}

function getAvailableUpgradeIds(state: GameState): UpgradeId[] {
  return [
    ...Object.values(FACTION_UPGRADES).map((upgrade) => upgrade.id),
    ...Object.values(TROOP_TYPE_UPGRADES).map((upgrade) => upgrade.id),
  ].filter((upgradeId) => !state.factionUpgradeIds.includes(upgradeId) && !state.troopTypeUpgradeIds.includes(upgradeId));
}

function upgradeAffectsTroop(upgradeId: UpgradeId, troopUnlockId: TroopUnlockId): boolean {
  const [factionId, unitTypeId] = splitTroopUnlockId(troopUnlockId);
  return (
    (upgradeId in FACTION_UPGRADES && FACTION_UPGRADES[upgradeId]!.factionId === factionId) ||
    (upgradeId in TROOP_TYPE_UPGRADES && TROOP_TYPE_UPGRADES[upgradeId]!.unitTypeId === unitTypeId)
  );
}

function pickOfferOptions(seed: number, bucketOptions: string[][][], allOptions: string[]): string[] {
  const rng = createRng(seed);
  const selected = new Set<string>();

  bucketOptions.forEach((buckets) => {
    const prioritizedSources = [...buckets, allOptions];
    const source = prioritizedSources.map((bucket) => bucket.filter((optionId) => !selected.has(optionId))).find((bucket) => bucket.length > 0) ?? [];
    if (source.length === 0) {
      return;
    }
    selected.add(rng.pick(source));
  });

  return [...selected];
}

function buildTroopOffer(state: GameState): TroopDraftOffer | null {
  const availableTroopUnlockIds = getAvailableTroopUnlockIds(state);
  if (availableTroopUnlockIds.length === 0) {
    return null;
  }

  const ownedUnitTypeIds = new Set(getOwnedUnitTypeIds(state));
  const ownedFactionIds = new Set(state.unlockedFactionIds);
  const recentTroopUnlockIds = (state.recentTroopUnlockIds ?? []).filter((troopUnlockId) => availableTroopUnlockIds.includes(troopUnlockId));
  const options = pickOfferOptions(
    deriveSeed(state.campaignSeed, state.cycleNumber * 10_001 + state.troopOfferRolls + 1),
    [
      [availableTroopUnlockIds.filter((troopUnlockId) => ownedFactionIds.has(splitTroopUnlockId(troopUnlockId)[0]))],
      [availableTroopUnlockIds.filter((troopUnlockId) => ownedUnitTypeIds.has(splitTroopUnlockId(troopUnlockId)[1]))],
      [recentTroopUnlockIds, availableTroopUnlockIds.filter((troopUnlockId) => !ownedFactionIds.has(splitTroopUnlockId(troopUnlockId)[0]))],
    ],
    availableTroopUnlockIds,
  );

  return options.length > 0 ? { kind: 'troop', optionTroopUnlockIds: options } : null;
}

function buildUpgradeOffer(state: GameState, linkedTroopUnlockId: TroopUnlockId | null = null): UpgradeDraftOffer | null {
  const ownedFactionIds = new Set(state.unlockedFactionIds);
  const ownedUnitTypeIds = new Set(getOwnedUnitTypeIds(state));
  const availableUpgradeIds = getAvailableUpgradeIds(state);

  if (availableUpgradeIds.length === 0) {
    return null;
  }

  const troopUpgradeBucket = availableUpgradeIds.filter(
    (upgradeId) => upgradeId in TROOP_TYPE_UPGRADES && ownedUnitTypeIds.has(TROOP_TYPE_UPGRADES[upgradeId]!.unitTypeId),
  );
  const factionUpgradeBucket = availableUpgradeIds.filter(
    (upgradeId) => upgradeId in FACTION_UPGRADES && ownedFactionIds.has(FACTION_UPGRADES[upgradeId]!.factionId),
  );
  const offBucket = availableUpgradeIds.filter((upgradeId) => !troopUpgradeBucket.includes(upgradeId) && !factionUpgradeBucket.includes(upgradeId));
  const linkedUpgradeBucket = linkedTroopUnlockId
    ? availableUpgradeIds.filter((upgradeId) => upgradeAffectsTroop(upgradeId, linkedTroopUnlockId))
    : [];
  const options = pickOfferOptions(
    deriveSeed(state.campaignSeed, state.cycleNumber * 20_003 + state.upgradeOfferRolls + 1),
    [[troopUpgradeBucket], [factionUpgradeBucket], [linkedUpgradeBucket, offBucket]],
    availableUpgradeIds,
  );

  return options.length > 0 ? { kind: 'upgrade', optionUpgradeIds: options } : null;
}

export function getEssenceDraftCost(state: GameState): number | null {
  if (state.phase !== 'planning' || state.activeTroopOffer || state.activeUpgradeOffer) {
    return null;
  }

  const hasTroopOptions = getAvailableTroopUnlockIds(state).length > 0;
  const hasUpgradeOptions = getAvailableUpgradeIds(state).length > 0;
  if (hasTroopOptions && hasUpgradeOptions) {
    return 2;
  }
  if (hasTroopOptions || hasUpgradeOptions) {
    return 1;
  }
  return null;
}

export function startNewGame(seed = Date.now() >>> 0): GameState {
  return buildInitialState(seed);
}

export function claimOpeningTroop(state: GameState, troopUnlockId: TroopUnlockId): GameState {
  if (state.phase !== 'opening_unlock' || !NATIVE_TROOP_UNLOCK_IDS.includes(troopUnlockId)) {
    return state;
  }

  const nextState = addTroopToRoster(state, troopUnlockId);
  return {
    ...nextState,
    phase: 'planning',
    essence: 2,
    openRifts: generateCycleRifts(nextState),
  };
}

export function revealTroopOffer(state: GameState): GameState {
  if (state.phase !== 'planning' || state.essence < 1 || state.activeTroopOffer || state.activeUpgradeOffer) {
    return state;
  }

  const offer = buildTroopOffer(state);
  if (!offer) {
    return state;
  }

  return {
    ...state,
    essence: state.essence - 1,
    activeTroopOffer: offer,
    troopOfferRolls: state.troopOfferRolls + 1,
  };
}

export function revealUpgradeOffer(state: GameState): GameState {
  if (state.phase !== 'planning' || state.essence < 1 || state.activeTroopOffer || state.activeUpgradeOffer) {
    return state;
  }

  const offer = buildUpgradeOffer(state);
  if (!offer) {
    return state;
  }

  return {
    ...state,
    essence: state.essence - 1,
    activeUpgradeOffer: offer,
    upgradeOfferRolls: state.upgradeOfferRolls + 1,
  };
}

export function revealEssenceDraft(state: GameState): GameState {
  const cost = getEssenceDraftCost(state);
  if (cost === null || state.essence < cost) {
    return state;
  }

  const troopOffer = buildTroopOffer(state);
  const upgradeOffer = buildUpgradeOffer(state, troopOffer?.optionTroopUnlockIds[2] ?? null);
  if (!troopOffer && !upgradeOffer) {
    return state;
  }

  return {
    ...state,
    essence: state.essence - cost,
    activeTroopOffer: troopOffer,
    activeUpgradeOffer: upgradeOffer,
    troopOfferRolls: troopOffer ? state.troopOfferRolls + 1 : state.troopOfferRolls,
    upgradeOfferRolls: upgradeOffer ? state.upgradeOfferRolls + 1 : state.upgradeOfferRolls,
  };
}

export function claimTroopOffer(state: GameState, troopUnlockId: TroopUnlockId): GameState {
  if (!state.activeTroopOffer || !state.activeTroopOffer.optionTroopUnlockIds.includes(troopUnlockId)) {
    return state;
  }

  const unlocked = addTroopToRoster(grantTroopUnlock(state, troopUnlockId), troopUnlockId);
  return {
    ...unlocked,
    activeTroopOffer: null,
  };
}

export function claimUpgradeOffer(state: GameState, upgradeId: UpgradeId): GameState {
  if (!state.activeUpgradeOffer || !state.activeUpgradeOffer.optionUpgradeIds.includes(upgradeId)) {
    return state;
  }

  const unlocked = addUpgradeUnlock(state, upgradeId);
  return {
    ...unlocked,
    activeUpgradeOffer: null,
  };
}

export function validateAssignments(state: GameState): ValidationResult {
  const issues: ValidationIssue[] = [];
  const assignedTroops = state.troops.filter((troop) => troop.assignmentRiftId !== null);

  if (assignedTroops.length === 0) {
    issues.push({ kind: 'no_assignments', message: 'Assign at least one troop before ending the cycle.' });
  }

  const seenTroops = new Set<string>();
  assignedTroops.forEach((troop) => {
    if (seenTroops.has(troop.id)) {
      issues.push({ kind: 'duplicate_assignment', troopId: troop.id, message: 'A troop cannot be assigned twice.' });
    }
    seenTroops.add(troop.id);

    if (troop.recoveryCyclesRemaining > 0) {
      issues.push({
        kind: 'troop_recovering',
        troopId: troop.id,
        message: `${getFaction(troop.factionId).singularLabel} ${troop.unitTypeId} is still recovering.`,
      });
    }
  });

  state.openRifts
    .filter((rift) => rift.state === 'discovered')
    .forEach((rift) => {
      const troops = getTroopsAssignedToRift(state, rift.id);
      const grouped = new Map<FactionId, number>();
      troops.forEach((troop) => grouped.set(troop.factionId, (grouped.get(troop.factionId) ?? 0) + 1));
      grouped.forEach((count, factionId) => {
        if (count > 1 && !isFactionUnited(state, factionId)) {
          issues.push({
            kind: 'same_faction_conflict',
            riftId: rift.id,
            message: `${getFaction(factionId).label} cannot send multiple troops into the same Rift yet.`,
          });
        }
      });
    });

  return { ok: issues.length === 0, issues };
}

export function assignTroopToRift(state: GameState, troopId: TroopId, riftId: string): GameState {
  return {
    ...state,
    troops: state.troops.map((troop) =>
      troop.id === troopId ? { ...troop, assignmentRiftId: troop.assignmentRiftId === riftId ? null : riftId } : troop,
    ),
  };
}

export function clearTroopAssignment(state: GameState, troopId: TroopId): GameState {
  return {
    ...state,
    troops: state.troops.map((troop) => (troop.id === troopId ? { ...troop, assignmentRiftId: null } : troop)),
  };
}

export function resolveAssignedRifts(state: GameState): CycleResolution {
  const records = state.openRifts
    .filter((rift) => rift.state === 'discovered')
    .flatMap((rift) => {
      const troops = getTroopsAssignedToRift(state, rift.id);
      if (troops.length === 0) {
        return [];
      }

      const assignedTroopIds = troops.map((troop) => troop.id).sort((a, b) => a.localeCompare(b));
      const battleSeed = deriveSeed(rift.seed, assignedTroopIds.join('|').split('').reduce((sum, char) => sum + char.charCodeAt(0), 0));
      const battleInput = buildBattleInputFromResolvedCombatants(
        battleSeed,
        rift.id,
        rift.tier,
        rift.mutatorIds,
        rift.saturation,
        troops.map((troop) => resolveTroopCombatant(state, troop, 'player')),
        rift.enemyArmy,
      );
      const replay = resolveBattle(battleInput);

      const recoveryMultiplier = rift.mutatorIds.reduce((multiplier, id) => multiplier * (getMutator(id).recoveryMultiplier ?? 1), 1);
      const recoveryMap = Object.fromEntries(
        troops.map((troop) => [
          troop.id,
          fixed((replay.outcome === 'victory' ? VICTORY_RECOVERY : DEFEAT_RECOVERY) * recoveryMultiplier),
        ]),
      );

      return [
        {
          riftId: rift.id,
          assignedTroopIds,
          battleInput,
          replay,
          outcome: replay.outcome,
          victoryPoints: rift.victoryPoints,
          recoveryMap,
        },
      ];
    });

  return { records };
}

export function applyCycleOutcomes(state: GameState, resolution: CycleResolution): ApplyCycleOutcomeResult {
  const newlyUnlockedTroopUnlockIds = [
    ...new Set(
      resolution.records
        .filter((record) => record.outcome === 'victory')
        .flatMap((record) => record.battleInput.enemyCombatants.map((combatant) => `${combatant.factionId}/${combatant.unitTypeId}` as TroopUnlockId))
        .filter((troopUnlockId) => !isNativeTroopUnlockId(troopUnlockId))
        .filter((troopUnlockId) => !state.unlockedTroopUnlockIds.includes(troopUnlockId))
        .filter((troopUnlockId) => !getOwnedTroopUnlockIds(state).includes(troopUnlockId)),
    ),
  ];

  let unlockedState = state;
  newlyUnlockedTroopUnlockIds.forEach((troopUnlockId) => {
    unlockedState = grantTroopUnlock(unlockedState, troopUnlockId);
  });

  let nextState: GameState = {
    ...unlockedState,
    cycleNumber: unlockedState.cycleNumber + 1,
    essence: unlockedState.essence + 2,
    recentTroopUnlockIds: newlyUnlockedTroopUnlockIds,
    troops: tickRecovery(
      unlockedState.troops.map((troop) => {
        const record = resolution.records.find((entry) => entry.assignedTroopIds.includes(troop.id));
        if (!record) {
          return troop;
        }
        return {
          ...troop,
          assignmentRiftId: null,
          recoveryCyclesRemaining: record.recoveryMap[troop.id] ?? troop.recoveryCyclesRemaining,
        };
      }),
    ),
    openRifts: markExistingRiftsInactive(
      unlockedState.openRifts.map((rift) => {
        const record = resolution.records.find((entry) => entry.riftId === rift.id);
        if (!record) {
          return rift;
        }
        return { ...rift, state: record.outcome === 'victory' ? 'resolved_victory' : 'resolved_defeat' as const };
      }),
    ),
    replayIndex: [...unlockedState.replayIndex],
    activeTroopOffer: null,
    activeUpgradeOffer: null,
  };

  const writes = resolution.records.map((record) => {
    const replay = buildStoredReplayPayload(record);
    return {
      replayId: record.replay.id,
      replay,
      estimatedBytes: JSON.stringify(replay).length,
    };
  });

  resolution.records.forEach((record) => {
    const payload = writes.find((entry) => entry.replayId === record.replay.id);
    nextState.replayIndex = [buildReplayIndexEntry(unlockedState.cycleNumber, record.replay, payload?.estimatedBytes ?? 0), ...nextState.replayIndex];
    if (record.outcome === 'victory') {
      nextState.victoryPoints += record.victoryPoints;
    }
  });

  nextState.phase = unlockedState.cycleNumber === 10 && !unlockedState.postgameDismissed ? 'game_over' : 'planning';
  nextState.openRifts = [...nextState.openRifts, ...generateCycleRifts(nextState)];

  const deletes: { replayId: string }[] = [];
  const kept: ReplayIndexEntry[] = [];
  let totalBytes = 0;
  nextState.replayIndex.forEach((entry) => {
    if (kept.length >= 40 || totalBytes + entry.estimatedBytes > 4_000_000) {
      deletes.push({ replayId: entry.replayId });
      return;
    }
    kept.push(entry);
    totalBytes += entry.estimatedBytes;
  });
  nextState = { ...nextState, replayIndex: kept };

  return {
    nextState,
    replayPayloadWrites: writes,
    replayPayloadDeletes: deletes,
    newlyUnlockedTroopUnlockIds,
  };
}

export function continuePlaying(state: GameState): GameState {
  if (state.phase !== 'game_over') {
    return state;
  }

  return {
    ...state,
    phase: 'planning',
    postgameDismissed: true,
  };
}

export { serializeGameState, deserializeGameState };
