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
    MainMenuNavigation.svelte
    SaveSlotMenu.svelte
    GameOverDialog.svelte
    OpeningUnlockScreen.svelte
    ScheduledUnlockScreen.svelte
    EssenceDraftPanel.svelte
    essenceDraftSession.ts
    PlanningInspector.svelte
    TroopRosterBoard.svelte
    RivalInfoBoard.svelte
    RiftBoard.svelte
    ReadyTroopsPanel.svelte
    PlanningActionRail.svelte
    overworldPrimitives.css
    unitPortraitClusters.css
    planningInspection.ts
    planningAttentionSession.ts
    troopAssignmentInteraction.ts
    cyclePresentationSession.ts
    riftBattlePresentation.ts
    ArchivePanel.svelte
    archiveSession.ts
    archiveDetails.ts
    ReplayViewer.svelte
    ReplayViewport.svelte
    ReplayRecap.svelte
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

Combined Arms style logic counts distinct friendly troop groups, not individual unit bodies.

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
- Rift mutators are currently `momentum`, `haze`, `heavy-air`, `corrosion`, `quakes`, and `decay`

### Campaign state

`PlayerProgress` is the shared structural type for root game progression and
`ContestPlayerState`. `GameState` extends it while retaining the flat version-3
JSON shape. `src/engine/playerProgress.ts` contains the explicit, compiler-checked
projection used by root/contest conversions, AI pseudo-state construction, and
the save loader's root fallback. The projection returns a new outer object and
preserves nested array/object references; it excludes game-only and extra fields.
New progress fields must be supplied by the projection, default constructor, and
save normalization return types. Initial game and both player seats receive
independent default arrays. Save repair logic and its ordering remain separate
from the projection.

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
- `essenceDraftRerollUsed`
- `seenTroopOfferOptionIds`
- `seenUpgradeOfferOptionIds`
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

Each revealed Essence draft has one optional reroll. The player may reroll the troop side or the upgrade side, but not both. Rerolling costs no Essence, preserves the other side, and prefers options not shown earlier in that draft; previously shown options can repeat only when no unseen valid options remain.

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
3. excluding the troop class chosen in bucket 1 and the race chosen in bucket 2, a random upgrade affecting a random allied troop among those with the fewest existing race-plus-class upgrades affecting them and at least one available upgrade after those exclusions

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

### Number quantization

`fixed.ts` uses JavaScript `number` values rounded to two decimal places. It is
not scaled-integer fixed-point arithmetic and does not make decimal fractions
exact in binary floating point. `fixed` preserves the existing
`Math.round((value + Number.EPSILON) * 100) / 100` expression, including negative
tie behavior. Arithmetic helpers quantize each result; `fixedSum` rounds each
addition, so it can differ from rounding the final total. Clamp/minimum helpers
quantize the value but do not round the supplied bounds. `formatFixed` quantizes
before removing unnecessary trailing decimal zeroes. No arithmetic, RNG or save
format change was made. Boundary tests are in `fixed.test.ts`.

### Turn flow

Each beat:

1. All alive units gain readiness equal to rate plus mutator bonus.
2. A `beat` replay step is recorded.
3. Beat-timed mutators then resolve, such as `Quakes` displacement and direct `Decay` HP loss.
4. Units with readiness `>= 100` act in shuffled order.
5. Each acting unit spends `100` readiness.

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

### Battle-local ability state

Each source unit has independent runtime ability instances with trigger counts
and remaining-use budgets. Recipient-owned once-per-battle usage is separate:
`unitOnceEffects.ts` defines typed keys and a fresh-record factory for Mercy Before
Dawn protection, Stoneblood, Fade Into Shadow and Glamour. Placement and summoning
each allocate new records. Ability grants, role changes and side changes do not
reset recipient usage. Mercy protection does not replace the protecting priest's
source budget. Consumption order remains mechanic-specific.

Timed effects, delayed death, side blocking, successful-placement flags, counters
and execution queues retain dedicated state with their existing semantics. See
`docs/ability-state-ownership.md` for the ownership inventory. Runtime records are
not added to visible replay snapshots or persisted battle inputs.

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

