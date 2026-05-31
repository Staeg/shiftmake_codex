import type {
  AbilityAllegiance,
  AbilityDefinition,
  AbilityEffectDefinition,
  AbilityTargetDefinition,
  EffectDisposition,
  SideId,
} from './types';

type UnitForAbilityRules = {
  id?: string;
  side: SideId;
  type: string;
  attributes: string[];
  engagedWith?: { size: number };
  resolvedStats: {
    range: number;
  };
};

export function resolveAbilityTargetRadius(
  actor: { resolvedStats: { range: number } },
  target: AbilityTargetDefinition | undefined,
): number {
  if (!target) {
    return 0;
  }
  if (target.radiusSource === 'selfRange') {
    return actor.resolvedStats.range;
  }
  return target.radius ?? 0;
}

export function resolveFallenTriggerRadius(
  actor: { resolvedStats: { range: number } },
  trigger: AbilityDefinition['trigger'],
): number {
  if (!trigger.fallen) {
    return 0;
  }
  if (trigger.fallen.radiusSource === 'selfRange') {
    return actor.resolvedStats.range;
  }
  return trigger.fallen.radius;
}

export function effectDisposition(effect: AbilityEffectDefinition): EffectDisposition {
  return effect.disposition ?? 'neutral';
}

export function matchesFallenTrigger(
  unit: Pick<UnitForAbilityRules, 'side'>,
  fallenUnit: Pick<UnitForAbilityRules, 'side'>,
  allegiance: AbilityAllegiance,
): boolean {
  if (unit.id && fallenUnit.id && unit.id === fallenUnit.id) {
    return false;
  }
  if (allegiance === 'all') {
    return true;
  }
  return allegiance === 'ally' ? unit.side === fallenUnit.side : unit.side !== fallenUnit.side;
}

export function filterTargetCandidates<T extends Pick<UnitForAbilityRules, 'type' | 'attributes'>>(
  candidates: T[],
  filters?: AbilityTargetDefinition['filters'],
): T[] {
  if (!filters) {
    return candidates;
  }
  return candidates.filter((unit) => {
    const visibleTypes = new Set([unit.type, ...unit.attributes]);
    if (filters.onlyTypes?.length && !filters.onlyTypes.some((type) => visibleTypes.has(type))) return false;
    if (filters.notTypes?.some((type) => visibleTypes.has(type))) return false;
    if (filters.unengaged && (unit.engagedWith?.size ?? 0) > 0) return false;
    return true;
  });
}

export function prioritizeCandidates<T extends Pick<UnitForAbilityRules, 'type' | 'attributes'>>(
  candidates: T[],
  filters?: AbilityTargetDefinition['filters'],
): T[] {
  if (!filters?.prioritizeTypes?.length) {
    return candidates;
  }
  const prioritized = candidates.filter((unit) => {
    const visibleTypes = new Set([unit.type, ...unit.attributes]);
    return filters.prioritizeTypes!.some((type) => visibleTypes.has(type));
  });
  return prioritized.length > 0 ? prioritized : candidates;
}
