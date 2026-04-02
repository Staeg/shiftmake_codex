# TECHNICAL.md

Technical reference for the currently implemented version of Shiftmake.

Read alongside `AGENTS.md` and the design docs in `design documents/`.

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript |
| Build | Vite |
| UI framework | Svelte |
| Battle renderer | PixiJS |
| Testing | Vitest |
| Persistence | `localStorage` |

## Core Rule

All gameplay logic lives in `src/engine/` with no DOM or rendering dependencies.

The Svelte and Pixi layers consume resolved engine data. They do not decide outcomes, apply combat rules, or maintain a second copy of gameplay state.

## Project Shape

```text
src/
  engine/
    types.ts
    unitCatalog.ts
    army.ts
    battle.ts
    game.ts
    rift.ts
    upgrades.ts
    save.ts

  store/
    gameStore.ts
    saveSlots.ts
    replayNavigation.ts

  ui/
    App.svelte
    BattleControls.svelte
    EventLog.svelte
    StatBreakdownGrid.svelte
    UnitTooltip.svelte

  rendering/
    BattleRenderer.ts
    unitVisuals.ts
```

## Runtime Structure

The app has three UI screens:

- `main_menu`: three save slots, load/start flow
- `overworld`: opening unlock, planning, draft offers, VP display, archive
- `replay`: Pixi replay viewer with event log, tooltips, and recap

Campaign phases are:

- `opening_unlock`: free opening pick of any non-summoned faction + troop combination
- `planning`: normal overworld play
- `game_over`: shown immediately after cycle 10 resolves unless already dismissed for that run

## Data Model

### Unit identity

Resolved combatants expose both:

- `type`: one primary troop identity such as `soldier` or `wizard`
- `attributes`: secondary tags such as `melee`, `caster`, `ranged`, `human`, `goblin`, `expendable`

Ability filters match against the combined visible set of `type + attributes`.

Combined Arms style logic counts distinct friendly primary `type` values only.

### Catalog

`src/engine/unitCatalog.ts` defines:

- abilities
- unit types
- factions
- faction upgrades
- troop-type upgrades
- battle mutators

The catalog is declarative. Composition happens in engine helpers:

- `composeBaseTroopDefinition()`: unit type + faction adjustments, including resolved cost and derived quantity
- `resolveTroopCombatant()`: player troop with faction and troop-type upgrades applied
- `resolveEnemyCombatant()`: enemy troop with tier scaling applied

Important current catalog rules:

- troop quantity is derived as `120 / resolved cost`
- only Goblins modify cost, at `cost x 0.5`
- all non-summoned `faction/unitType` combinations are unlockable for players and enemies
- stat upgrades, blueprints, and faction-unlock purchases no longer exist
- the Soldier upgrade `Just a bunch of guys` is removed
- only `momentum`, `heavy-air`, and `quagmire` remain as Rift mutators

### Campaign state

`GameState` stores plain JSON only:

- `version`
- `campaignSeed`
- `cycleNumber`
- `phase`
- `essence`
- `victoryPoints`
- `unlockedFactionIds`
- `troops`
- `factionUpgradeIds`
- `troopTypeUpgradeIds`
- `activeTroopOffer`
- `activeUpgradeOffer`
- `troopOfferRolls`
- `upgradeOfferRolls`
- `postgameDismissed`
- `openRifts`
- `replayIndex`

`TroopInstance` is intentionally minimal:

- `id`
- `factionId`
- `unitTypeId`
- `recoveryCyclesRemaining`
- `assignmentRiftId`

Troop size is not persisted on the instance. It is derived from the current resolved troop definition.

### Draft offers

Draft offers are persisted in `GameState` so save/load does not reroll them.

Troop offer buckets:

1. a troop from an owned faction
2. a troop of an owned unit type
3. a troop from a not-yet-owned faction

Upgrade offer buckets:

1. a troop-type upgrade for an owned unit type
2. a faction upgrade for an owned faction
3. an upgrade matching neither of the previous buckets

If a bucket is empty, the picker falls back to any remaining unowned option.

## Current Implemented Content

### Factions

- `human`
- `elf`
- `goblin`
- `troll`

### Unit types

- `soldier`
- `champion`
- `avenger`
- `beastmaster`
- `druid`
- `elemental`
- `elementalist`
- `knight`
- `militia`
- `necromancer`
- `priest`
- `ranger`
- `shaman`
- `skeleton`
- `archer`
- `wizard`
- `wolf`

### Mutators

- `momentum`
- `heavy-air`
- `quagmire`

## Battle Engine

Battle entrypoint:

```ts
resolveBattle(input: BattleInput): BattleReplay
```

Important properties:

- deterministic for fixed input and seed
- replay-first architecture
- auto-expanding hex map if spawn space is insufficient
- configurable per-rift saturation limit

### Turn flow

Each beat:

