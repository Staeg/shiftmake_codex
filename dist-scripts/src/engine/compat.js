import { footprintForSize } from "./hex";
function normalizeRoleId(role) {
  if (role === "chaff") {
    return "pusher";
  }
  if (role === "frontline" || role === "pusher" || role === "backline") {
    return role;
  }
  return "frontline";
}
function normalizeUnitStats(stats) {
  return {
    ...stats,
    move: typeof stats.move === "number" && Number.isFinite(stats.move) ? stats.move : 0
  };
}
function normalizeResolvedCombatant(combatant) {
  return {
    ...combatant,
    role: normalizeRoleId(combatant.role),
    stats: normalizeUnitStats(combatant.stats)
  };
}
function normalizeBattleInput(input) {
  return {
    ...input,
    playerCombatants: input.playerCombatants.map(normalizeResolvedCombatant),
    enemyCombatants: input.enemyCombatants.map(normalizeResolvedCombatant)
  };
}
function normalizeBattleUnit(unit) {
  const stats = normalizeUnitStats(unit.stats);
  return {
    ...unit,
    role: normalizeRoleId(unit.role),
    stats,
    footprintOrientation: unit.footprintOrientation === "south" ? "south" : "north",
    occupiedHexes: Array.isArray(unit.occupiedHexes) && unit.occupiedHexes.length > 0 ? unit.occupiedHexes.map((hex) => ({ ...hex })) : footprintForSize(unit.position, stats.size, unit.footprintOrientation === "south" ? "south" : "north")
  };
}
function normalizeBattleSnapshot(snapshot) {
  return {
    units: snapshot.units.map(normalizeBattleUnit)
  };
}
export {
  normalizeBattleInput,
  normalizeBattleSnapshot,
  normalizeBattleUnit,
  normalizeResolvedCombatant,
  normalizeRoleId,
  normalizeUnitStats
};
//# sourceMappingURL=compat.js.map
