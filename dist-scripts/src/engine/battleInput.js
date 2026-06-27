import { createTroopInstance, resolveTroopCombatant } from "./army";
import { randomSeed } from "./rng";
import { getTroopDefinitionOrThrow } from "./unitCatalog";
import { resolveBattle } from "./battle";
function resolveDebugBattle(input) {
  const playerRaceUpgradeIds = input.playerRaceUpgradeIds ?? [];
  const playerTroopClassUpgradeIds = input.playerTroopClassUpgradeIds ?? [];
  const enemyRaceUpgradeIds = input.enemyRaceUpgradeIds ?? [];
  const enemyTroopClassUpgradeIds = input.enemyTroopClassUpgradeIds ?? [];
  const playerCombatants = Object.entries(input.player).filter(([, quantity]) => quantity > 0).map(([troopId, quantity]) => {
    const troop = getTroopDefinitionOrThrow(troopId);
    const resolved = resolveTroopCombatant(
      { raceUpgradeIds: playerRaceUpgradeIds, troopClassUpgradeIds: playerTroopClassUpgradeIds },
      createTroopInstance(troop.raceId, troop.unitClassId),
      "player",
      null,
      `debug-player-${troopId}`
    );
    return {
      ...resolved,
      troopInstanceId: null,
      quantity
    };
  });
  const enemyCombatants = Object.entries(input.enemy).filter(([, quantity]) => quantity > 0).map(([troopId, quantity]) => {
    const troop = getTroopDefinitionOrThrow(troopId);
    const resolved = resolveTroopCombatant(
      { raceUpgradeIds: enemyRaceUpgradeIds, troopClassUpgradeIds: enemyTroopClassUpgradeIds },
      createTroopInstance(troop.raceId, troop.unitClassId),
      "enemy",
      null,
      `debug-enemy-${troopId}`
    );
    return {
      ...resolved,
      troopInstanceId: null,
      quantity
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
    enemyCombatants
  });
}
function buildBattleInputFromResolvedCombatants(seed, riftId, tier, mutatorIds, playerRaceUpgradeIds, playerTroopClassUpgradeIds, enemyRaceUpgradeIds, enemyTroopClassUpgradeIds, playerCombatants, enemyCombatants) {
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
    enemyCombatants
  };
}
export {
  buildBattleInputFromResolvedCombatants,
  resolveDebugBattle
};
//# sourceMappingURL=battleInput.js.map
