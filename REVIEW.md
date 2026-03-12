# Architecture & Design Review

Review of the battle engine implementation against the Unit details and Battle details design documents.

---

## Critical Issue: Global Mutable State

`battle.ts:338-348` — `typeLookupState` is a module-level mutable variable used as a hack to thread state into `availableCapacity → statefulLookupType`. This is the most significant architectural flaw:

```ts
let typeLookupState: Map<string, InternalUnit> | null = null;
```

It breaks the pure engine principle, creates latent bugs if the engine ever runs on a Web Worker, and silently returns `null` capacity lookups if somehow called outside `resolveDebugBattle`. The fix is simple: `availableCapacity` should accept `InternalState` (or just the units `Map`) as an explicit parameter.

---

## `UnitTypeId` Will Become Unmanageable

`types.ts:1` — `'swordsman' | 'peasant' | 'archer'` is a closed union. Once factions are added (the game's core premise), every new unit type requires touching this union, `unitCatalog.ts`, `ArmyDebugSelection`, and every place that does `selection[typeId]`. Consider:

- Using `string` as the type with the catalog as the source of truth, OR
- Making `ArmyDebugSelection` a `Record<UnitTypeId, number>` at minimum (it currently has hardcoded field names)

---

## `ArmyDebugSelection` Pollutes `types.ts`

`types.ts:61-71` — `ArmyDebugSelection` and `BattleDebugInput` are debug-scaffolding types that enumerate specific unit types by name. They don't belong in the core engine types file. When the real army input model is designed (faction-based troops, not raw unit counts), this will be replaced entirely. These should live in a `debugTypes.ts` or alongside the debug store.

---

## `createEmptySnapshot` Is Misleading Dead Code

`battle.ts:739-754` — This function returns a snapshot filled with fake dead `peasant` units at every hex cell position, labeled as `cell_0`, `cell_1`, etc. It's not "empty" at all. It appears to have been a scaffolding utility for the renderer but is no longer used internally. It should either be removed or moved to a testing/rendering utility and properly named (e.g. `createHexGridPlaceholders`). Its presence in the public engine API creates confusion.

---

## No Faction Concept in Engine Types

`types.ts` — Factions are the game's strategic layer hook, yet `BattleUnit` and `UnitArchetype` have no `factionId`. When Rifts and the overworld are built, battles will need to know which faction each unit belongs to (for recovery timers, upgrade application, etc.). Adding this later means migrating both serialized replay data and all rendering code. It's worth sketching the field in now, even as `factionId: string | null` with a placeholder `'human'` default.

---

## No `maxHp` in `BattleStateSnapshot`

`types.ts:24-34` — `BattleUnit` stores current `hp` but not `maxHp`. The renderer can't draw a health bar without knowing the maximum — it must back-reference `BASIC_UNIT_TYPES[unit.typeId].stats.health`. This works now since stats are static, but once upgrades can modify per-troop max HP, the snapshot will be missing information. `maxHp` should be part of the unit's battle-time record.

---

## `findClosestEnemy` Doesn't Break Ties with RNG

`battle.ts:450` — After sorting enemies by distance, the function takes `[0]` deterministically. When multiple enemies are equidistant, the first one in `Map` iteration order always wins, which is an implicit ordering bias rather than a principled choice. `rng.pick()` among tied-distance enemies would be consistent with the rest of the system.

---

## `Shoot` Is Not a Named Directive

The design doc defines `Shoot [Role]` as a composable directive with role filtering. In the implementation, backline behavior directly inlines the ranged attack without a `shoot()` function, and without a role filter parameter. This is fine for now with only one backline unit type, but breaks the directive-composition pattern that will be needed when designing units that use `Shoot Frontline` or `Shoot Backline` specifically.

---

## Frontline `overrun` Call Is Redundant

`battle.ts:647` — After checking `nonEngagedEnemiesOnHex > 0`, the `else` branch calls `overrun`, which immediately re-checks `nonEngagedEnemiesOnHex`. Since we're already in the `else` branch, `overrun`'s guard is always `true` at that point. The call should be `pursue(['frontline', 'chaff'])` directly. It produces identical behavior but the indirection obscures intent and introduces a double query.

---

## Full Snapshot Per Step Is Memory-Expensive at Scale

`battle.ts:56-73` — Every step (including every `beat`) clones the entire unit array. For a large battle (e.g. 40 vs 40 units running 500+ beats), this could mean tens of thousands of arrays each containing 80 objects. A delta format — store only changed unit IDs per step, reconstruct full state by walking back — would dramatically reduce memory. This isn't urgent, but is worth planning before replays become a serialized game feature (save/load, sending over network for multiplayer).

---

## Minor: `engagedWithIds` Duplication in Snapshots

Both sides of an engagement store the other's ID (`A.engagedWithIds` includes B, and `B.engagedWithIds` includes A). This is fine and expected for fast lookup, but it means snapshot data has every engagement relationship twice. This is a deliberate tradeoff, just worth being aware of when designing save format compression.

---

## Priority Summary

| Priority | Issue |
|---|---|
| High | Global `typeLookupState` mutable state |
| High | No faction in engine types (architectural gap before overworld work) |
| Medium | `UnitTypeId` closed union / `ArmyDebugSelection` extensibility |
| Medium | Missing `maxHp` in snapshots |
| Medium | `createEmptySnapshot` confusion |
| Low | Redundant `overrun` call in frontline |
| Low | `findClosestEnemy` tie-breaking |
| Low | Missing `shoot` directive as named function |
| Future | Full-snapshot-per-step memory cost |