Replay delta recording uses `battleUnitComparison.ts`, not JSON serialization,
to compare snapshot units. Required mapped comparator keys cover `BattleUnit`,
`UnitStats`, and `HexCoord`, so adding fields requires an explicit comparison.
String and footprint arrays compare in order; scalar values compare by value,
including nullable troop-instance identity. Object insertion order is irrelevant.
Delta ordering and the materialized replay API remain unchanged. During final
materialization, unchanged unit records are shared across snapshots; every unit
record and its nested stats, coordinates, footprints and string arrays are frozen.
Changed records are cloned before freezing, separate from mutable resolver state.
Snapshot arrays remain independently owned. Consumers must copy a unit before
editing it; the existing mutable TypeScript shape is retained for construction
and compatibility. No lazy cursor or cross-replay cache is introduced. See
`docs/replay-memory.md` for measurements and ownership acceptance.
Mutation-site dirty marking is still deferred.

Battle report and campaign report modules build and validate report payloads in `src/engine/battleReport.ts` and `src/engine/campaignReport.ts`. Their shared base64url and stable-hash helpers come from `src/shared/reportEncoding.ts`, keeping the report format logic consistent without duplicating browser/Node fallbacks in engine modules.

### Battle input context

`BattleInput` may also carry each side's owned race and troop-class upgrade ids alongside the resolved combatants.

The battle engine uses this for side-wide rules that must keep working for future summons even when the troop that normally grants the synergy is not present in that fight. Examples: wolves summoned by Druids or Rangers can still benefit from owned wolf-synergy upgrades such as `Thrill of the Hunt`, and Skeletons from any allied source can gain Hemomancy healing.

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

Important current rule: every available troop that is not already occupying a Contest Rift must be assigned before ending the cycle. If any Essence draft can still be revealed, or a revealed draft has unclaimed choices, the UI routes the player to Spend Essence before cycle end or multiplayer cycle end can be submitted.

Opening recruitment and its UI availability share `canClaimOpeningTroop()` in
`src/engine/game.ts`. It checks phase, native starter identity, seeded race
options, the two-pick limit, and race/class conflicts without mutating state.
`claimOpeningTroop()` uses that query before adding a troop.

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
- applies `+20%` health, damage, and rate only at Tier 4
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

`MainMenuNavigation.svelte` owns home-menu presentation, destination buttons, and
their tutorial lock styling. It has no store subscription or local routing state.
`App.svelte` owns the selected menu view and its routing callback because tutorial
steps and multiplayer exit paths can select those views. Tutorial guards and
action recording remain in that callback. UI debug/design selectors intentionally
cross component boundaries beneath their App-owned surface classes.

`SaveSlotMenu.svelte` owns save-slot presentation and the selected slot for its
new-game picker. Its transient picker state is discarded when the surface leaves
the menu. It receives slot summaries and load/start/blocked callbacks, with no
additional store subscription. `gameModeLabels.ts` supplies shared display labels
and picker descriptions. App retains asset preloading, final tutorial guards,
the fixed tutorial opening transition, and existing game-store save actions.
Start and replacement actions use the same callback; their previous implementations
were identical. Tutorial entry/resume/restart and menu selection remain App-owned.
No gameplay or save data is moved into these components.

`src/store/gameStore.ts` owns:

- save-slot loading and saving
- dedicated tutorial save loading, restart, and tutorial-step persistence
- replay payload persistence
- cycle-end confirmation state
- screen mode and replay navigation state
- Ladder draw and harvest orchestration through `src/store/ladderClient.ts`
- high-level multiplayer state transitions, while WebSocket lifecycle, reconnect token storage, last-used room preferences, and multiplayer replay payload cache live in `src/store/contestMultiplayerClient.ts`

`ReplayPlaybackState` in `src/store/replayPlaybackState.ts` defines loaded replay,
input/report provenance, position, selected event, play state and rate. Its
navigation helper owns beat-skipping steps, clamped seeks and event selection.
The game store remains the atomic snapshot owner and retains its flat public
subscription and methods. Read-only `gameSessionStore` and `replayPlaybackStore`
views notify only when their respective field values/references change. App uses
these separate subscriptions so playback does not invalidate unrelated game
reactivity. Views do not duplicate writable state, resolve battles or persist
data. `src/rendering/replayPlaybackController.ts` owns the single scheduled frame,
presentation timeline cursor and one-entry replay/rate cache. Pause cancels frames;
scene exit/disposal also releases the cache. Replay identity, rate and position
guards prevent stale callbacks from advancing replaced or paused replays.
`src/rendering/replayRendererLifecycle.ts` coalesces asynchronous import/init work
and releases pending or ready renderers exactly once on host/scene changes. Late
completion cannot publish a stale renderer. `ReplayViewport.svelte` wires these
owners to store actions and renderer callbacks, owns the canvas host, playback
controls and zoom, and disposes both owners on unmount. It reads the distinct
session/playback views without duplicating state. `ReplayViewer.svelte` supplies
the synchronous inspection contract and binds navigation kind so event seeks
retain their presentation semantics. Renderer effect frames and delayed timers
are canceled on teardown. See `docs/replay-playback-ownership.md` for coverage.

