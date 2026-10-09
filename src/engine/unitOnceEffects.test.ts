import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { resolveBattle } from './battle';
import { UNIT_ONCE_EFFECT_FIXTURES, unitOnceEffectInput } from './__fixtures__/unitOnceEffectInputs';
import { createUnitOnceEffectUsage, hasUsedUnitOnceEffect, markUnitOnceEffectUsed, type UnitOnceEffectId } from './unitOnceEffects';

describe('unit-owned once-per-battle effects', () => {
  it('allocates independent usage records and keeps each typed effect separate', () => {
    const recipient = createUnitOnceEffectUsage();
    const otherRecipient = createUnitOnceEffectUsage();
    expect(recipient).not.toBe(otherRecipient);
    for (const effect of Object.keys(recipient) as UnitOnceEffectId[]) {
      expect(hasUsedUnitOnceEffect(recipient, effect)).toBe(false);
      markUnitOnceEffectUsed(recipient, effect);
      expect(hasUsedUnitOnceEffect(recipient, effect)).toBe(true);
      expect(hasUsedUnitOnceEffect(otherRecipient, effect)).toBe(false);
      markUnitOnceEffectUsed(recipient, effect);
      expect(hasUsedUnitOnceEffect(recipient, effect)).toBe(true);
    }
    const fresh = createUnitOnceEffectUsage();
    markUnitOnceEffectUsed(fresh, 'mercy-before-dawn-protection');
    expect(hasUsedUnitOnceEffect(fresh, 'stoneblood')).toBe(false);
    expect(hasUsedUnitOnceEffect(fresh, 'fade-into-shadow')).toBe(false);
    expect(hasUsedUnitOnceEffect(fresh, 'glamour')).toBe(false);
  });

  for (const name of UNIT_ONCE_EFFECT_FIXTURES) {
    it(`preserves complete ${name} replay data and resets state for the next battle`, () => {
      const reference = JSON.parse(gunzipSync(readFileSync(new URL(`./__fixtures__/unit-once-effects/${name}.json.gz`, import.meta.url))).toString('utf8'));
      const input = unitOnceEffectInput(name);
      expect(JSON.parse(JSON.stringify(resolveBattle(input)))).toEqual(reference);
      expect(JSON.parse(JSON.stringify(resolveBattle(input)))).toEqual(reference);
    });
  }

  it('protects each recipient once even with multiple unlimited priests', () => {
    const replay = resolveBattle(unitOnceEffectInput('mercy'));
    const protections = replay.steps.filter((step) => step.metadata?.effect === 'mercyBeforeDawn');
    expect(protections).toHaveLength(4);
    expect(new Set(protections.flatMap((step) => step.targetIds)).size).toBe(4);
    expect(new Set(protections.flatMap((step) => step.actorIds)).size).toBe(2);
    expect(replay.outcome).toBe('defeat');
  });

  it('keeps a priest source budget distinct from each recipient protection flag', () => {
    const replay = resolveBattle(unitOnceEffectInput('mercy-budget'));
    expect(replay.initial.units.filter((unit) => unit.side === 'player')).toHaveLength(3);
    expect(replay.steps.filter((step) => step.metadata?.effect === 'mercyBeforeDawn')).toHaveLength(1);
    expect(replay.outcome).toBe('defeat');
  });

  for (const [name, effect] of [['stoneblood', 'stoneblood'], ['fade', 'fadeIntoShadow'], ['glamour', 'glamour']] as const) {
    it(`allows independent ${name} use for two units of one troop, without repeated use`, () => {
      const replay = resolveBattle(unitOnceEffectInput(name));
      const triggers = replay.steps.filter((step) => step.metadata?.effect === effect);
      expect(triggers).toHaveLength(2);
      expect(new Set(triggers.flatMap((step) => step.actorIds)).size).toBe(2);
      expect(replay.outcome).toBe('defeat');
      expect(replay.steps.filter((step) => step.kind === 'attack').length).toBeGreaterThanOrEqual(4);
    });
  }

  it('initializes summoned units independently of their source and each other', () => {
    const replay = resolveBattle(unitOnceEffectInput('summoned-stoneblood'));
    const births = replay.steps.filter((step) => step.metadata?.effect === 'summon').flatMap((step) => step.targetIds);
    const protections = replay.steps.filter((step) => step.metadata?.effect === 'stoneblood').flatMap((step) => step.targetIds);
    expect(births).toHaveLength(2);
    expect(protections).toHaveLength(3);
    expect(new Set(protections).size).toBe(3);
    expect(protections).toEqual(expect.arrayContaining(births));
    expect(replay.outcome).toBe('defeat');
  });
});
