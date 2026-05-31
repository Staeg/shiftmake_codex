import { createTroopInstance, resolveTroopCombatant } from './army';
import { randomSeed } from './rng';
import { getTroopDefinitionOrThrow } from './unitCatalog';
import type { BattleDebugInput } from './debugTypes';
import type { BattleInput, BattleReplay, ResolvedCombatantDefinition } from './types';
import { resolveBattle } from './battle';

export function resolveDebugBattle(input: BattleDebugInput): BattleReplay {
  const playerFactionUpgradeIds = input.playerFactionUpgradeIds ?? [];
  const playerTroopTypeUpgradeIds = input.playerTroopTypeUpgradeIds ?? [];
  const enemyFactionUpgradeIds = input.enemyFactionUpgradeIds ?? [];
  const enemyTroopTypeUpgradeIds = input.enemyTroopTypeUpgradeIds ?? [];
  const playerCombatants = Object.entries(input.player)
    .filter(([, quantity]) => quantity > 0)
    .map(([troopId, quantity]) => {
      const troop = getTroopDefinitionOrThrow(troopId);
      const resolved = resolveTroopCombatant(
        { factionUpgradeIds: playerFactionUpgradeIds, troopTypeUpgradeIds: playerTroopTypeUpgradeIds },
        createTroopInstance(troop.factionId, troop.unitTypeId),
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
        { factionUpgradeIds: enemyFactionUpgradeIds, troopTypeUpgradeIds: enemyTroopTypeUpgradeIds },
        createTroopInstance(troop.factionId, troop.unitTypeId),
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
    playerFactionUpgradeIds,
    playerTroopTypeUpgradeIds,
    enemyFactionUpgradeIds,
    enemyTroopTypeUpgradeIds,
    playerCombatants,
    enemyCombatants,
  });
}

export function buildBattleInputFromResolvedCombatants(
  seed: number,
  riftId: string | null,
  tier: number | null,
  mutatorIds: string[],
  saturation: number | undefined,
  playerFactionUpgradeIds: string[],
  playerTroopTypeUpgradeIds: string[],
  enemyFactionUpgradeIds: string[],
  enemyTroopTypeUpgradeIds: string[],
  playerCombatants: ResolvedCombatantDefinition[],
  enemyCombatants: ResolvedCombatantDefinition[],
): BattleInput {
  return {
    seed,
    riftId,
    tier,
    mutatorIds,
    saturation,
    playerFactionUpgradeIds,
    playerTroopTypeUpgradeIds,
    enemyFactionUpgradeIds,
    enemyTroopTypeUpgradeIds,
    playerCombatants,
    enemyCombatants,
  };
}
