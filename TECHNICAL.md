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
| Persistence | `localStorage` for saves, Render Postgres for production Ladder Rift-sets |

## Core Rule

All gameplay logic lives in `src/engine/` with no DOM or rendering dependencies.

The Svelte and Pixi layers consume resolved engine data. They do not decide outcomes, apply combat rules, or maintain a second copy of gameplay state.

Renderer-neutral presentation helpers live outside `src/ui/`. For example, `src/presentation/iconAssets.ts` is shared by Svelte controls and the Pixi renderer, so `src/rendering/` does not import from `src/ui/`.

Pure cross-runtime helpers that are not gameplay rules live in `src/shared/`. Report base64url encoding and stable report hashing are centralized in `src/shared/reportEncoding.ts`.

## Project Shape

```text
src/
  engine/
    types.ts
    unitCatalog.ts
    army.ts
    battle.ts
    battleAbilityRules.ts
    battleInput.ts
    game.ts
    rift.ts
    upgrades.ts
    save.ts
    ladder.ts

  store/
    contestMultiplayerClient.ts
    gameStore.ts
    saveSlots.ts
    ladderClient.ts
    replayNavigation.ts

  presentation/
    iconAssets.ts

  shared/
    reportEncoding.ts

  ui/
    App.svelte
    BattleControls.svelte
    detailCards.ts
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

The main menu also has a guided tutorial entry. Tutorial progress and its deterministic Contest vs AI save use dedicated local-storage keys outside the three normal save slots. The current tutorial starts from an overworld archive replay, teaches replay inspection and playback, then restarts its fixed tutorial run at the opening unlock screen.

Campaign phases are:

- `opening_unlock`: free opening picks for two races; each race option grants one preselected native starting troop and shows its other native unit classes as later unlock potential
- `race_unlock`: scheduled cycle-start race choice
- `troop_class_unlock`: scheduled troop unlock grant step for a newly unlocked race
- `planning`: normal overworld play
- `game_over`: shown immediately after cycle 10 resolves unless already dismissed for that run

Singleplayer modes are:

- `campaign`: normal local Rift generation
- `ladder`: Campaign progression with database-sourced Rift-sets and harvested follow-up Rift-sets
- `contest`: singleplayer Contest vs AI

## Data Model

### Unit identity

Resolved combatants expose both:

- `unitClassTag`: one primary unit class identity such as `soldier` or `wizard`
- `attributes`: secondary tags such as `melee`, `caster`, `ranged`, `human`, `goblin`, `expendable`

Ability filters match against the combined visible set of `unitClassTag + attributes`.

Combined Arms style logic counts distinct friendly primary `unitClassTag` values only.

### Catalog

`src/engine/unitCatalog.ts` defines:

- abilities
- unit classes
- races
- race upgrades
- troop-class upgrades
- battle mutators

The catalog is declarative. Composition happens in engine helpers:

- `composeBaseTroopDefinition()`: unit class + race adjustments, including resolved cost and derived quantity
- `resolveTroopCombatant()`: player troop with race and troop-class upgrades applied
- `resolveEnemyCombatant()`: enemy troop with tier scaling applied

Important current catalog rules:

- troop quantity is derived as `120 / resolved cost`
- only Goblins modify cost, at `cost x 0.5`
- each race has a native recruit pool; only unlocked races' native rosters are claimable in normal troop drafts
- off-roster `race/unitClass` combinations defeated in Rifts are recorded as latent future unlocks, and become claimable only after their race is unlocked
- enemies can still roll any non-summoned `race/unitClass` combination
- stat upgrades, blueprints, and race-unlock purchases no longer exist
- Rift mutators are currently `momentum`, `haze`, `heavy-air`, `animated`, `corrosion`, `quakes`, and `decay`

### Campaign state

`GameState` stores plain JSON only:

- `version`
- `gameMode`
- `campaignSeed`
- `cycleNumber`
- `phase`
- `essence`
- `victoryPoints`
- `unlockedRaceIds`
- `unlockedTroopUnlockIds`
- `recentTroopUnlockIds`
- `troops`
- `raceUpgradeIds`
- `troopClassUpgradeIds`
- `activeTroopOffer`
- `activeUpgradeOffer`
- `activeRaceUnlockOffer`
- `activeTroopClassUnlockOffer`
- `troopOfferRolls`
- `upgradeOfferRolls`
- `postgameDismissed`
- `openRifts`
- `replayIndex`
- `ladder` when `gameMode = 'ladder'`, containing the current source Rift-set id, generation, and source Cycle
- `contest` when `gameMode = 'contest'`

`TroopInstance` is intentionally minimal:

- `id`
- `raceId`
- `unitClassId`
- `recoveryCyclesRemaining`
- `assignmentRiftId`

Troop size is not persisted on the instance. It is derived from the current resolved troop definition.

### Draft offers

Draft offers are persisted in `GameState` so save/load does not reroll them.

Troop and upgrade offers are revealed together as one Essence draft in normal play. The draft costs `2` Essence when both sides still have options; if one side is fully exhausted, a one-sided fallback costs `1` Essence. Claiming an option from a revealed pack does not cost additional Essence.

Troop offer candidates are limited to:

- native troop combinations for already-unlocked races
- Rift-earned off-roster combinations whose race is already unlocked
- combinations that keep the roster assignable: after the pick, no owned race or troop class may have more troops than there are currently discovered Rifts

Rift-earned combinations for locked races stay latent. They are shown on that race's scheduled unlock option and can be chosen during that race's immediate troop-class unlock flow.

Troop offer buckets:

1. a troop from an owned race
2. a troop of an owned troop class
3. a troop newly enabled by the previous cycle's victorious Rifts for an owned race, then another troop from an owned race

Native race troops are always valid offer candidates.

Off-roster troop combinations only join the candidate pool after the player unlocks them through Rift victories and owns their race.

If the third troop bucket is empty, it falls back to any remaining claimable troop.

Upgrade offer buckets:

1. a troop-class upgrade for an owned troop class
2. a race upgrade for an owned race
3. a random upgrade affecting a random allied troop among those with the fewest existing race-plus-class upgrades affecting them

If a bucket is empty, the picker falls back to any remaining unowned option.

## Current Implemented Content

### Races

- `human`
- `elf`
- `goblin`
- `troll`
- `dwarf`
- `orc`
- `fae`

### Unit Classes

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
- explicit replay `mapHexes` generated by the engine
- footprint-aware placement, movement, targeting, and engagement
- finalized battle maps use row-contiguous hexes with visual-column-aligned zig-zag ends, so each row start/end remains within half a horizontal hex of the others
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

Role behavior is implemented inside `src/engine/battle.ts` and stays fully engine-owned. Battle input/debug construction lives in `src/engine/battleInput.ts`, and reusable ability rule helpers such as target filtering and radius resolution live in `src/engine/battleAbilityRules.ts`.

Shared first check for every acting unit:

1. If the unit is already engaged, it attacks an engaged enemy in melee.
2. Only units with no active engagement continue into role-specific logic.

Frontline decision tree:

1. If any unengaged enemy is in footprint contact, engage and fight immediately.
2. Otherwise choose a role objective that prefers:
   - screening enemy `frontline` or `Pusher` that threatens allied backline access
   - moving into contested positions that block those paths
   - falling through to reachable enemy `backline` only when no frontline or Pusher objective remains
3. Move up to `Move` legal anchor steps toward that objective.
4. If the move ends in enemy footprint contact, engage and fight.
5. If already engaged and under capacity, Frontline can spend `Move` on push-through or reposition candidates that preserve existing contact and keep every final footprint legal.

Pusher decision tree:

1. If engaged with a smaller enemy that another ally also holds, break through that engagement.
2. If unengaged enemies are already in footprint contact, pile onto that fight.
2. Otherwise choose a role objective that prefers:
   - breaching into enemy `backline`
   - preserving an existing backline commitment tracked in transient battle-only runtime state
   - only dropping that commitment when combat legality or board state makes it impossible
3. Move up to `Move` legal anchor steps toward that objective.
4. If the move ends in enemy footprint contact, engage and fight.

Backline decision tree:

1. If enemies share the current hex, score legal adjacent retreat hexes and choose one that best preserves or increases distance from threats.
2. If no legal retreat improves safety, attack an enemy in footprint contact instead.
3. If no enemy shares the hex but one is in range, make a ranged attack.
4. Otherwise score reachable advance hexes within `Move` that move closer without unnecessarily collapsing spacing, then move if a legal improvement exists.

`Move` controls ordinary role movement, retreats, careful advances, Frontline push-through/reposition searches, and Pusher breakthrough follow-through. Quakes remains a special adjacent displacement.

Replay visibility rule:

- Important role decisions emit typed replay metadata such as `roleIntent`, `reasonCode`, `targetRole`, and target hex coordinates.
- UI surfaces such as the event log and battle recap consume that metadata directly and do not reconstruct combat reasoning on their own.

Battles stop on elimination or at `MAX_BEATS = 1000`, then resolve to `victory`, `defeat`, or `draw`.

### startOfBattle resolution order

`startOfBattle` abilities fire in two explicit phases before the first beat:

Phase 1 - army composition checks:
Abilities whose trigger has `condition` or `repeatPerDistinctFriendlyTroopClass`. These need to see the placed army before any summon changes it.

Phase 2 - everything else:
All remaining `startOfBattle` abilities, including summons. Newly summoned units do not receive their own `startOfBattle` triggers.

Rule: any future ability that reads army composition at battle start must use `condition` or `repeatPerDistinctFriendlyTroopClass` on its trigger so it lands in Phase 1 automatically.

### Replay payload

`BattleReplay` includes:

- initial snapshot
- ordered `BattleStep[]`
- outcome
- explicit `mapHexes`
- unit `occupiedHexes` and `footprintOrientation` in snapshots
- resolved troop profiles for both sides
- alive counts across time
- summary info for archive UI

The replay UI always reads resolved replay data and never reconstructs combat state from catalog assumptions. The Pixi renderer draws the replay's explicit map, places icons and effects at footprint centers, and treats `position` as a legacy anchor only.

Battle report and campaign report modules build and validate report payloads in `src/engine/battleReport.ts` and `src/engine/campaignReport.ts`. Their shared base64url and stable-hash helpers come from `src/shared/reportEncoding.ts`, keeping the report format logic consistent without duplicating browser/Node fallbacks in engine modules.

### Battle input context

`BattleInput` may also carry each side's owned race and troop-class upgrade ids alongside the resolved combatants.

The battle engine uses this for side-wide rules that must keep working for future summons even when the troop that normally grants the synergy is not present in that fight. Example: wolves summoned by Druids or Rangers can still benefit from owned wolf-synergy upgrades such as `Thrill of the Hunt`.

## Campaign Loop

`src/engine/game.ts` currently implements:

1. Start a new run in `opening_unlock`
2. Claim two free opening races; each chosen race grants its preselected native starting troop, and other native unit classes remain visible as later unlock potential
3. Enter `planning` with `2` Essence and generated cycle-1 Rifts
4. Spend Essence to reveal combined troop and upgrade offer packs as needed; normal troop offers are limited to unlocked races
5. Claim one troop and one upgrade choice from each revealed combined draft
6. Assign every ready, non-occupying troop to discovered Rifts
7. Resolve every discovered Rift that has assigned troops
8. Apply recovery, archive replay inputs, award VP only on victories, and grant `+2` Essence for the next cycle
9. Generate the next cycle's Rifts
10. At the start of cycle 3, enter a scheduled race unlock: choose up to 3 still-locked races, each shown with native troops, latent defeated-enemy future troop unlocks, 1 preselected race upgrade, and 2 preselected troop class unlocks from that race's native-plus-latent pool
11. At the start of cycle 7, repeat the scheduled race unlock with 2 preselected race upgrades and 3 preselected troop class unlocks from the same native-plus-latent pool
12. After cycle 10 resolves, enter `game_over` once for that run

Assignment rule: no more than one troop of a given race can enter the same Rift unless that race has `United`, and no more than one troop of a given troop class can enter the same Rift.

Important current rule: every ready troop that is not already occupying a Contest Rift must be assigned before ending the cycle. If any Essence draft can still be revealed, or a revealed draft has unclaimed choices, the UI routes the player to Spend Essence before cycle end or multiplayer readiness can be submitted.

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

### Ladder Rift-sets

`src/engine/ladder.ts` owns the pure Ladder data boundary:

- compact `LadderRiftSetPayload` validation
- compatibility issue generation for unknown races, unit classes, upgrades, mutators, invalid cycles, invalid numeric fields, and missing Guardians
- conversion from valid compact Rift-sets into playable `RiftInstance[]`
- conversion from generated Campaign-style Rifts into compact baseline payloads
- harvested payload creation after a completed Ladder Cycle

Ladder payloads store Guardian troop identities plus race and troop-class upgrade snapshots. They do not store baked combat stats. When a Ladder Rift-set is converted back to `RiftInstance[]`, Guardians are resolved through the normal engine composition path so catalog rules remain centralized.

The engine remains pure TypeScript. It does not import fetch, Svelte stores, DOM APIs, server modules, or Postgres code.

## Store and UI Responsibilities

`src/store/gameStore.ts` owns:

- save-slot loading and saving
- dedicated tutorial save loading, restart, and tutorial-step persistence
- replay payload persistence
- cycle-end confirmation state
- screen mode and replay navigation state
- Ladder draw and harvest orchestration through `src/store/ladderClient.ts`
- high-level multiplayer state transitions, while WebSocket lifecycle, reconnect token storage, last-used room preferences, and multiplayer replay payload cache live in `src/store/contestMultiplayerClient.ts`

`src/ui/App.svelte` is intentionally thin:

- renders opening unlock choices
- renders planning state, rifts, troops, draft offers, VP, and archive
- renders the cycle-10 game-over overlay
- renders Ladder start and replace buttons in the singleplayer save-slot UI
- delegates replay playback to the renderer and replay store actions
- delegates reusable inspector/detail-card construction to `src/ui/detailCards.ts`

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

Ladder save data remains in the normal save-slot payload. The shared Ladder Rift-set database is not mirrored into `localStorage`; saves only persist the current source Rift-set metadata and the currently drawn `openRifts`.

## Testing

`npm run test` covers engine and store behavior.

Current tests cover:

- battle determinism
- troop composition and derived quantity
- race and troop-class upgrade resolution
- Rift generation and VP rewards
- campaign flow and draft offer logic
- replay navigation
- save-slot persistence helpers
- game-store confirmation and offer persistence
- Ladder payload validation, conversion, baseline seeding, draw filtering, appearances, and harvested child generation
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

## Multiplayer Hosting

The browser client reads `VITE_MULTIPLAYER_SERVER_URL` at build/dev time. If it is unset or blank, the multiplayer panel and Ladder client default to `ws://localhost:8787` / `http://localhost:8787` for local development. Keep the manual server field visible for LAN testing and custom deployments.

