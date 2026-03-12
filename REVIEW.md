# PLAN_Codex.md — Senior Review

Overall assessment: this is a well-scoped plan with sensible exclusions (blueprints, troop-type-wide upgrades) and the right instinct to preserve the engine-first architecture. The phase state machine and deterministic Rift generation are correct in spirit. However, there are several gaps ranging from a critical architectural flaw to missing design decisions that will produce broken behavior or blocked implementation if not addressed before coding starts.

---

## Critical

### 1. The battle engine pulls stats from a static catalog — this breaks the entire upgrade system

This is the most important issue in the plan, and it is never addressed.

`battle.ts` does not receive unit stats as input. It calls `getTroopDefinitionOrThrow(troopId)` throughout the combat loop — on every attack, every engagement check, every movement decision — to look up health, damage, armor, speed, size, capacity, and abilities from the compile-time `TROOP_CATALOG`. This catalog is computed once at startup from base unit type stats and faction adjustments. It does not know about purchased stat upgrades.

The plan describes `TroopInstance` as having "effective battle stats derived from base type + faction modifiers + paid upgrades + faction upgrades." That derivation currently doesn't feed into battle resolution at all. If a player buys three health upgrades for their Troll Soldiers, those upgrades will be silently ignored when the battle runs, because `battle.ts` will still read `health: 130` from the catalog.

The fix requires a two-part change the plan must specify explicitly:

**Part A — New `BattleInput` shape must carry fully-resolved unit definitions, not just `TroopTypeId` strings.** The `toUnitList()` function in `battle.ts` currently expands a `Record<TroopTypeId, count>` into a flat `TroopTypeId[]` list. For production battles, the equivalent expansion must carry a fully-resolved `TroopDefinition` per unit slot (with upgraded stats already applied), not just an ID. The battle engine must then use that passed-in definition instead of looking up the catalog.

**Part B — `battle.ts` must stop calling `getTroopDefinitionOrThrow()` internally.** The internal `InternalUnit` must carry or reference its resolved stats directly. The simplest approach: store `resolvedStats: UnitStats` and `resolvedAbilities: ResolvedAbility[]` on `InternalUnit` at spawn time, populated from the input definition. Every place that currently calls `troop(unit.troopId).stats.X` reads from those fields instead.

Without this change, the upgrade system is entirely cosmetic.

---

## Significant

### 2. Mutator effects are completely unscoped

The plan generates mutators, adjusts enemy budgets with them, and displays them in the UI. It never addresses implementing their actual battle effects.

Mutators like `Momentum` (+10 initiative per Beat), `Heavy Air` (ranged damage -50%), and `Red Hands` (extra turn on kill) require real changes to `battle.ts`. `Red Hands` in particular is a non-trivial extension to the turn loop. `Quagmire` (doubled recovery time) affects the post-battle outcome logic, not the battle engine itself.

The plan must make an explicit call: either mutator battle effects are **in scope for V1** (and need their own implementation section), or they are **metadata-only in V1** (displayed, budget-adjusted, but mechanically inert). Silently generating mutators with no effects is a gameplay integrity problem — the player sees "Heavy Air: ranged damage -50%" in the preview and it does nothing in the battle replay. That is deceptive to the player and will surface as a bug report.

Recommendation: scope to a small, implementable set of mutators for V1 and explicitly list which ones are mechanically active vs. budget-only tags.

### 3. `localStorage` size risk from full-snapshot replays

The plan makes replay archival a core V1 feature and stores the replay archive inside `GameState`, which is serialized to `localStorage`. `localStorage` is limited to 5–10 MB depending on browser.

The current `BattleReplay` format stores a full `BattleStateSnapshot` (all unit positions, HP, initiative, alive state, engagements) on every single `BattleStep`. A moderately long battle (say, 200 beats, 20 units) produces hundreds of steps, each with a full snapshot. A single replay can easily exceed 200 KB of JSON. Four or five replays per cycle, saved across many cycles, will overflow the storage limit.

The plan must address this before implementation, not after. Options:
- Store replays in separate named `localStorage` keys and keep only metadata (IDs, outcomes, summaries) in `GameState`.
- Delta-encode snapshots (store only what changed each step). This is more work but reduces replay size by roughly 10x.
- Cap the archive (e.g., keep only the last N cycles of replays) and document that cap.

Any of these works. Choosing none produces an unfixable production regression once a player has played for a few cycles.

### 4. `replay_review` is a UI phase, not an engine phase

The plan's state machine is `faction_draft → planning → resolution → reward_claims → replay_review → next_cycle/planning`.

`replay_review` has no engine invariants. There is no game rule that requires the player to "be in replay review mode." It carries no state that affects legal actions. It does not belong in `GameState`. Putting it there contaminates the save format with transient UI state: a player who saves mid-`replay_review` and reloads would land in `replay_review` even though no battle is currently queued.

The engine phase machine should be: `faction_draft → planning → resolution → reward_claims → planning`. Opening a replay is a UI concern driven by the replay archive — the player can navigate to any archived replay at any time, including from within the `planning` phase. The phase machine need not model this.

---

## Moderate

### 5. `resolveCycle` is too monolithic to be a single pure function

The plan lists `resolveCycle` as responsible for: locking assignments, validating faction-sharing rules, resolving all assigned Rifts (multiple battles), applying victory/defeat outcomes, granting/queueing rewards, updating troop recovery, expiring old Rifts, archiving replays, and generating the next cycle.