`ReplayRecap.svelte` owns the mounted recap modal's aggregates, side scaling,
profile/current-unit lookup, expansion state and styles. It receives resolved
replay and snapshot data with portrait/close/inspect callbacks, without a store
subscription. Expansion resets on unmount or replay reference replacement.
`ReplayViewer.svelte` owns modal visibility and the pause/rewind/unit-lock action.
`battleRecap.ts` continues to
derive presentation totals from authoritative replay events, not combat rules.

`ReplayViewer.svelte` also owns hover/lock/profile selection, event pinning,
focus/health presentation, event-log visibility, mutator and ability overlays, and
viewer-local caches. Caches and inspection reset by replay reference, not only ID.
It receives portrait lookup, exit routing, shared diagnostics and a cohesive
tutorial request/action contract from App. Tutorial orchestration remains App-owned;
view requests reset local inspection and choose the requested event-log surface.
No selection state is mirrored back to App. App's display-contents wrapper keeps
debug/design selectors reaching the extracted elements. See
`docs/replay-viewer-extraction.md` for acceptance evidence.

`src/ui/App.svelte` integrates the screen surfaces:

- delegates opening choices and inspection to `OpeningUnlockScreen.svelte`
- delegates scheduled race and legacy troop unlocks to `ScheduledUnlockScreen.svelte`
- delegates Essence draft presentation to `EssenceDraftPanel.svelte`
- delegates archive presentation to `ArchivePanel.svelte`
- delegates shared planning inspection to `PlanningInspector.svelte`
- delegates the owned-race and troop roster to `TroopRosterBoard.svelte`
- delegates revealed rival information to `RivalInfoBoard.svelte`
- delegates Rift board presentation and styles to `RiftBoard.svelte`
- delegates ready troops and footer controls to `ReadyTroopsPanel.svelte` and `PlanningActionRail.svelte`
- renders VP and archive arrival animation
- mounts `GameOverDialog.svelte` for the cycle-10 game-over phase
- delegates singleplayer save-slot and new-game controls to `SaveSlotMenu.svelte`
- delegates replay presentation and interaction to `ReplayViewer.svelte`
- delegates reusable inspector/detail-card construction to `src/ui/detailCards.ts`

`GameOverDialog.svelte` owns scored-run overlay presentation and scoped styles.
It receives victory points and continue/menu callbacks without subscribing to a
store or owning phase state. App retains the phase-based mount and guarded menu
routing; the existing game-store action owns continuation and persistence.
Debug/design selectors continue to reach its dialog and action targets.

`OpeningUnlockScreen.svelte` receives authoritative game data, portrait lookups,
and a cohesive opening-action contract. It owns hover/pin inspection, ability
disclosures, and opening-specific presentation/CSS, with no store subscription
or local copy of selected troops. Eligibility comes from the engine query. App
retains recruitment commands, tutorial action recording, guarded Begin routing,
and the room-session header passed through a slot. App can reset the component's
inspection when orchestrating tutorial/scene changes. The display-contents
overworld wrapper preserves debug/design target access. Existing responsive
rules move with the screen; no mobile redesign is introduced.

`ScheduledUnlockScreen.svelte` owns scheduled unlock markup, scoped styles,
transient race selection and inspection. It previews granted upgrades using the
engine's combatant resolver, without duplicating grant rules. App retains claim
callbacks and room-session controls through a slot. Game/offer data comes from
the store; the component neither subscribes nor persists state. Offer replacement
clears transient race selection, and App can reset inspection when changing scenes.

`essenceDraftSession.ts` owns draft selection, hover/reroll presentation and
confirmed-card state in one read-only subscribable session. App and
`EssenceDraftPanel.svelte` read that same owner; neither mirrors its writable
state. Synchronization receives current game/offer data and session/cycle identity,
without copying authoritative offers. Context changes clear local state; new
offers clear confirmed cards; inspection resets clear selections but retain
confirmed cards for the current cycle. App supplies store command/tutorial
callbacks and shared planning inspection. Upgrade highlights consume explicit
session dependencies in Svelte, including the ready troop and Rift surfaces.
The draft component owns presentation and scoped styles. It has no gameplay-store
subscription. Auto-reveal and tutorial routing remain App-owned; planning
attention has a separate lifecycle owner. The Essence tutorial targets Races & Troops rather than the removed
counter; the reveal lesson advances when an authoritative draft is already open.