For LAN testing, run the app server on an external interface:

```bash
npm run dev -- --host 0.0.0.0
```

Run the WebSocket room server on the desired port:

```bash
SHIFTMAKE_MULTIPLAYER_PORT=8787 npm run multiplayer:server
```

On Windows PowerShell:

```powershell
$env:SHIFTMAKE_MULTIPLAYER_PORT = '8787'; npm run multiplayer:server
```

The WebSocket server listens on all interfaces by default. Set `SHIFTMAKE_MULTIPLAYER_HOST=0.0.0.0` when the host environment requires an explicit bind address.

For internet deployment, serve the Vite app over HTTPS and set `VITE_MULTIPLAYER_SERVER_URL` to a `wss://` endpoint routed to the room server behind a reverse proxy.

### Multiplayer Room Lifecycle

Contest multiplayer rooms are authoritative in the WebSocket server process. A room snapshot keeps the shared game state, submitted player states, reconnect tokens, connected sockets, player names, and archived replay payload inputs in memory so short disconnects do not destroy an active game.

Rooms track `createdAt`, `updatedAt`, and `lastEmptyAt`. Empty rooms are removed after the server TTL; rooms with at least one connected player are kept. Server restarts are currently allowed to lose active rooms, which matches the private-room target and avoids adding a disk or hosted key-value dependency before the protocol is hardened.

