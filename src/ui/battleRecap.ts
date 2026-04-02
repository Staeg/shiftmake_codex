import type { BattleReplay, BattleStateSnapshot, RoleIntentId, SideId } from '../engine/types';

export interface BattleRecapUnitEntry {
  unitId: string;
  side: SideId;
  troopLabel: string;
  unitLabel: string;
  damageDone: number;
  healingDone: number;
  kills: number;
}

export interface BattleRecapTroopEntry {
  side: SideId;
  troopLabel: string;
  damageDone: number;
  healingDone: number;
  kills: number;
  roleSummary: string[];
  units: BattleRecapUnitEntry[];
}

const ROLE_SUMMARY_LABELS: Partial<Record<RoleIntentId, string>> = {
  'screen-frontline': 'Held line',
  'fallback-backline': 'Held line',
  'breach-backline': 'Broke through',
  'hold-backline': 'Broke through',
  'retreat-range': 'Kept range',
  'advance-range': 'Kept range',
};

function troopKey(side: SideId, troopLabel: string): string {
  return `${side}:${troopLabel}`;
}

function snapshotForStep(replay: BattleReplay, step: number): BattleStateSnapshot {
  if (step < 0) {
    return replay.initial;
  }

  return replay.steps[Math.min(step, replay.steps.length - 1)]?.snapshot ?? replay.initial;
}

export function buildBattleRecap(replay: BattleReplay): BattleRecapTroopEntry[] {
  const troops = new Map<string, BattleRecapTroopEntry>();
  const units = new Map<string, BattleRecapUnitEntry>();
  const roleSummaryByTroop = new Map<string, Set<string>>();

  replay.initial.units.forEach((unit) => {
    const key = troopKey(unit.side, unit.troopLabel);
    let troop = troops.get(key);
    if (!troop) {
      troop = {
        side: unit.side,
        troopLabel: unit.troopLabel,
        damageDone: 0,
        healingDone: 0,
        kills: 0,
        roleSummary: [],
        units: [],
      };
      troops.set(key, troop);
    }

    const entry: BattleRecapUnitEntry = {
      unitId: unit.id,
      side: unit.side,
      troopLabel: unit.troopLabel,
      unitLabel: `Unit ${troop.units.length + 1}`,
      damageDone: 0,
      healingDone: 0,
      kills: 0,
    };

    troop.units.push(entry);
    units.set(unit.id, entry);
  });

  replay.steps.forEach((step) => {
    const actorId = step.actorIds[0];
    if (!actorId) {
      return;
    }

    const unit = units.get(actorId);
    if (!unit) {
      return;
    }

    const roleSummary = step.metadata?.roleIntent ? ROLE_SUMMARY_LABELS[step.metadata.roleIntent] : undefined;
    if (roleSummary) {
      const key = troopKey(unit.side, unit.troopLabel);
      let summaries = roleSummaryByTroop.get(key);
      if (!summaries) {
        summaries = new Set<string>();
        roleSummaryByTroop.set(key, summaries);
      }
      summaries.add(roleSummary);
    }

    if (step.kind === 'attack' && typeof step.metadata?.damage === 'number') {
      unit.damageDone += step.metadata.damage;
    }

    if (step.kind === 'heal' && typeof step.metadata?.amount === 'number') {
      unit.healingDone += step.metadata.amount;
    }

    if (step.kind === 'death') {
      unit.kills += step.targetIds.length;
    }
  });

  return [...troops.values()].map((troop) => ({
    ...troop,
    damageDone: troop.units.reduce((sum, unit) => sum + unit.damageDone, 0),
    healingDone: troop.units.reduce((sum, unit) => sum + unit.healingDone, 0),
    kills: troop.units.reduce((sum, unit) => sum + unit.kills, 0),
    roleSummary: [...(roleSummaryByTroop.get(troopKey(troop.side, troop.troopLabel)) ?? [])],
    units: [...troop.units],
  }));
}

export function isUnitAliveAtStep(replay: BattleReplay, unitId: string, step: number): boolean {
  const unit = snapshotForStep(replay, step).units.find((entry) => entry.id === unitId);
  return unit?.alive ?? false;
}

export function findLastAliveStep(replay: BattleReplay, unitId: string, fromStep: number): number {
  const maxStep = Math.min(fromStep, replay.steps.length - 1);
  for (let step = maxStep; step >= -1; step -= 1) {
    if (isUnitAliveAtStep(replay, unitId, step)) {
      return step;
    }
  }

  return -1;
}
