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

- `opening_unlock`: free opening picks for two native faction + troop combinations; the two picks must differ by faction and troop type
- `faction_unlock`: scheduled cycle-start faction choice
- `troop_type_unlock`: sequential troop choices for a newly unlocked faction
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
- each faction has a native recruit pool; only unlocked factions' native rosters are claimable in normal troop drafts
- off-roster `faction/unitType` combinations defeated in Rifts are recorded as latent future unlocks, and become claimable only after their faction is unlocked
- enemies can still roll any non-summoned `faction/unitType` combination
- stat upgrades, blueprints, and faction-unlock purchases no longer exist
- the Soldier upgrade `Just a bunch of guys` is removed
- Rift mutators are currently `momentum`, `haze`, `heavy-air`, `animated`, `corrosion`, `quakes`, and `decay`

### Campaign state

`GameState` stores plain JSON only:

- `version`
- `campaignSeed`
- `cycleNumber`
- `phase`
- `essence`
- `victoryPoints`
- `unlockedFactionIds`
- `unlockedTroopUnlockIds`
- `recentTroopUnlockIds`
- `troops`
- `factionUpgradeIds`
- `troopTypeUpgradeIds`
- `activeTroopOffer`
- `activeUpgradeOffer`
- `activeFactionUnlockOffer`
- `activeTroopTypeUnlockOffer`
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

Troop and upgrade offers are revealed together as one Essence draft in normal play. The draft costs `2` Essence when both sides still have options; if one side is fully exhausted, a one-sided fallback costs `1` Essence. Claiming an option from a revealed pack does not cost additional Essence.

Troop offer candidates are limited to:

- native troop combinations for already-unlocked factions
- Rift-earned off-roster combinations whose faction is already unlocked

Rift-earned combinations for locked factions stay latent. They are shown on that faction's scheduled unlock option and can be chosen during that faction's immediate troop-type unlock flow.

Troop offer buckets:

1. a troop from an owned faction
2. a troop of an owned unit type
3. a troop newly enabled by the previous cycle's victorious Rifts for an owned faction, then another troop from an owned faction

Native faction troops are always valid offer candidates.

Off-roster troop combinations only join the candidate pool after the player unlocks them through Rift victories and owns their faction.

If the third troop bucket is empty, it falls back to any remaining claimable troop.

Upgrade offer buckets:

1. a troop-type upgrade for an owned unit type
2. a faction upgrade for an owned faction
3. an upgrade matching the third troop offer's faction or troop type

If a bucket is empty, the picker falls back to any remaining unowned option.

## Current Implemented Content

### Factions

- `human`
- `elf`
- `goblin`
- `troll`
- `dwarf`
- `orc`
- `fae`

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
- `haze`
- `animated`
- `corrosion`
- `quakes`
- `decay`

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
- mutator side effects are resolved inside the engine, including battle-wide ability suppression, armor caps, random displacement, and environmental damage

### Turn flow

Each beat:

1. All alive units gain initiative equal to speed plus mutator bonus.
2. A `beat` replay step is recorded.
3. Beat-timed mutators then resolve, such as `Quakes` displacement and `Decay` HP loss.
4. Units with initiative `>= 100` act in shuffled order.
5. Each acting unit spends `100` initiative.

Each acting unit:

1. resolves `startOfTurn` abilities
2. performs role and engagement behavior
3. resolves `endOfTurn` abilities
4. expires temporary turn-based effects on itself

### Role decision tree

Role behavior is implemented inside `src/engine/battle.ts` and stays fully engine-owned.

Shared first check for every acting unit:

1. If the unit is already engaged, it attacks an engaged enemy in melee.
2. Only units with no active engagement continue into role-specific logic.

Frontline decision tree:

1. If any unengaged enemy shares the current hex, engage and fight immediately.
2. Otherwise choose a role objective that prefers:
   - screening enemy `frontline` or `chaff` that threatens allied backline access
   - moving into contested positions that block those paths
   - falling through to reachable enemy `backline` only when no frontline or chaff objective remains
3. Move toward that objective.
4. If the move ends on an enemy hex, engage and fight.

Chaff decision tree:

1. If unengaged enemies already share the current hex, pile onto that fight.
2. Otherwise choose a role objective that prefers:
   - breaching into enemy `backline`
   - preserving an existing backline commitment tracked in transient battle-only runtime state
   - only dropping that commitment when combat legality or board state makes it impossible
3. Move toward that objective.
4. If the move ends on an enemy hex, engage and fight.

Backline decision tree:

1. If enemies share the current hex, score legal adjacent retreat hexes and choose one that best preserves or increases distance from threats.
2. If no legal retreat improves safety, attack a same-hex enemy instead.
3. If no enemy shares the hex but one is in range, make a ranged attack.
4. Otherwise score careful advance hexes that move closer without unnecessarily collapsing spacing, then move if a legal improvement exists.

Replay visibility rule:

- Important role decisions emit typed replay metadata such as `roleIntent`, `reasonCode`, `targetRole`, and target hex coordinates.
- UI surfaces such as the event log and battle recap consume that metadata directly and do not reconstruct combat reasoning on their own.

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

### Battle input context

`BattleInput` may also carry each side's owned faction and troop-type upgrade ids alongside the resolved combatants.

The battle engine uses this for side-wide rules that must keep working for future summons even when the troop that normally grants the synergy is not present in that fight. Example: wolves summoned by Druids or Rangers can still benefit from owned wolf-synergy upgrades such as `Thrill of the Hunt`.

## Campaign Loop

`src/engine/game.ts` currently implements:

1. Start a new run in `opening_unlock`
2. Claim two free opening troops from native faction + troop combinations; the two starters must have different factions and different unit types
3. Enter `planning` with `2` Essence and generated cycle-1 Rifts
4. Spend Essence to reveal combined troop and upgrade offer packs as needed; normal troop offers are limited to unlocked factions
5. Claim one troop and one upgrade choice from each revealed combined draft
6. Assign any ready troops to discovered Rifts
7. Resolve every discovered Rift that has assigned troops
8. Apply recovery, archive replay inputs, award VP only on victories, and grant `+2` Essence for the next cycle
9. Generate the next cycle's Rifts
10. At the start of cycle 3, enter a scheduled faction unlock: choose up to 3 still-locked factions, each shown with native troops, latent defeated-enemy future troop unlocks, and 1 preselected faction upgrade; then choose 2 troop types for that faction from its native roster plus latent defeated-enemy combinations
11. At the start of cycle 7, repeat the scheduled faction unlock with 2 preselected faction upgrades and 3 troop type choices from the same native-plus-latent pool
12. After cycle 10 resolves, enter `game_over` once for that run

Assignment rule: no more than one troop of a given faction can enter the same Rift unless that faction has `United`, and no more than one troop of a given unit type can enter the same Rift.

Important current rule: ending a cycle with no assignments and/or unspent Essence is allowed, but the store surfaces a confirmation warning before advancing.

### Recovery

Base recovery is now:

- victory: ready next cycle
- defeat: ready next cycle

### Rift generation

`src/engine/rift.ts` now:

- generates 4 new Rifts each cycle
- uses the schedule `2/1/1/1`, `2/2/1/1`, `3/2/1/1`, `3/2/2/1`, `3/3/2/1`, then `4/3/2/1`
- assigns 1 mutator per Rift from a cycle-level shuffled bag that spreads mutators as evenly as possible across the 4 visible Rifts
- gives Tier 1-3 Rifts `tier + 1` unique enemy combatant groups, then keeps Tier 4 at 4 groups
- derives enemy troop quantity exactly the same way as player troops
- applies `+20%` health, damage, and speed only at Tier 4
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

- slot index: `shiftmake:slots:v3`
- save payload: `shiftmake:slot:<id>:save:v3`
- replay payloads: `shiftmake:slot:<id>:replay:v3.19:<replayId>`

Replay payload storage uses explicit minor versions such as `v3.0` and `v3.19`, not bare `v3`, so deterministic replay payload shape changes can coexist with the same campaign save generation. The loader still accepts older replay keys, including `v3.0`, bare `v3`, `v2`, and early unversioned slot replay keys.

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
