# Ability System — Code Review Report

## Overview

The ability system is spread across four files:
- `src/engine/types.ts` — type definitions
- `src/engine/unitCatalog.ts` — ability catalog and factory helpers
- `src/engine/army.ts` — upgrade injection at troop composition time
- `src/engine/battle.ts` — runtime state, triggering, and effect execution

---

## Data Model

Each `AbilityDefinition` (types.ts:104–113) is composed of four orthogonal sub-definitions:

| Sub-definition | Key fields |
|---|---|
| `AbilityTriggerDefinition` | timing, chargeEvery, maxUses, condition, repeatPer… |
| `AbilityTargetDefinition` | mode (default/self/random/aoe), allegiance, radius, filters |
| `AbilityDurationDefinition` | instant / battle / turns(N) |
| `AbilityEffectDefinition[]` | one or more effects of kind: blast, bolster, haste, ramp, heal, rangeset, roleset, strike, redirect |

At battle start each ability gets a `RuntimeAbilityState` (battle.ts:24–28) that adds `triggerCount` and `usesRemaining` to the immutable definition.

---

## Composability — What Works Well

### 1. Multiple effects per ability
Any ability can carry an arbitrary list of effects. `shapeshift-bear` has five (bolster, haste, ramp, rangeset, roleset) and they all execute in a single trigger. This is the cleanest part of the design.

### 2. Repeat modifiers
`repeatPerDistinctFriendlyTroopType` and `repeatPerOtherFriendlyUnitOnHex` multiply the entire effect list by a runtime count. Combined-arms and gang/pack abilities are expressed cleanly without any bespoke logic.

### 3. Trigger modifiers
`chargeEvery` and `maxUses` are independent of effect type and compose freely with any ability. The charge implementation (battle.ts:1090–1093) is a clean modulo check.

### 4. Target flexibility
Mode × allegiance × filters × radius gives a lot of expressible targets without per-ability code. The `prioritizeTypes` filter is especially useful for intelligent target selection without custom handlers.

### 5. Handler registry
`PER_TARGET_EFFECT_HANDLERS` (battle.ts:999) is a plain object keyed by effect kind. Adding a handler is one place, making existing handlers easy to audit.

### 6. Temporary effect reversal
Active timed effects are stored as discrete entries (battle.ts:30–59) with enough bookkeeping to fully revert bolster/haste/ramp/rangeset/roleset. The expiration loop (battle.ts:776–835) is correct and covers all reversible kinds.

---

## Fragility and Weaknesses

### 1. Duration–effect coupling (most significant)
`executeAbilityEffect` (battle.ts:1072–1075) has a hard-coded list of which effect kinds support turn-based duration:

```typescript
if (
  runtime.definition.duration.kind === 'turns' &&
  (effect.kind === 'bolster' || effect.kind === 'haste' || effect.kind === 'ramp' ||
   effect.kind === 'rangeset' || effect.kind === 'roleset')
)
```

If a new reversible effect kind is added and this list is not updated, `applyTemporaryEffect` is silently skipped and the effect becomes permanent with no error. This is a hidden mine.

### 2. Multi-file change required for new effect kinds
Adding a new effect kind requires touching three places:
1. `AbilityEffectDefinition` union in `types.ts`
2. `PER_TARGET_EFFECT_HANDLERS` in `battle.ts`
3. The duration-coupling conditional in `executeAbilityEffect`

Plus potentially `applyTemporaryEffect` and `expireTimedEffects` if it needs reversal. There is no structural enforcement that all these stay in sync.

### 3. No ability-to-ability interaction
Abilities are entirely independent. There is no way to express:
- "this ability is suppressed while unit has buff X"
- "if ability A and ability B are both present, amplify A by 20%"
- "consuming X charges of ability A unlocks ability B"

All modifier stacking is purely additive.

### 4. Forsaken condition is the only supported condition
`canTriggerAbility` (battle.ts:954–974) handles `condition: 'forsaken'` as a special case. There is no general predicate system. Adding a new condition (e.g. "only if hp < 50%") requires patching the validation function directly rather than supplying a condition callback.

### 5. Temporary effect deduplication/refresh is not supported
If two allies both apply Ramp +5 to the same target, two separate `ActiveTimedEffect` entries are created. There is no concept of "refresh duration instead of stacking" or "cap stack depth". For the current ability set this is fine, but it limits future design.

### 6. Ability ordering is implicit
When multiple abilities share the same timing (e.g. two `endOfTurn` abilities), they fire in array order. There is no priority field and no guarantee on order relative to abilities from other sources (base unit vs. faction vs. upgrade). This is unlikely to cause bugs now but is a silent coupling between ability array order and correctness.

### 7. `onDamaged` is triggered inside blast and not inside direct attack damage
`triggerUnitAbilities(target, { timing: 'onDamaged' })` is called inside `applyBlast` (battle.ts:1011) but the corresponding trigger inside direct-hit attack damage resolution should be verified. If `onDamaged` is not fired consistently across all damage sources, reaction abilities (like frenzy-ramp) will behave inconsistently.

---

## Overall Verdict

**The design is solid and elegant for its current scope.** The separation of trigger/target/duration/effect into four composable sub-definitions is the right abstraction. The repeat system is clever. The handler registry and reversal bookkeeping are clean.

The main robustness risk is the **duration–effect coupling** — a silent assumption baked into a mid-function conditional. Everything else is more of a missing feature than a fragility. If the ability set grows significantly, the lack of a general condition system and the multi-file requirement for new effect kinds will accumulate friction, but neither is urgent.

**Priority issues to address (not urgent, but worth knowing):**
1. Make the duration–effect coupling explicit and enforced (highest risk item).
2. Verify `onDamaged` fires consistently across all damage paths.
3. Consider a simple priority field on `AbilityTriggerDefinition` if ordering ever matters.
