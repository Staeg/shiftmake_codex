import { resolveBattle, buildBattleInputFromResolvedCombatants } from './battle';
import {
  canUpgradeStat,
  createTroopInstance,
  DEFEAT_RECOVERY,
  getFactionTroops,
  getFactionUnlockCost,
  getTroopAddUnitCost,
  getTroopById,
  getTroopEffectiveDefinition,
  getTroopStatUpgradeCost,
  getTroopUnlockCost,
  getTroopsAssignedToRift,
  isFactionUnited,
  resolveTroopCombatant,
  tickRecovery,
  VICTORY_RECOVERY,
} from './army';
import { fixed } from './fixed';
import { deriveSeed, enrichRiftRewards, generateCycleRifts, getBlueprintRewardPool } from './rift';
import { deserializeGameState, serializeGameState } from './save';
import { buildBlueprintRewardChoice, buildRewardChoice } from './upgrades';
import { FACTION_UPGRADES, FACTIONS, TROOP_TYPE_UPGRADES, getFaction, getFactionUpgrade, getMutator, getTroopTypeUpgrade, getTroopUnlockId, getUnitType } from './unitCatalog';
import type {
  ApplyCycleOutcomeResult,
  CycleResolution,
  FactionId,
  GameState,
  ReplayIndexEntry,
  RewardChoice,
  RiftInstance,
  StoredReplayPayload,
  TroopId,
  TroopStatKey,
  TroopUnlockId,
  UnitTypeId,
  ValidationIssue,
  ValidationResult,
} from './types';

function allFactionIds(): FactionId[] {
  return Object.keys(FACTIONS) as FactionId[];
}

export function getStartingFactionUnitType(factionId: FactionId) {
  return (
    {
      human: 'soldier',
      elf: 'archer',
      goblin: 'militia',
      troll: 'soldier',
    } as const
  )[factionId];
}

function getRewardUpgradePool(state: GameState): string[] {
  return Object.values(FACTION_UPGRADES)
    .filter((upgrade) => !state.factionUpgradeIds.includes(upgrade.id))
    .filter((upgrade) => state.unlockedFactionIds.includes(upgrade.factionId))
    .map((upgrade) => upgrade.id);
}

function getRewardBlueprintPool(state: GameState): TroopUnlockId[] {
  return getBlueprintRewardPool().filter((troopUnlockId) => !state.unlockedBlueprintTroopIds.includes(troopUnlockId));
}

function canUnlockTroopType(state: GameState, factionId: FactionId, unitTypeId: UnitTypeId): boolean {
  const faction = getFaction(factionId);
  if (faction.defaultUnitTypeIds.includes(unitTypeId)) {
    return true;
  }
  return state.unlockedBlueprintTroopIds.includes(getTroopUnlockId(factionId, unitTypeId));
}

function buildInitialState(seed: number, options?: { cheatUpgrades?: boolean; cheatBlueprints?: boolean; cheatResources?: boolean }): GameState {
  const cheatUpgrades = options?.cheatUpgrades ?? false;
  const cheatBlueprints = options?.cheatBlueprints ?? false;
  const cheatResources = options?.cheatResources ?? false;
  return {
    version: 1,
    campaignSeed: seed,
    cycleNumber: 1,
    phase: 'faction_draft',
    cheatUpgrades,
    cheatBlueprints,
    cheatResources,
    resources: { gold: cheatResources ? 1120 : 120, essence: cheatResources ? 1120 : 120 },
    unlockedFactionIds: [],
    availableFactionDraft: allFactionIds(),
    troops: [],
    factionUpgradeIds: [],
    troopTypeUpgradeIds: [],
    unlockedBlueprintTroopIds: cheatBlueprints ? getBlueprintRewardPool() : [],
    openRifts: [],
    pendingRewardChoices: [],
    replayIndex: [],
  };
}

function markExistingRiftsInactive(rifts: RiftInstance[]): RiftInstance[] {
  return rifts.map((rift) => (rift.state === 'discovered' ? { ...rift, state: 'expired' } : rift));
}

function nextTroopIndex(state: GameState, factionId: FactionId, unitTypeId: string): number {
  return state.troops.filter((troop) => troop.factionId === factionId && troop.unitTypeId === unitTypeId).length + 1;
}

