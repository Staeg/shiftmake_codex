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
- `overworld`: campaign planning, upgrades, rewards, battle archive
- `replay`: Pixi replay viewer with event log, alive counts, tooltips, and recap

Campaign phases are:

- `faction_draft`: opening faction choice
- `planning`: normal overworld play
- `reward_claims`: post-victory upgrade picks

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
- battle mutators

The catalog is declarative. Composition happens in engine helpers:

- `composeBaseTroopDefinition()`: unit type + faction adjustments
- `resolveTroopCombatant()`: player troop with stat upgrades and faction upgrades applied
- `resolveEnemyCombatant()`: enemy troop with tier scaling applied

### Campaign state

`GameState` stores plain JSON only:

- resources
- unlocked factions
- recruited troops
- faction upgrades
- open rifts
- pending reward choices
- replay index

No classes or non-serializable values are persisted.

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
- `druid`
- `knight`
- `militia`
- `archer`
- `wizard`
- `shaman`

### Mutators

- `momentum`
- `heavy-air`
- `rich`
- `outpost`
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
2. performs role/engagement behavior
3. resolves `endOfTurn` abilities
4. expires temporary turn-based effects on itself

Battles stop on elimination or at `MAX_BEATS = 1000`, then resolve to `victory`, `defeat`, or `draw`.

### Roles and tactics

Implemented roles:

- `frontline`
- `chaff`
- `backline`

When not already engaged:

- frontline draws attention to enemies on its hex, otherwise pursues frontline/chaff
- chaff pursues backline if no unengaged enemies share the hex, otherwise piles on
- backline retreats if enemies share its hex, otherwise shoots if in range, otherwise advances carefully

### Engagement model

- `size` is the cost to engage a unit
- `capacity` is how much enemy size a unit may engage
- engagements are symmetric
- moving or death clears invalid engagements
- taunt-style behavior uses the generic `redirect` effect instead of custom battle code

### Replay payload

`BattleReplay` includes:

- initial snapshot
- ordered `BattleStep[]`
- outcome
- resolved troop profiles for both sides
- alive counts across time
- summary info for archive UI

The replay UI should always read resolved replay data, not recompute from catalog assumptions.

## Ability System

Abilities are fully data-driven.

Implemented timing values:

- `startOfBattle`
- `startOfTurn`
- `endOfTurn`
- `onAttack`
- `onKill`
- `onDeath`
- `onDamaged`
- `onFallen`
- `passive`

Implemented duration values:

- `instant`
- `battle`
- `turns`

Implemented target modes:

- `self`
- `random`
- `aoe`
- `default`

Implemented target filters:

- `notTypes`
- `onlyTypes`
- `prioritizeTypes`
- `unengaged`

Implemented trigger modifiers:

- `chargeEvery`
- `maxUses`
- `condition: 'forsaken'`
- `repeatPerDistinctFriendlyTroopType`
- `repeatPerOtherFriendlyUnitOnHex`
- `fallen` trigger geometry

Implemented effect kinds:

- `blast`
- `bolster`
- `haste`
- `heal`
- `ramp`
- `rangeset`
- `roleset`
- `strike`
- `redirect`

Temporary reversible runtime effects currently exist for:

- `bolster`
- `haste`
- `ramp`
- `rangeset`
- `roleset`

## Campaign Loop

`src/engine/game.ts` currently implements:

1. Start a new run in `faction_draft`
2. Choose one starting faction
3. Generate that cycle's rifts
4. In planning, recruit troops, buy units, buy stat upgrades, buy faction upgrades, unlock factions, unlock troop types, and assign troops
5. Resolve every discovered rift that has assigned troops
6. Apply recovery and rewards
7. Enter `reward_claims` if any upgrade choices were earned, otherwise return to `planning`
8. Generate the next cycle's rifts

Important current rule: all still-discovered rifts from the previous cycle are marked `expired` when the cycle advances, even though `RiftInstance` still carries an `expiresInCycles` field.

## Persistence

Save data uses `localStorage`:

- 3 save slots
- one game-state payload per slot
- replay payloads stored separately per slot

Replay payloads are stored as serialized `BattleInput`, not full replay output. Archived battles are reconstructed by re-running the deterministic resolver when opened.

Replay archive retention:

- max 40 archive entries
- soft storage cap of about 4 MB for replay payloads
- older payloads may be evicted and reduced to summary-only archive entries

Legacy single-save data is migrated into slot 1 on load.

## Testing

`npm run test` covers engine and store behavior.

Current tests cover:

- battle determinism
- troop composition
- faction/unit stat resolution
- rift generation
- campaign flow
- replay navigation
- save-slot persistence helpers
- ability behaviors such as charge, forsaken, combined arms, and temporary buffs

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
