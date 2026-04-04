import { describe, expect, it } from 'vitest';
import { ABILITY_VERIFICATION_SCENARIOS, REQUIRED_ABILITY_VERIFICATION_IDS } from './abilityVerificationCatalog';

describe('ability verification catalog', () => {
  it('covers every new ability that should be replay-verified', () => {
    const covered = new Set(ABILITY_VERIFICATION_SCENARIOS.flatMap((scenario) => scenario.coveredAbilityIds));
    expect(covered).toEqual(new Set(REQUIRED_ABILITY_VERIFICATION_IDS));
  });
});