function buildReplayIndexEntry(cycleNumber: number, replay: CycleResolution['records'][number]['replay']): ReplayIndexEntry {
  const estimatedBytes = JSON.stringify(replay).length;
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

function buildRewardChoicesForRift(
  state: GameState,
  riftId: string,
  upgradeChoiceBatchCount: number,
  blueprintChoiceCountByTier: number[],
): RewardChoice[] {
  const upgradePool = getRewardUpgradePool(state);
  const blueprintPool = getRewardBlueprintPool(state);
  const choices: RewardChoice[] = [];
  for (let index = 0; index < upgradeChoiceBatchCount; index += 1) {
    const options = upgradePool.slice(index * 3, index * 3 + 3);
    if (options.length < 3) {
      break;
    }
    choices.push(buildRewardChoice(`${riftId}-reward-${index + 1}`, riftId, options));
  }
  let blueprintOffset = 0;
  blueprintChoiceCountByTier.forEach((optionCount, index) => {
    const options = blueprintPool.slice(blueprintOffset, blueprintOffset + optionCount);
    if (options.length < optionCount) {
      return;
    }
    choices.push(buildBlueprintRewardChoice(`${riftId}-blueprint-${index + 1}`, riftId, options));
    blueprintOffset += optionCount;
  });
  return choices;
}

export function startNewGame(
  seed = Date.now() >>> 0,
  options?: { cheatUpgrades?: boolean; cheatBlueprints?: boolean; cheatResources?: boolean },
): GameState {
  return buildInitialState(seed, options);
}

export function chooseStartingFaction(state: GameState, factionId: FactionId): GameState {
  if (!state.availableFactionDraft.includes(factionId)) {
    return state;
  }
  const troop = createTroopInstance(factionId, getStartingFactionUnitType(factionId), 1);
  const unlockedState: GameState = {
    ...state,
    phase: 'planning',
    unlockedFactionIds: [factionId],
    availableFactionDraft: [],
    troops: [troop],
  };
  return {
    ...unlockedState,
    openRifts: enrichRiftRewards(generateCycleRifts(unlockedState), getRewardUpgradePool(unlockedState), getRewardBlueprintPool(unlockedState)),
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
        message: `${getTroopEffectiveDefinition(state, troop.id).label} is still recovering.`,
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

export function unlockFaction(state: GameState, factionId: FactionId): GameState {
  if (state.unlockedFactionIds.includes(factionId)) {
    return state;
  }
  const cost = getFactionUnlockCost(state);
  if (state.resources.essence < cost) {
    return state;
  }
  const nextTroop = createTroopInstance(factionId, 'soldier', nextTroopIndex(state, factionId, 'soldier'));
  const nextUnlockedFactionIds = [...state.unlockedFactionIds, factionId];
  return {
    ...state,
    resources: { ...state.resources, essence: fixed(state.resources.essence - cost) },
    unlockedFactionIds: nextUnlockedFactionIds,
    troops: [...state.troops, nextTroop],
  };
}

export function unlockTroopType(state: GameState, factionId: FactionId, unitTypeId: string): GameState {
  if (!canUnlockTroopType(state, factionId, unitTypeId)) {
    return state;
  }
  if (state.troops.some((troop) => troop.factionId === factionId && troop.unitTypeId === unitTypeId)) {
    return state;
  }
  const cost = getTroopUnlockCost(state, factionId, unitTypeId);
  if (state.resources.essence < cost) {
    return state;
  }
  return {
    ...state,
    resources: { ...state.resources, essence: fixed(state.resources.essence - cost) },
    troops: [...state.troops, createTroopInstance(factionId, unitTypeId, nextTroopIndex(state, factionId, unitTypeId))],
  };
}

export function buyTroopUnit(state: GameState, troopId: TroopId): GameState {
  const troop = getTroopById(state, troopId);
  const cost = getTroopAddUnitCost(state, troop);
  if (state.resources.gold < cost) {
    return state;
  }
  return {
    ...state,
    resources: { ...state.resources, gold: fixed(state.resources.gold - cost) },
    troops: state.troops.map((entry) => (entry.id === troopId ? { ...entry, quantity: entry.quantity + 1 } : entry)),
  };
}

export function buyTroopStatUpgrade(state: GameState, troopId: TroopId, stat: TroopStatKey): GameState {
  const troop = getTroopById(state, troopId);
  if (!canUpgradeStat(troop.unitTypeId, stat)) {
    return state;
  }
  const cost = getTroopStatUpgradeCost(troop, stat);
  if (state.resources.gold < cost) {
    return state;
  }
  return {
    ...state,
    resources: { ...state.resources, gold: fixed(state.resources.gold - cost) },
    troops: state.troops.map((entry) =>
      entry.id === troopId
        ? {
            ...entry,
            statUpgradeLevels: {
              ...entry.statUpgradeLevels,
              [stat]: (entry.statUpgradeLevels[stat] ?? 0) + 1,
            },
          }
        : entry,
    ),
  };
}

export function buyTroopTypeUpgrade(state: GameState, upgradeId: string): GameState {
  if (state.troopTypeUpgradeIds.includes(upgradeId)) {
    return state;
  }
  const upgrade = getTroopTypeUpgrade(upgradeId);
  if (state.resources.gold < upgrade.cost) {
    return state;
  }
  return {
    ...state,
    resources: { ...state.resources, gold: fixed(state.resources.gold - upgrade.cost) },
    troopTypeUpgradeIds: [...state.troopTypeUpgradeIds, upgradeId],
  };
}

export function buyFactionUpgrade(state: GameState, upgradeId: string): GameState {
  if (state.factionUpgradeIds.includes(upgradeId)) {
    return state;
  }
  const upgrade = getFactionUpgrade(upgradeId);
  if (state.resources.gold < upgrade.cost) {
    return state;
  }
  return {
    ...state,
    resources: { ...state.resources, gold: fixed(state.resources.gold - upgrade.cost) },
    factionUpgradeIds: [...state.factionUpgradeIds, upgradeId],
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

      const recoveryMultiplier = rift.mutatorIds.reduce(
        (multiplier, id) => multiplier * (getMutator(id).recoveryMultiplier ?? 1),
        1,
      );
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
          rewardPackage: rift.rewardPackage,
          recoveryMap,
        },
      ];
    });

  return { records };
}