1. All alive units gain initiative equal to speed plus mutator bonus.
2. A `beat` replay step is recorded.
3. Units with initiative `>= 100` act in shuffled order.
4. Each acting unit spends `100` initiative.

Each acting unit:

1. resolves `startOfTurn` abilities
2. performs role and engagement behavior
3. resolves `endOfTurn` abilities
4. expires temporary turn-based effects on itself

Battles stop on elimination or at `MAX_BEATS = 1000`, then resolve to `victory`, `defeat`, or `draw`.

### startOfBattle resolution order

`startOfBattle` abilities fire in two explicit phases before the first beat:

Phase 1 - army composition checks:
Abilities whose trigger has `condition` or `repeatPerDistinctFriendlyTroopType`. These need to see the placed army before any summon changes it.

Phase 2 - everything else:
All remaining `startOfBattle` abilities, including summons. Newly summoned units do not receive their own `startOfBattle` triggers.

Rule: any future ability that reads army composition at battle start must use `condition` or `repeatPerDistinctFriendlyTroopType` on its trigger so it lands in Phase 1 automatically.

### Replay payload

`BattleReplay` includes:

- initial snapshot
- ordered `BattleStep[]`
- outcome
- resolved troop profiles for both sides
- alive counts across time
- summary info for archive UI

The replay UI always reads resolved replay data and never reconstructs combat state from catalog assumptions.

## Campaign Loop

`src/engine/game.ts` currently implements:

1. Start a new run in `opening_unlock`
2. Claim one free opening troop from any non-summoned faction + troop combination
3. Enter `planning` with `2` Essence and generated cycle-1 Rifts
4. Reveal troop and upgrade offer packs as needed
5. Claim troop or upgrade choices for `1` Essence each
6. Assign any ready troops to discovered Rifts
7. Resolve every discovered Rift that has assigned troops
8. Apply recovery, archive replay inputs, award VP only on victories, and grant `+2` Essence for the next cycle
9. Generate the next cycle's Rifts
10. After cycle 10 resolves, enter `game_over` once for that run

Important current rule: ending a cycle with no assignments and/or unspent Essence is allowed, but the store surfaces a confirmation warning before advancing.

### Recovery

Base recovery is now:

- victory: ready next cycle
- defeat: ready next cycle

`Quagmire` is the only remaining mutator that modifies recovery and doubles the assigned troops' recovery before the normal cycle tick reduces it.

### Rift generation

`src/engine/rift.ts` now:

- generates 4 new Rifts each cycle
- uses the schedule `2/1/1/1`, `2/2/1/1`, `3/2/1/1`, `3/2/2/1`, `3/3/2/1`, then `4/3/2/1`
- gives each Rift `tier + 1` unique enemy combatant groups
- derives enemy troop quantity exactly the same way as player troops
- applies `+10%` health, damage, and speed per tier above 1
- awards `victoryPoints = tier`
- does not use enemy budgets, resource rewards, upgrade rewards, or blueprints

## Store and UI Responsibilities

`src/store/gameStore.ts` owns:

- save-slot loading and saving
- replay payload persistence
- cycle-end confirmation state
- screen mode and replay navigation state

`src/ui/App.svelte` is intentionally thin:

- renders opening unlock choices
- renders planning state, rifts, troops, draft offers, VP, and archive
- renders the cycle-10 game-over overlay
- delegates replay playback to the renderer and replay store actions

## Persistence

Save data uses `localStorage`:

- 3 save slots
- one game-state payload per slot
- replay payloads stored separately per slot

Current keys are versioned for the rewrite:

- slot index: `shiftmake:slots:v2`
- save payload: `shiftmake:slot:<id>:save:v2`
- replay payloads: `shiftmake:slot:<id>:replay:v2:<replayId>`

Replay payloads are stored as serialized `BattleInput`, not full replay output. Archived battles are reconstructed by re-running the deterministic resolver when opened.

Replay archive retention:

- max 40 archive entries
- soft storage cap of about 4 MB for replay payloads
- older payloads may be evicted and reduced to summary-only archive entries

Legacy campaign saves are intentionally unsupported and are not migrated.

## Testing

`npm run test` covers engine and store behavior.

Current tests cover:

- battle determinism
- troop composition and derived quantity
- faction and troop-type upgrade resolution
- Rift generation and VP rewards
- campaign flow and draft offer logic
- replay navigation
- save-slot persistence helpers
- game-store confirmation and offer persistence
- ability behaviors such as charge, forsaken, combined arms, retaliation, and summons

## Conventions

- Keep engine code pure and UI-agnostic.
- Add new mechanics to typed data models before adding one-off branches.
- Keep replay data authoritative for presentation.
- Put catalog content in `unitCatalog.ts`, not scattered through UI files.

## Commands

```bash
npm install
npm run dev
npm run build
npm run test
npm run preview
```