`archiveSession.ts` owns archive selection and viewport-based pagination through
a read-only subscription shared by App and `ArchivePanel.svelte`. It retains no
gameplay data and clears stale selections when entries disappear. The panel owns
list/detail presentation and scoped styles; `archiveDetails.ts` derives stored
combatants, relevant upgrades and replay performance without mutating sources.
App supplies replay access, commands, tutorial guards and shared inspection.
Arrival flight markup is passed through a slot because its geometry and timing
remain coupled to Rift animation. Replay exit restores archive selection after
the route-change inspection reset. Footer empty space passes pointer events
through, and the archive reserves room above the End Cycle controls.

`planningInspection.ts` owns hovered/pinned detail cards, comparison selection,
highlight keys and owner-scoped ability tooltips in one read-only subscribable
session. App and `PlanningInspector.svelte` share that owner without writable
copies. The first pin is retained while a second is replaced; two pinned units
suppress further unit hover previews. Draft selections replace inspection
atomically. Scene/context changes reset the session through App's existing
orchestration. App retains tutorial signal callbacks for enemy/mutator inspection.
The sidebar component owns presentation, ability disclosure DOM behavior and
scoped styles. It receives resolved selected-troop data for the existing roster
fallback; game rules and assignment commands remain engine/store owned. The
unreachable selected-Rift sidebar and its unused derived queries were removed.

`troopAssignmentInteraction.ts` owns pointer/mouse/native drag state, click
suppression and assignment conflict presentation through a read-only subscription.
It tracks and removes document/window listeners on completion, cancellation,
context reset and App teardown. Native payloads are structurally validated before
calling App. App retains engine eligibility queries, assignment/store commands,
selection and tutorial signals; the interaction owner contains no gameplay rules.
`cyclePresentationSession.ts` owns cycle handoff timers and archive-arrival render
and frame scheduling through a read-only subscription. Timing constants are
shared with App's mini-replay and flight markup and preserve the existing timeline,
PvP phase delay and stagger. Animation identity guards reject stale callbacks;
replacement, cancellation and teardown release pending timers/frames. A completed
identity is retained until the store changes it, preventing restart during delayed
Ladder finalization. App retains the finish-cycle command, scene routing, flight
geometry and tutorial signals. An App integration test renders real resolved data
and checks exact handoff delays. The session has no gameplay or persistence state.

`planningAttentionSession.ts` owns End Cycle hover/focus state and the 2400 ms
Essence focus pulse through a read-only subscription. Repeated pulses replace
their timer; stale callbacks, context replacement and teardown cannot leave
attention behind. App synchronizes campaign/session, cycle, phase and screen
identity, intentionally excluding center mode so the Spend Essence command can
switch boards without canceling its pulse. App keeps eligibility/blocking queries,
focus commands, tutorial signals and assignment-arrow geometry. Assignment
attention is hover/focus driven; the unused assignment pulse path was removed.

`riftBattlePresentation.ts` derives phase orientation, participant/result
perspective, force grouping, loss classes and visible Rift defenders from explicit
game/record inputs. It is shared by the Rift board and archive-arrival visuals,
with no store subscription or lifecycle state. Combatant stats come from engine
queries; outcomes and phase order come from resolved records. Existing legacy
human/ai participant identities and no-guardian PvP sequencing remain supported.
The health-tone type is shared here rather than exported from a Svelte component.

`RiftBoard.svelte` owns Rift markup, applicable scoped styles and mini-replay phase
mounts. It receives authoritative game/resolution data, the existing assignment
interaction owner, shared inspection, and a cohesive planning contract. It has
no gameplay-store subscription or local selection copy. Engine queries supply
assignment eligibility and upgrade applicability. App retains assignment commands,
selection/click suppression, tutorial signals, holding identities and hint/arrival
geometry. Debug/tutorial/drop/flight selectors remain unchanged. Parent layout
selectors cross the component boundary with `:global(.rift-grid)`; board-specific
responsive rules and force keyframes move with the markup. Shared primitives
remain a consolidation target.

`ReadyTroopsPanel.svelte` presents authoritative ready troops and engine-resolved
stats. It receives the existing assignment interaction and planning inspection
owners; App retains selection commands, click suppression and tutorial signals.
Ready drop targets, attention/hint attributes and density breakpoints are unchanged.

`PlanningActionRail.svelte` owns footer layout, system notices and cycle controls.
App supplies cycle/notice callbacks and draft, ready and tutorial slots, retaining
phase guards and submission authority. Blocked `aria-disabled` feedback remains
separate from actual disabled controls. Slot-sensitive layout selectors explicitly
cross component boundaries. Neither component subscribes to the gameplay store
or maintains a second gameplay state.