export function applyCycleOutcomes(state: GameState, resolution: CycleResolution): ApplyCycleOutcomeResult {
  let nextState: GameState = {
    ...state,
    cycleNumber: state.cycleNumber + 1,
    troops: tickRecovery(
      state.troops.map((troop) => {
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
      state.openRifts.map((rift) => {
        const record = resolution.records.find((entry) => entry.riftId === rift.id);
        if (!record) {
          return rift;
        }
        return { ...rift, state: record.outcome === 'victory' ? 'resolved_victory' : 'resolved_defeat' as const };
      }),
    ),
    replayIndex: [...state.replayIndex],
    pendingRewardChoices: [],
  };

  const writes = resolution.records
    .map((record) => ({
      replayId: record.replay.id,
      replay: {
        version: 1,
        input: record.battleInput,
      } satisfies StoredReplayPayload,
      estimatedBytes: JSON.stringify({
        version: 1,
        input: record.battleInput,
      } satisfies StoredReplayPayload).length,
    }));

  resolution.records.forEach((record) => {
    const entry = buildReplayIndexEntry(state.cycleNumber, record.replay);
    nextState.replayIndex = [entry, ...nextState.replayIndex];
    if (record.outcome === 'victory') {
      nextState.resources.gold = fixed(nextState.resources.gold + record.rewardPackage.resources.gold);
      nextState.resources.essence = fixed(nextState.resources.essence + record.rewardPackage.resources.essence);
      nextState.pendingRewardChoices = [
        ...nextState.pendingRewardChoices,
        ...buildRewardChoicesForRift(
          nextState,
          record.riftId,
          record.rewardPackage.upgradeChoiceBatches,
          record.rewardPackage.blueprintChoiceCountByTier,
        ),
      ];
    }
  });

  nextState.phase = nextState.pendingRewardChoices.length > 0 ? 'reward_claims' : 'planning';
  nextState.openRifts = [
    ...nextState.openRifts,
    ...enrichRiftRewards(generateCycleRifts(nextState), getRewardUpgradePool(nextState), getRewardBlueprintPool(nextState)),
  ];

  const deletes: { key: string }[] = [];
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
  };
}

export function claimRewardChoice(state: GameState, rewardChoiceId: string, optionId: string): GameState {
  const choice = state.pendingRewardChoices.find((entry) => entry.id === rewardChoiceId);
  if (!choice) {
    return state;
  }
  if (choice.kind === 'upgrade') {
    if (!choice.optionUpgradeIds.includes(optionId)) {
      return state;
    }
    if (state.factionUpgradeIds.includes(optionId)) {
      return {
        ...state,
        pendingRewardChoices: state.pendingRewardChoices.filter((entry) => entry.id !== rewardChoiceId),
      };
    }
    return {
      ...state,
      factionUpgradeIds: [...state.factionUpgradeIds, optionId],
      pendingRewardChoices: state.pendingRewardChoices.filter((entry) => entry.id !== rewardChoiceId),
      phase: state.pendingRewardChoices.length === 1 ? 'planning' : state.phase,
    };
  }

  if (!choice.optionTroopUnlockIds.includes(optionId)) {
    return state;
  }
  const nextBlueprintTroopIds = state.unlockedBlueprintTroopIds.includes(optionId)
    ? state.unlockedBlueprintTroopIds
    : [...state.unlockedBlueprintTroopIds, optionId];
  return {
    ...state,
    unlockedBlueprintTroopIds: nextBlueprintTroopIds,
    pendingRewardChoices: state.pendingRewardChoices.filter((entry) => entry.id !== rewardChoiceId),
    phase: state.pendingRewardChoices.length === 1 ? 'planning' : state.phase,
  };
}

export function advanceFromRewards(state: GameState): GameState {
  if (state.pendingRewardChoices.length > 0) {
    return state;
  }
  return { ...state, phase: 'planning' };
}

export { serializeGameState, deserializeGameState };