## Ladder Server And Storage

The existing multiplayer server process also serves Ladder HTTP endpoints on the same port:

- `POST /ladder/draw` with `{ "cycleNumber": number }`
- `POST /ladder/harvest` with `{ "parentId": string, "payload": LadderRiftSetPayload }`
- `GET /ladder/list` for the debug viewer
- `GET /ladder/stats` for debug storage statistics

Production storage is Render Postgres. Configure the server with `LADDER_DATABASE_URL`; if unset, `DATABASE_URL` is used as a fallback. Use Render's internal Postgres URL when the database and web service are in the same Render account and region.

On startup, the server initializes the `ladder_rift_sets` table and indexes if needed, then seeds missing Generation 0 baselines until there are 5 sets per Cycle across Cycles 1-10. Seeding is idempotent.

The server includes a memory repository for local/test runs when no database URL is configured. Do not use that in production because server memory is not shared across instances and disappears on restart.

Local Postgres setup:

```powershell
$env:LADDER_DATABASE_URL = 'postgres://USER:PASSWORD@localhost:5432/shiftmake_ladder'
npm run multiplayer:server
```

Render environment variables:

- `LADDER_DATABASE_URL`: preferred internal Render Postgres connection string
- `DATABASE_URL`: accepted fallback
- `SHIFTMAKE_MULTIPLAYER_PORT` or `PORT`: server port
- `SHIFTMAKE_MULTIPLAYER_HOST`: optional bind host
- `SHIFTMAKE_MULTIPLAYER_ALLOWED_ORIGINS`: optional comma-separated origin allowlist

Ladder v1 intentionally has no ranking, rating, matchmaking rating, player rating, or Rift-set rating fields.
