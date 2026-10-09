export type UnitOnceEffectId = 'mercy-before-dawn-protection' | 'stoneblood' | 'fade-into-shadow' | 'glamour';
export type UnitOnceEffectUsage = Record<UnitOnceEffectId, boolean>;

export function createUnitOnceEffectUsage(): UnitOnceEffectUsage {
  return {
    'mercy-before-dawn-protection': false,
    stoneblood: false,
    'fade-into-shadow': false,
    glamour: false,
  };
}

export function hasUsedUnitOnceEffect(usage: UnitOnceEffectUsage, effect: UnitOnceEffectId): boolean {
  return usage[effect];
}

export function markUnitOnceEffectUsed(usage: UnitOnceEffectUsage, effect: UnitOnceEffectId): void {
  usage[effect] = true;
}
