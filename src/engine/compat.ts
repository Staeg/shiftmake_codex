import type { BattleInput, BattleStateSnapshot, BattleUnit, ResolvedCombatantDefinition, RoleId, UnitStats } from './types';
import { footprintForSize } from './hex';

export function normalizeRoleId(role: unknown): RoleId {
  if (role === 'chaff') {
    return 'pusher';
  }
  if (role === 'frontline' || role === 'pusher' || role === 'backline') {
    return role;
  }
  return 'frontline';
}

export function normalizeUnitStats(stats: UnitStats | (Omit<UnitStats, 'move'> & { move?: number })): UnitStats {
  return {
    ...stats,
    move: typeof stats.move === 'number' && Number.isFinite(stats.move) ? stats.move : 0,
  };
}

export function normalizeResolvedCombatant(combatant: ResolvedCombatantDefinition): ResolvedCombatantDefinition {
  return {
    ...combatant,
    role: normalizeRoleId(combatant.role),
    stats: normalizeUnitStats(combatant.stats),
  };
}

export function normalizeBattleInput(input: BattleInput): BattleInput {
  return {
    ...input,
    playerCombatants: input.playerCombatants.map(normalizeResolvedCombatant),
    enemyCombatants: input.enemyCombatants.map(normalizeResolvedCombatant),
  };
}

export function normalizeBattleUnit(unit: BattleUnit): BattleUnit {
  const stats = normalizeUnitStats(unit.stats);
  return {
    ...unit,
    role: normalizeRoleId(unit.role),
    stats,
    footprintOrientation: unit.footprintOrientation === 'south' ? 'south' : 'north',
    occupiedHexes: Array.isArray(unit.occupiedHexes) && unit.occupiedHexes.length > 0
      ? unit.occupiedHexes.map((hex) => ({ ...hex }))
      : footprintForSize(unit.position, stats.size, unit.footprintOrientation === 'south' ? 'south' : 'north'),
  };
}

export function normalizeBattleSnapshot(snapshot: BattleStateSnapshot): BattleStateSnapshot {
  return {
    units: snapshot.units.map(normalizeBattleUnit),
  };
}