That's nine distinct operations in one function. A pure function that does all of this must return: a new `GameState`, multiple `BattleReplay` objects, validation errors (if any), and reward choices. The signature gets unwieldy. More importantly, validation errors need to block execution, while replay archiving should only run if resolution succeeds. These have different failure semantics.

Decompose this into at least:
- `validateAssignments(state): ValidationResult` — legality checks, returns errors without mutating state
- `resolveBattles(state): { replays: BattleReplay[]; outcomes: BattleOutcome[] }` — pure, returns replays and outcome summaries without modifying `GameState`
- `applyOutcomes(state, outcomes, replays): GameState` — applies recovery, rewards, archives replays, expires Rifts, advances cycle

This decomposition maps cleanly to the UI flow: validate on every assignment change (live feedback), call `resolveBattles` when the player hits "End Cycle," then `applyOutcomes` after the player reviews replays. It also makes each function independently testable, which the test plan already requires.

### 6. Recovery duration is an unresolved design question — do not silently default

The plan says "Recovery is tracked per troop instance." The Overworld design doc says "Recovery timers advance" and "losing means a longer recovery time." Neither document specifies the actual numbers.

Before implementation, this must be decided: how many cycles does a winning troop recover? How many for a losing troop? Does the `Quagmire` mutator's "twice as long recovering" double the base, or does it double relative to the unmodified per-outcome value?

The plan should either commit to concrete numbers or flag this as an open design decision requiring a designer answer before coding starts. Silently leaving it as "recovery timers" with no values means whoever implements it invents the numbers without visibility, and the gameplay feel of the core loop depends heavily on these values.

### 7. The `United` exception is in the test plan but not the implementation

The plan mentions "same-faction restriction and `United` exception" only in the test plan section. The `United` ability (granted by the "Humans united" faction upgrade) allows multiple human troops to enter the same Rift simultaneously. This is a non-trivial rule that must be part of the assignment validation implementation description, not left implied by a test case.

The implementation section (§4, cycle resolution) says only "validate faction-sharing rules." That is insufficient. The validation logic needs to: (a) know what faction-level upgrades the player has purchased, (b) check whether those upgrades grant the `United` type to the relevant faction's troops, and (c) conditionally allow same-faction co-assignment. This couples the validation logic to the upgrade catalog, which should be spelled out.

---

## Minor

### 8. Starting faction draft: you pick 1 from 3, not 3

The plan says "initial free choice among 3 random factions." The design doc (Upgrades and unlocks.md) says "you get a choice of 3 random factions to unlock for free." The player picks one of the three presented, not all three. The wording in the plan is ambiguous enough that an implementer could reasonably read it as getting all three for free. Be explicit: "present 3 random factions; player selects one to unlock at no cost."

### 9. Seeding hierarchy for deterministic campaign generation is not described

The plan says Rifts are generated with "deterministic seeds." A full campaign must be reproducible from a single root seed (or a per-cycle seed derived from the campaign seed). Without a defined seeding hierarchy, different implementations will produce different Rift sequences from the same starting state, breaking any save/load or determinism guarantees.

Define: campaign seed → per-cycle seed (e.g., derived via `rng(campaignSeed + cycleNumber)`) → per-Rift seed (e.g., derived from cycle seed + Rift index). Every source of randomness in generation (faction selection, mutator selection, reward category selection) should consume the per-Rift RNG in a specified order so the output is fully reproducible.

### 10. Module naming conflicts with TECHNICAL.md

The plan introduces modules: `game`, `rifts`, `progression`, `assignments`, `rewards`, `save`, and content catalogs.

TECHNICAL.md specifies: `battle.ts`, `army.ts`, `rift.ts` (singular), `upgrades.ts`, `save.ts`.

These overlap but don't align. Is the plan superseding TECHNICAL.md's directory layout? If so, say so explicitly and update the canonical reference. If not, map the new modules to the existing file structure (e.g., `progression` lives in `upgrades.ts`, `assignments` lives in `rift.ts`). An implementer reading both documents will produce inconsistent results.

### 11. Stat derivation function is implied but never specified

The plan says `TroopInstance` has "effective battle stats derived from base type + faction modifiers + paid upgrades + faction upgrades." The order of operations for these four layers is not defined.

The current `composeTroopDefinition()` in `unitCatalog.ts` applies faction adjustments as `(baseStatValue * multiplier) + flat`. Purchased stat upgrades in the design doc apply "10% multiplicatively" — so each upgrade multiplies the *current* effective stat. The order matters: does a faction +10% health modifier apply before or after purchased health upgrades? Both orderings are reasonable; they produce different numbers; and the design doc doesn't say.

This should be specified in the plan so that the upgrade cost formulas (which reference "troop cost") can also reference a canonical "effective stat" consistently.

---

## Summary of Required Actions Before Implementation

| Priority | Action |
|---|---|
| Critical | Define `BattleInput` shape with fully-resolved unit stats; refactor `battle.ts` to use passed-in definitions instead of catalog lookups |
| Critical | Decide mutator scope: which mutators are mechanically active in V1 vs. metadata-only |
| Significant | Define replay storage strategy to stay within localStorage limits |
| Significant | Remove `replay_review` from the engine phase machine |
| Moderate | Decompose `resolveCycle` into validate / resolve / apply stages |
| Moderate | Specify recovery duration values (cycles per win, per loss) |
| Moderate | Document `United` exception in the assignment validation implementation section |
| Minor | Clarify starting faction draft: pick 1 from 3 |
| Minor | Define seeding hierarchy for campaign reproducibility |
| Minor | Reconcile module naming with TECHNICAL.md |
| Minor | Specify stat derivation order: faction adjustments vs. purchased upgrades |
