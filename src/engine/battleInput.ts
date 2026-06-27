import { createTroopInstance, resolveTroopCombatant } from './army';
import { randomSeed } from './rng';
import { getTroopDefinitionOrThrow } from './unitCatalog';
import type { BattleDebugInput } from './debugTypes';
import type { BattleInput, BattleReplay, ResolvedCombatantDefinition } from './types';
import { resolveBattle } from './battle';

export function resolveDebugBattle(input: BattleDebugInput): BattleReplay {
  const playerRaceUpgradeIds = input.playerRaceUpgradeIds ?? [];
  const playerTroopClassUpgradeIds = input.playerTroopClassUpgradeIds ?? [];
  const enemyRaceUpgradeIds = input.enemyRaceUpgradeIds ?? [];
  const enemyTroopClassUpgradeIds = input.enemyTroopClassUpgradeIds ?? [];
  const playerCombatants = Object.entries(input.player)
    .filter(([, quantity]) => quantity > 0)
    .map(([troopId, quantity]) => {
      const troop = getTroopDefinitionOrThrow(troopId);
      const resolved = resolveTroopCombatant(
        { raceUpgradeIds: playerRaceUpgradeIds, troopClassUpgradeIds: playerTroopClassUpgradeIds },
        createTroopInstance(troop.raceId, troop.unitClassId),
        'player',
        null,
        `debug-player-${troopId}`,
      );
      return {
        ...resolved,
        troopInstanceId: null,
        quantity,
      };
    });
  const enemyCombatants = Object.entries(input.enemy)
    .filter(([, quantity]) => quantity > 0)
    .map(([troopId, quantity]) => {
      const troop = getTroopDefinitionOrThrow(troopId);
      const resolved = resolveTroopCombatant(
        { raceUpgradeIds: enemyRaceUpgradeIds, troopClassUpgradeIds: enemyTroopClassUpgradeIds },
        createTroopInstance(troop.raceId, troop.unitClassId),
        'enemy',
        null,
        `debug-enemy-${troopId}`,
      );
      return {
        ...resolved,
        troopInstanceId: null,
        quantity,
      };
    });

  return resolveBattle({
    seed: input.seed ?? randomSeed(),
    riftId: null,
    tier: null,
    mutatorIds: [],
    playerRaceUpgradeIds,
    playerTroopClassUpgradeIds,
    enemyRaceUpgradeIds,
    enemyTroopClassUpgradeIds,
    playerCombatants,
    enemyCombatants,
  });
}

export function buildBattleInputFromResolvedCombatants(
  seed: number,
  riftId: string | null,
  tier: number | null,
  mutatorIds: string[],
  playerRaceUpgradeIds: string[],
  playerTroopClassUpgradeIds: string[],
  enemyRaceUpgradeIds: string[],
  enemyTroopClassUpgradeIds: string[],
  playerCombatants: ResolvedCombatantDefinition[],
  enemyCombatants: ResolvedCombatantDefinition[],
): BattleInput {
  return {
    seed,
    riftId,
    tier,
    mutatorIds,
    playerRaceUpgradeIds,
    playerTroopClassUpgradeIds,
    enemyRaceUpgradeIds,
    enemyTroopClassUpgradeIds,
    playerCombatants,
    enemyCombatants,
  };
}