`overworldPrimitives.css`, imported once in `main.ts`, supplies shared button,
panel, label and margin defaults to the overworld surface/shell. Ten extracted
surfaces no longer duplicate these canonical declarations; component-specific
variants and responsive rules stay scoped. App retains its own defaults for
App-owned controls outside the overworld, and remains the owner of body and
global debug/design styles. The shared portrait stylesheet owns cluster layering
and density separately. Shared defaults are not applied to replay/menu surfaces.

`TroopRosterBoard.svelte` derives owned races, resolved troop presentations and
future draft classes from authoritative game data and engine queries. It owns
roster markup and applicable scoped styles, with no store subscription or local
selection copy. App supplies selected race/troop identities, portrait lookups,
selection callbacks and the shared inspection contract. Highlight keys and game
inputs are explicit template dependencies. App retains selection/reset behavior,
tutorial commands and routing. The component preserves existing debug selectors
and high-density portrait clusters. Other shared scoped CSS remains a consolidation
target while the other planning boards are extracted.

`RivalInfoBoard.svelte` owns revealed rival roster/upgrade presentation and
scoped styles. It reads the last completed-cycle `opponentInfo` snapshot for
troops and upgrades, not the current live rival roster. Current Rift occupation
determines which revealed troops receive mobile-threat styling. Combatant stats
and abilities come from the engine resolver; the shared planning inspector owns
selection. The board has no store subscription or local gameplay state. App keeps
view routing and tutorial signals. Empty/unrevealed intel and debug selectors
retain their existing behavior.

`unitPortraitClusters.css`, imported once by `main.ts`, owns identical portrait
density, foreground layering and background positioning rules across planning,
draft, unlock, roster, rival and archive surfaces. Rules are confined to
`.overworld-surface` and `.overworld-shell`; the common `.unit-icon-cluster` class
on variant selectors keeps their specificity above retained Svelte-scoped base
rules. Surface layout, responsive rules and differing detail-art declarations
remain local. This stylesheet contains presentation only, not quantity decisions.

## Persistence

Save data uses `localStorage`:

- 3 save slots
- one game-state payload per slot
- replay payloads stored separately per slot

Current keys are versioned for the rewrite:

- slot index: `shiftmake:slots:v3`
- save payload: `shiftmake:slot:<id>:save:v3`
- replay payloads: `shiftmake:slot:<id>:replay:v3.19:<replayId>`

Replay payload storage uses explicit minor versions such as `v3.19`, not bare `v3`, so deterministic replay payload shape changes can coexist with the same campaign save generation. The loader reads only the current replay key prefix.

Replay payloads are stored as serialized `BattleInput`, not full replay output. Archived battles are reconstructed by re-running the deterministic resolver when opened.

Replay archive retention:

- max 40 archive entries
- soft storage cap of about 4 MB for replay payloads
- older payloads may be evicted and reduced to summary-only archive entries

Legacy campaign saves are intentionally unsupported and are not migrated. Legacy v1 save keys and old replay prefixes are ignored.

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

Server and browser share the message contract in `src/shared/multiplayerProtocol.ts`.
Room snapshots include a `statusCode` independently of their readable `message`:
`idle`, `notice`, `cycle-submitted`, `cycle-canceled`, `resolving`,
`cycle-resolved`, `contest-updated`, or `error`. Room errors also carry `error`.
The store uses codes to classify routine notices and new-battle animation;
resolving, error, and unknown notices remain visible. Waiting status is projected
per player: the submitted player receives `cycle-submitted`, the other `idle`.

Display text remains on the wire for existing clients. New clients support servers
without codes through the isolated legacy-message adapter in the shared protocol
module. Remove that adapter when deployment requires code-capable servers. An
explicit unknown/invalid code never falls back to message wording. Room lifecycle
notices use `notice`; rejected submissions use `error`, including their subsequent
per-player snapshot. Connection feedback and optimistic local submission messages
remain client-owned and are not used to classify server behavior.

Contest multiplayer rooms are authoritative in the WebSocket server process. A room snapshot keeps the shared game state, submitted player states, reconnect tokens, connected sockets, player names, and archived replay payload inputs in memory so short disconnects do not destroy an active game. Clients first try token-based reconnects from browser session storage. If the token is missing, entering the same room code with the same player name reclaims that remembered seat, rotates the reconnect token, and preserves submitted readiness.

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
