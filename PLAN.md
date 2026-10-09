# Audit Implementation Plan

Implement the code-audit recommendations reviewed in this conversation, with the
revised sequencing and constraints below. This replaces the earlier combined
playthrough and audit backlog. The original `AUDIT.md` is currently absent;
implementation should verify each finding against the current source.

Milestones 0-10 are complete. Complete and verify one
milestone before starting the next, recording its outcome here. The separately discussed multiplayer room UX,
playthrough fixes, and mobile redesign are outside this plan.

## Implementation Rules

- Read `TECHNICAL.md` before code changes. Gameplay rules remain in `src/engine/`
  with no DOM, Svelte, Pixi, networking, or persistence dependencies.
- Preserve deterministic outcomes, event ordering, and replay data for fixed
  inputs and seeds. Version intentional compatibility changes explicitly.
- Prefer focused changes with clear state ownership. Reduced file size alone is
  not evidence that a refactor improved the architecture.
- Reuse existing helpers and CSS tokens. Keep structural extractions separate
  from visual redesigns and gameplay changes.
- Preserve user changes and asset source material. Generated-file cleanup should
  remove files from tracking while leaving local copies available.
- Update technical and design documents when implementation changes their claims.

## Milestone 0 - Baselines And Repository Hygiene

Completed 2026-10-08. Evidence and reproducible measurements are in
`docs/audit-baseline.md`. Added five compressed complete replay references and
mechanic checks; final suite passed 304 tests in 29 files (28.03s), and the
production build passed. Generated logs/captures were untracked with local copies
preserved; archived source assets remain intact. Opening/seeking baselines measure
the resolver/navigation boundary, not browser rendering or retained heap size.

Record current test results, build results, slow suites, and line counts for
`src/ui/App.svelte`, `src/store/gameStore.ts`, and `src/engine/battle.ts`.

Select a small set of deterministic battle fixtures covering ordinary combat,
summons, death prevention, timed effects, and a long battle. Capture reference
outcomes and complete replay data before engine refactors. Measure resolver time,
replay object size, and replay opening/seeking costs under documented conditions.
Add focused reference coverage where existing tests leave a gap.

Inspect tracked generated artifacts. Add scoped ignore rules for generated logs,
`canvas-capture.png`, and `artifacts/`, then untrack verified generated files.
Preserve `assets/Deprecated/` and `assets/unit sprites old/` for later inspection.

Acceptance: reproducible baseline commands and results are recorded; generated
artifacts are ignored; source/reference assets are preserved. Baselines must be
captured from the current implementation rather than copied from the July audit.

## Milestone 1 - Typed Multiplayer Statuses

Completed 2026-10-08. Shared server/client contract and code classification live in
`src/shared/multiplayerProtocol.ts`; server broadcasts carry per-player status
codes and all room errors carry `error`. Store classification and cycle animation
no longer depend on wording for code-capable servers. Legacy display fields remain
compatible with older clients, and an isolated adapter supports code-less servers.
Remove the adapter when deployments require code-capable servers; explicit unknown
codes never fall back to copy. Protocol, store, and two-client server tests cover
waiting/canceled/resolving/resolved/updated/error transitions and conflicting text.
Full suite: 319 tests in 30 files passed; production build passed. Full TypeScript
checking still fails on existing repository errors, with no diagnostics in the new
protocol files or corrected baseline tooling. Compatibility is documented in
`TECHNICAL.md` under Multiplayer Room Lifecycle.

Replace behavioral comparisons against English status messages with typed status
codes across the server/client boundary. Inventory every producer and consumer
before changing the protocol. Keep readable display messages separate from status
classification and retain unknown/error handling.

Define how an updated client handles a server without status codes, and how an
existing client handles an updated server. Preserve existing message fields when
they provide compatibility; any legacy copy-based fallback must be isolated and
temporary, with its removal condition documented.

Acceptance: waiting, submitted, canceled, resolved, and error transitions have
focused protocol/store coverage. Changing display wording does not change
behavior. Use local server tests; this milestone does not redesign room controls.

## Milestone 2 - Compiler-Checked Player Progress

Completed 2026-10-08. `PlayerProgress` defines the shared fields, with an explicit
typed projection reused by root/contest and pseudo-state conversions and the save
fallback. Defaults remain independent per player; projections preserve nested
references and exclude game-only fields. Version-3 saves retain their flat shape
and existing normalization order. Four focused tests cover every progress field,
both player seats, pseudo-states, reference ownership, and save loading. The shared
type/projection pass isolated strict TypeScript checking. Full suite: 323 tests in
31 files passed (24.74s), including complete replay references; production build
passed (16.73s). The boundary is documented in `TECHNICAL.md`.

Remove duplicated progress declarations and conversion lists while preserving the
existing saved JSON shape. A shared `PlayerProgress` interface extended by both
state types is acceptable; a compiler-checked projection is also acceptable.
Choose the smallest approach that checks both field types and completeness.

Audit constructors and both directions of contest pseudo-state conversion.
Preserve intentional cloning/reference behavior and keep game-only fields out of
player progress. Do not introduce a nested save structure merely for deduplication.

Acceptance: round-trip tests cover all progress fields, offers, reroll history,
troops, and upgrades. Adding a progress field requires compiler-checked handling
in conversion paths. Existing save loading and contest progression remain valid.

## Milestone 3 - Main Menu Extraction

Completed 2026-10-08. `MainMenuNavigation.svelte` owns home destinations and lock
styling; `SaveSlotMenu.svelte` owns the save list, new-game picker state and styles.
Neither adds a store subscription or a copy of routing/gameplay state. App retains
route selection, asset loading, final tutorial guards and scene transitions, and
existing store actions. `gameModeLabels.ts` shares presentation helpers; identical
start/restart callbacks were consolidated. Debug/design selectors reach extracted
elements. Six SSR tests cover availability, metadata, labels and tutorial locks.
Browser checks covered all menu destinations/back navigation, empty and occupied
slots, Campaign/Ladder/Contest selection, loading, replacement, close/backdrop
dismissal, tutorial start/resume, and design-mode selectors. New saves/replacement
were tested on an initially empty separate origin, leaving existing saves intact.
Default and 1440x900 screenshots showed intact menu/picker styling with no clipping
or overflow. Final full suite: 329 tests in 33 files passed (31.90s); production
build passed (18.01s), retaining only the existing large-chunk warning. Boundaries
are documented in `TECHNICAL.md`. Ladder selection was verified through its opening
screen, not a remote Ladder draw; no multiplayer connection or mobile redesign.

Extract one bounded main-menu surface from `App.svelte`, followed by its save-slot
and new-game controls only when the first extraction is stable. Define ownership
for routing, menu selection, save actions, and tutorial entry explicitly.

Keep existing store methods and pass cohesive data/callbacks through a small
component contract. Avoid an extraction that leaves all reactivity in App and
introduces a large bag of props. Move presentation helpers when they belong to the
extracted surface. Reuse tokens already defined in `src/app.css`; migrate touched
duplicate literals without a visual redesign.

Acceptance: browser checks cover menu navigation, save loading, new-game selection,
and tutorial entry. Component CSS still applies after extraction, and ownership
is clearer without adding duplicate state or subscriptions.

## Milestone 4 - Explicit Battle Unit Comparison

Completed 2026-10-08. `battleUnitComparison.ts` replaces dirty-check serialization
with explicit required mapped comparator tables for all 19 unit fields, eight
stats, and both hex coordinates. Ordered arrays, nullable identity and independent
nested objects have focused coverage; new optional fields also require handling.
The module and its 31 tests pass isolated strict TypeScript checks, including the
repository's unchecked-index/exact-optional flags. Complete replay goldens remain
unchanged without recapture; snapshot/delta/materialization APIs are untouched.
Fresh before/after benchmark results are recorded in `docs/audit-baseline.md`:
resolver medians decreased for these small fixtures, but opening/seek timings vary
and no production-scale or memory claim is made. Full suite: 360 tests in 34 files
passed (21.31s); build passed (14.93s). Mutation-site dirty marking remains deferred.

Replace `JSON.stringify` in battle-step dirty checking with explicit equality for
every observable `BattleUnit` field, including nested stats, ordered arrays,
footprints, and optional values. Ensure future fields cannot silently escape the
comparison, using a compiler-checked comparison structure where practical.

Retain the current materialized replay API. Compare complete replay data against
Milestone 0 fixtures and rerun the same performance measurements. Keep mutation-
site dirty marking as a separate, evidence-driven optimization.

Acceptance: focused tests cover changed and unchanged fields, fixtures preserve
complete replay equivalence, and measured costs are recorded. Do not claim a
performance improvement from removing serialization alone.

## Milestone 5 - A Small Ability-State Migration

Completed 2026-10-08. `docs/ability-state-ownership.md` inventories runtime owners,
lifetimes, reset rules and replay effects. Four recipient-owned once-per-battle
flags now use `unitOnceEffects.ts`: Mercy protection, Stoneblood, Fade Into Shadow
and Glamour. Initial placement and summoning allocate independent typed records;
source ability budgets, consumption order and complex dedicated state stay intact.
Thirteen focused tests cover independent recipients, multiple priests, limited
source budgets, repeated triggers, summons and battle reset. Six complete replay
references were captured before this migration and remain equivalent, alongside
the original five references. The new state module passes isolated strict checks
with unchecked-index/exact-optional flags; its fixture passes strict checking,
but those extra flags expose existing imported catalog errors. Full suite: 373
tests in 35 files passed (19.22s); production build passed (12.70s), with the
existing large-chunk warning. No replay/save schema or gameplay changes.

Inventory runtime state by owner: ability instance, recipient unit, troop, side,
or battle. Record lifetime, reset behavior, and whether it affects visible replay
data. Examine the existing runtime ability structure before adding another one.

Choose a small group of simple flags or counters with matching semantics. Use
typed keys and explicit accessors if shared storage helps; avoid arbitrary string
counter maps. Mercy Before Dawn, for example, has both recipient protection state
and protecting-priest uses, which must remain distinct.

Keep delayed death, side blocking, summons, corpse rules, and pending multi-beat
effects explicit when their shapes differ. Add short comments only where the
reason for dedicated state would otherwise be unclear. Expand the migration only
after the first group demonstrates a simpler implementation.

Acceptance: tests cover ownership, repeated triggers, multiple sources/recipients,
and initialization of summoned units where relevant. Reference replays remain
equivalent, and migrated mechanics are easier to initialize and maintain.

## Milestone 6 - Replay Playback Ownership

Completed 2026-10-08. Ownership inventory and store-test timings are in
`docs/replay-playback-ownership.md`. Typed playback defaults/navigation and distinct
read-only session/playback views preserve the flat game-store API and atomic
transitions. App uses separate subscriptions; focused tests verify no session
notifications or persistence changes during playback. A routing-only tutorial
test now seeds persisted progress instead of resolving a battle; real tutorial
and archive/report integrations remain. `replayPlaybackController.ts` owns the
single frame loop and bounded timeline cache; `replayRendererLifecycle.ts` owns
pending imports, initialization and exactly-once renderer release. Renderer
effects cancel queued frames and the drag-reset timer on teardown. Focused tests
cover stale callbacks, pause/resume, rate changes, seeks, same-ID replay replacement,
pending initialization, host changes and failures. Store tests cover two archived
inputs, tutorial replay transitions and fake-socket multiplayer replay arrival.
Desktop checks covered ordinary/summon/long archives, event seeking, rate changes,
pause/resume/end, active exit (zero canvases), reopening (one canvas), and tutorial
resume. Full suite: 401 tests in 39 files passed (20.19s); production build passed
(14.67s), retaining the existing chunk warning. Isolated strict checks pass for
the new owners and tests; existing repository-wide type errors remain. No whole-
suite speedup, live multiplayer UI, or mobile redesign is claimed.

Map ownership of loaded replay, playback position/rate, timers, renderer lifecycle,
and navigation before extracting playback state. Preserve public game-store
methods during the transition. Keep session, persistence, and tutorial ordering
explicit; split multiplayer/tutorial stores only if a concrete benefit emerges.

Profile slow store tests. Improve expensive fixtures for tests concerned only with
routing, persistence, or playback. Introduce resolver injection only when the
measurements justify it, retaining representative real battle/store integration
tests. Do not shorten simulations in ways that change the behavior being tested.

Acceptance: playback subscriptions avoid unnecessary unrelated work; pause,
resume, rate changes, seeking, replay switching, and leaving the screen work.
Timers and renderer resources are cleaned up. Tutorial transitions, archive
loading, and multiplayer replay arrival have regression coverage.

## Milestone 7 - Replay Screen Extraction

Completed 2026-10-08. `ReplayViewer.svelte` now owns inspection/selection, event-log
and health presentation, ability/mutator overlays, recap visibility and rewind/
focus actions. It composes `ReplayViewport.svelte` and `ReplayRecap.svelte`; the
synchronous inspection contract and navigation-kind binding are internal to the
viewer. App retains routing/tutorial orchestration, asset portraits and shared
diagnostics, not viewer-local state. Replay-reference keys prevent stale roster/
profile caches and inspection on same-ID replacement. Viewer styles moved with
their elements and existing breakpoint rules; App's debug/design wrapper still
reaches extracted targets. Three additional SSR tests cover empty/resolved
presentation and tutorial view requests. Final desktop checks covered ordinary,
summon and long archives; steps, playback/rate, forward/back event seeks, reset,
field-unit inspection, recap rewind, active exit (zero canvases), and reopening
(one paused canvas). Tutorial inspection progressed and exit guards remained
effective; design mode selected extracted controls. Full suite: 408 tests in 42
files passed (27.64s); build passed (15.95s), retaining only the existing chunk
warning. Details and historical intermediate checks are in
`docs/replay-viewer-extraction.md`. No gameplay, schema, live multiplayer UX or
mobile redesign changes.

First bounded extraction: `ReplayRecap.svelte` owns
recap aggregates, profile lookup, side scaling, troop expansion and modal styles.
It takes resolved replay/snapshot data, portrait lookup and close/inspect callbacks,
without a store subscription. App initially retained opening the modal and the
rewind-and-lock action before the viewer moved. Expansion resets on unmount or replay
reference replacement; recap computation no longer runs while the modal is closed.
Two SSR tests cover totals, side scaling, collapsed state and empty sides. Desktop
checks covered expansion, alive/dead labels, focus, rewind from 140 to 139, close/
reopen reset, close button, backdrop dismissal and a different archived replay.
Renderer exit still removes its canvas. Full suite: 403 tests in 40 files passed
(25.63s); build passed (15.99s), with the existing chunk warning. This is intermediate
verification, not completion of the `ReplayViewer.svelte` extraction.

Second bounded extraction: `ReplayViewport.svelte` owns the canvas host, renderer
initialization/release, playback-controller wiring, playback controls and zoom.
The DOM shape and tutorial/debug targets remain intact; App initially supplied
synchronous inspection callbacks and bound presentation navigation kind. Store
actions and the distinct read-only views remain authoritative. Two SSR tests cover
empty/playback controls, target selectors and no browser initialization during
SSR. Desktop checks cover steps, play/pause/rate, forward/backward event seeking,
reset, field-unit click, active exit with zero canvases, a different archive with
one paused canvas, and tutorial resume with its targets. Full suite: 405 tests in
41 files passed (27.71s); build passed (18.66s), with only the existing chunk
warning. The final extraction moved that callback boundary inside the viewer.

Extract `ReplayViewer.svelte` using the ownership established in Milestone 6.
Move viewer-local selection, controls, event-log, recap, and renderer integration
in small verified changes. Keep resolved engine replay data authoritative.

Acceptance: desktop browser checks cover opening archived battles, playback,
forward/backward seeks, event selection, unit inspection, recap, switching replays,
and exiting. Preserve tutorial target selectors and verify renderer teardown.

## Milestone 8 - Overworld Extraction

Completed 2026-10-09. The incremental extraction records below are historical;
final acceptance is documented in `docs/overworld-extraction.md`. Ownership is
explicit across the extracted surfaces and shared transient-state sessions, with
engine/store authority and App routing, guards, tutorial orchestration and DOM
geometry retained. Final desktop acceptance covered opening picks, combined
drafts, blocked submission, assignments, cycle handoff, scheduled claims, archive
replay access and the complete tutorial. Four actual arrival flights were measured
with a temporary development trace, then the trace was removed. Final suite passed
510 tests in 65 files (23.88s), including local store/server coverage; production
build passed (13.10s), existing chunk warning only. CSS is 209.39 kB (gzip 30.41 kB).
Existing global TypeScript errors and the pre-audit opening hover reflow at the
1280px breakpoint remain documented limitations, not new extraction behavior.
No live multiplayer/mobile acceptance or commit is claimed.

Incremental work began 2026-10-08. First bounded extraction: `GameOverDialog.svelte` owns
the scored-run overlay markup and styles, receiving authoritative VP and two
action callbacks. App still decides when it is mounted, guards menu routing, and
calls the existing store continuation action. No store subscription, duplicate
phase state, or gameplay logic was added. Two SSR tests cover score presentation,
dialog labeling, debug targets and action-free rendering. Desktop checks on the
isolated QA origin covered menu exit, reload from the game-over save, continuation
to planning, persisted continuation after reload, and design-target selection.
The constructed fixture tests UI routing, not reaching game over through ten
resolved cycles. Full suite: 410 tests in 43 files passed (21.92s); build passed
(13.87s), with only the existing chunk warning. Planning, drafts, scheduled
unlocks, archive, and shared inspection state remain to be extracted; this does
not complete Milestone 8. See `docs/overworld-extraction.md` for ownership notes.

Second bounded extraction: `OpeningUnlockScreen.svelte` owns opening picks'
presentation, hover/pin inspection and ability disclosure state, without a store
subscription or mirrored selection state. It reads authoritative game data and
the shared `canClaimOpeningTroop` engine query; recruitment now uses that same
query, preserving its checks and outcomes. App retains store commands, tutorial
signals/guards, and room-session controls through a slot. An inspection reset
method supports App's tutorial/scene orchestration. Existing opening styles and
responsive rules follow the elements; debug/design targets remain reachable.
Three engine tests cover eligibility/claim equivalence across all native troops
and three seeds, phases, two-pick limits, deselection and source immutability.
Three SSR tests cover seeded choices, future inspectors, selection and action
availability. Desktop checks covered starter/future inspection, ability disclosure,
two picks, deselect/replacement, save/reload, Begin Campaign, and design selection.
The existing guided tutorial progressed through its opening picks into Essence.
Full suite: 416 tests in 45 files passed (22.26s), including unchanged replay
references; build passed (12.83s), with the existing chunk warning. No live
multiplayer or mobile browser validation is claimed. This remains partial M8 work.

Third bounded extraction: `ScheduledUnlockScreen.svelte` owns scheduled race
selection/inspection and legacy troop unlock presentation, while App retains
claim callbacks and slotted room controls. Grant previews still use engine
resolution; no grant rules or store subscriptions moved into the UI. Offer changes
clear transient selection. Three SSR tests cover cycle-3/7 choices, advertised
troops, read-only controls and legacy rendering. Desktop checks verified offer
selection/deselection, inspection, ability disclosure, confirmation, exact grants,
reload persistence and successive legacy picks. Fixtures use constructed cycle
contexts with real engine offers, not full multi-cycle playthroughs. Full suite:
419 tests in 46 files passed (22.80s); build passed (13.53s), with only the existing
chunk warning. Scoped stylesheet size rose from 191.30 to 214.95 kB (gzip 28.93
to 30.49 kB); shared inspection styles can be consolidated when their remaining
ownership is settled. No live multiplayer or mobile validation is claimed.
Planning/assignments, archive and shared planning inspection remain after the
following draft extraction.

Fourth bounded extraction: `EssenceDraftPanel.svelte` owns footer draft
presentation and CSS. The shared `essenceDraftSession.ts` owns selection, reroll
hover and confirmed-card state, with a read-only subscription used by App and
the component. No gameplay offers are mirrored. Existing store commands,
tutorial signals, shared inspector callbacks and auto-reveal remain App-owned.
Five session tests and three SSR tests cover lifecycle, stale offers, reroll,
partial/full confirmations, read-only controls and action-free rendering.
Desktop checks verified selection/deselection, inspector pinning, synergy and
ready-troop highlights, reroll retention, both claims, view/slot changes and save
persistence. Dynamic troop-cluster styles and confirmed portrait dimensions were
verified visually. Removed the unreachable old sidebar draft and stale scheduled
selection state. The tutorial's removed Essence-counter target now points at
Races & Troops, with an allowed view transition; an active offer advances the
automatic-reveal lesson. The dedicated tutorial reached Draft Choices and then
the Rifts lesson after both claims. No mobile/live multiplayer pass is claimed.
Full suite: 427 tests in 48 files passed (32.73s), including unchanged replay
references; build passed (18.77s), with only the existing chunk warning and no
unused CSS warnings. CSS is 217.65 kB (gzip 31.95 kB). Global TypeScript checking
still has existing repository errors. M8 remains in progress.

Fifth bounded extraction: `ArchivePanel.svelte` owns archive list/detail
presentation and CSS; `archiveSession.ts` owns selection and viewport pagination;
`archiveDetails.ts` derives stored forces, upgrades and performance. App retains
store access, shared inspection, tutorial commands and slotted arrival flights.
Eight focused tests cover lifecycle, pagination, source immutability, selected
forces, summary-only/missing payloads and action-free rendering. Desktop browser
checks verified list/detail inspection, ordinary/summons replay access, restored
selection on replay exit, both pagination directions and summary-only fallback.
The pass fixed an unwired return callback and route-reset ordering, plus footer
click interception over pagination. Empty footer space now passes clicks through,
with archive controls above End Cycle; draft controls remain interactive.
Full suite: 435 tests in 51 files passed (15.59s); build passed (8.49s), with only
the existing chunk warning. CSS is 234.08 kB (gzip 33.67 kB), reflecting scoped
shared-style duplication still to consolidate. Arrival geometry, broader tutorial
progression and planning acceptance remain unverified here. No mobile/live
multiplayer pass or commit is claimed. M8 remains in progress.

Sixth bounded extraction: `planningInspection.ts` owns shared hover/pin details,
two-unit comparisons, highlight keys and owner-scoped ability tooltips.
`PlanningInspector.svelte` owns sidebar presentation, disclosures and scoped CSS.
Board, roster, draft and archive callbacks all use the same read-only session.
App retains tutorial signals and scene reset orchestration; engine/store data and
commands remain authoritative. Removed the unreachable selected-Rift sidebar and
its unused derived queries. Six session tests and four SSR tests cover pin/hover
ordering, comparison limits, draft replacement, ability ownership, resets,
summons, resolved roster fallback and action-free rendering. Desktop acceptance
verified board comparisons, second-pin replacement, summon and ability inspection,
draft replacement, roster/view resets, archive inspection and replay cleanup.
The dedicated tutorial advanced through Rift enemy and modifier inspection to
Assign Troops. No assignment, arrival-flight or full tutorial completion is claimed
by this extraction. Full suite: 445 tests in 53 files passed (28.41s); final focused
tests passed after optional-field type repair. Build passed (13.18s), with only
the existing chunk warning and no unused CSS warnings. CSS is 246.63 kB (gzip
34.58 kB); shared-style consolidation remains pending planning extraction.
The new TS/test files have no filtered TypeScript diagnostics, while global
repository errors remain. M8 is still in progress, with assignment/drag, planning
boards, cycle attention/animation and final acceptance remaining.

Seventh bounded extraction: `troopAssignmentInteraction.ts` owns drag state,
pointer/mouse/native listeners, post-drag click suppression and conflict display.
App keeps engine validation, assignment commands and tutorial signals. Reset and
unmount now remove listeners; native payloads are structurally validated.
Twelve focused tests cover thresholds, duplicate event delivery, cancellation,
reset/disposal, suppression and native payloads. Browser acceptance verified valid
and rejected assignments, Rift-to-Rift movement, unassignment and the ready-troop
cycle gate. The dedicated tutorial resumed from Assign Troops through cycle
resolution, archive details, rival information and completion, without replacing
normal save slots. The cycle pass exposed a missing shared timeline import; it is
restored, with an App integration regression test using real resolved data.
Transient incoming-flight geometry was not captured and remains an acceptance
item. No mobile/live multiplayer pass is claimed. Full suite: 458 tests in 55
files passed (24.46s); build passed (14.48s), with only the existing chunk warning.
CSS remains 246.63 kB (gzip 34.58 kB). The final 13 focused tests passed after
correcting fixture slot IDs; new TS/test files have no filtered diagnostics,
while global repository type errors remain. M8 remains in progress: planning
boards, cycle attention/animation, shared styles and final acceptance are pending.

Eighth bounded extraction: `cyclePresentationSession.ts` owns cycle handoff
timers, archive-arrival state and the render/frame handshake. Shared presentation
constants preserve existing battle/PvP/flight/stagger timing. App retains flight
geometry, store finalization, routing and tutorial signals. Animation identity
guards reject stale work, cancel timers/frames on replacement/exit/unmount and
retain completed identity during asynchronous store finalization. Eight session
tests cover timing, coalescing, replacement, stale callbacks, reset/disposal,
zero-valued handles and empty resolutions. The App integration test now checks
exact delays. Two browser cycles on disposable QA Slot 3 finalized successfully,
including the cycle-3 scheduled unlock; the warning/error list was empty.
Incoming-flight geometry remains unverified after short selector capture windows.
Full suite: 466 tests in 56 files passed (23.99s); build passed (12.47s), with only
the existing chunk warning and no unused CSS warnings. CSS remains 246.63 kB
(gzip 34.58 kB). New session/test files have no filtered TypeScript diagnostics;
global repository errors remain. Planning boards, attention timers, shared styles
and final acceptance are still pending. M8 remains in progress; no commit or
mobile/live multiplayer browser validation is claimed.

Ninth bounded extraction: `TroopRosterBoard.svelte` owns the player roster
markup and applicable scoped CSS. Engine queries derive owned races, resolved
troops and future draft classes; App retains selected identities, callbacks,
shared inspection, tutorial signals and routing. Explicit game/highlight inputs
keep updates reactive. Four SSR tests cover resolved presentation, selected and
highlighted race expansion, identity-scoped troop highlights, empty data,
immutability and action-free rendering. Browser checks on isolated QA Slot 2
verified race expansion, future-class inspection, 24-unit portrait layout,
owned-troop selection and draft inspector replacement. Normal-origin saves were
untouched. Full suite: 470 tests in 57 files passed (25.17s); final production build
passed (11.84s), with only the existing chunk warning and no unused CSS warnings.
CSS is 260.05 kB (gzip 36.27 kB); duplicated shared styles need consolidation.
Final focused tests pass after fixture type repair, with no filtered roster-test
TypeScript diagnostics; global errors remain. M8 remains in progress: Rift/rival
boards, attention timers, shared styles and final acceptance are pending.

Tenth bounded extraction: `RivalInfoBoard.svelte` owns revealed rival markup and
scoped styles. Snapshot troops/upgrades stay distinct from current occupation
data; shared inspection and engine resolution remain authoritative. Removed dead
App rival queries and imports. Five SSR tests cover resolved snapshot data,
live-roster separation, mobile-threat styling, cycle-scoped highlight identity,
unrevealed intel, immutability and action-free rendering. A reproducible local
report fixture has one holding troop and one mobile troop; it was imported through
the UI into disposable QA Slot 3. Browser checks verified portraits, threat borders,
two-unit comparison and highlights, upgrade detail text and route cleanup. Normal
save origins were untouched; QA Slot 3 now contains this constructed Contest
fixture. Full suite: 475 tests in 58 files passed (23.87s); build passed (13.56s),
with only the existing chunk warning and no unused CSS warnings. CSS is 276.44 kB
(gzip 37.15 kB); shared-style consolidation is still pending. New fixture/test
files have no filtered TypeScript diagnostics; global errors remain. No live
multiplayer/mobile pass or commit is claimed. M8 remains in progress: Rift board,
attention timers, shared styles and final acceptance remain.

Eleventh bounded improvement: identical portrait-cluster declarations now live in
`unitPortraitClusters.css`, loaded once by `main.ts`. A Svelte CSS AST comparison
selected 139 identical selectors from eight surfaces; differing declarations,
parent-specific layout and responsive rules remain local. Three tests cover
namespace confinement, all helper densities, dense positions and foreground
layering contracts. Browser checks caught and repaired two cascade problems:
planning uses `overworld-shell`, not `overworld-surface`, and retained scoped
inspector rules required the common cluster class for shared-rule specificity.
Verified rival tiles, Rift enemies, ready troops, draft choices, expanded roster,
and 24-unit inspector foreground/background sizes and layering after repair.
Full suite: 478 tests in 59 files passed (23.15s); the final three focused tests
passed again. Build passed (11.64s), with only the existing chunk warning and no
unused CSS warnings. CSS fell from 276.44 to 227.30 kB (gzip 37.15 to 32.87 kB).
No new stylesheet-test TypeScript diagnostics; global repository errors remain.
Opening/scheduled unlock and archive-detail visuals remain for final acceptance.
No mobile/live multiplayer check or commit is claimed. M8 remains in progress:
Rift board, attention timers, other shared styles and final acceptance remain.

Twelfth bounded extraction: `planningAttentionSession.ts` owns the End Cycle
hover/focus state and existing 2400 ms Essence focus pulse. App retains blocking
queries, focus navigation, tutorial signals and hint-arrow geometry. Removed the
unreachable `focusTroopAssignments` path and its never-activated timer/state rather
than creating another owner for dead behavior. Context synchronization clears
attention on campaign/session, cycle, phase or screen changes; center mode is
excluded so focus navigation preserves its new pulse. Ten tests cover expiry,
restart, queued stale callbacks, same-context stability, replacement, zero-valued
timer handles, reset and idempotent teardown. Browser checks verified draft
highlight on blocked End Cycle focus and removal on focus leave, assignment
highlights/hint arrow, and cleanup on Rival Info navigation. Timed Essence pulse
expiry was tested with a fake runtime, not claimed as browser-verified. Full suite:
488 tests in 60 files passed (22.56s); build passed (13.21s), existing chunk warning
only and no unused CSS warnings. No filtered owner/test TypeScript diagnostics;
global errors remain. M8 remains in progress: Rift board, other shared styles and
final acceptance remain. No commit or mobile/live multiplayer acceptance.

Thirteenth bounded extraction: `riftBattlePresentation.ts` now owns Rift phase
orientation, result perspective, force grouping/loss classes and visible defender
presentation with explicit game/resolution inputs instead of App store closures.
Archive arrivals share the same phase helpers. Combatant resolution remains in
the engine; no gameplay state or outcomes are copied. Health-tone types are shared
outside Svelte. Six tests cover static guardians/assigned troops/resolved rival
holders, local and opponent orientation, reversed result perspective, legacy
human/ai identities, guardian-before-PvP sequencing, coalesced forces/late losses,
missing records and input immutability. Existing no-guardian PvP sequencing is
preserved, not redesigned. Browser checked static Contest defenders, pointer
assignment into two Rifts, resolving phase presentation and handoff to cycle 3.
Scheduled race-unlock cards and inspector foreground/background portraits also
passed visual/computed-style checks after the prior CSS consolidation. Disposable
QA Slot 3 is now cycle 3 race-unlock, not the original constructed rival snapshot;
normal-origin saves remain untouched. Full suite: 494 tests in 61 files passed
(22.97s); build passed (11.99s), existing chunk warning only and no unused CSS
warnings. No filtered new helper/test TypeScript diagnostics; global errors remain.
M8 stays in progress: Rift board markup/styles, other shared styles and final
acceptance remain. Transient arrival-flight geometry is not yet browser-verified.
No commit or live multiplayer/mobile acceptance is claimed.

Fourteenth bounded extraction: `RiftBoard.svelte` owns Rift markup, relevant scoped
styles, force keyframes and mini-replay mounts. It consumes authoritative game and
resolved records, existing shared inspection/assignment owners, and a planning
contract without local selection copies or gameplay-store subscription. App keeps
commands, tutorial routing and hint/arrival geometry. Removed dead App Rift helpers,
imports and no-longer-used selectors; parent grid rules use a global child boundary.
Five SSR tests cover resolved troops/targets, explicit highlights/holding/read-only
state, shared conflict updates, active drag preview, occupation labels and animation
flight IDs, with immutable inputs and no commands during render. Desktop browser
verified grid/portrait layout, enemy and mutator inspection, assignment and return
to ready, completion of both draft halves, three assignments, resolving animation
and handoff to cycle 2 with new archived battles. Disposable QA Slot 2 has advanced
to cycle 2 Campaign; QA Slot 3 remains cycle-3 race unlock. Normal saves untouched.
Full suite: 499 tests in 62 files passed (22.98s); build passed (12.75s), existing
chunk warning only and no unused CSS warnings. CSS is 230.77 kB (gzip 32.75 kB);
shared primitive duplication remains. No filtered new board-test TypeScript
diagnostics; global errors remain. M8 stays open for remaining ready/action-rail
boundaries, shared styles and final acceptance, including arrival-flight geometry.
No commit or live multiplayer/mobile acceptance.

Fifteenth bounded extraction: `ReadyTroopsPanel.svelte` owns ready troop markup,
density styles and shared assignment targets; `PlanningActionRail.svelte` owns
footer layout, notices and cycle controls. App retains commands, phase guards,
tutorial routing and draft/ready/tutorial slot mounts. Explicit presentation
contracts reuse the existing inspection/assignment owners without gameplay state
copies. Slot-sensitive layout selectors cross child boundaries; existing responsive
rules moved intact. Removed dead App wrappers, drag aliases, imports and styles.
Eight SSR tests cover ready eligibility/empty/dense states, supplied highlights
and shared conflicts, cycle blocking versus disabled controls and conditional
notice actions. Desktop browser verified footer layout, blocked draft highlighting,
ready troop inspection, drag assignment/return and roster-view slot visibility on
disposable QA Slot 2. Normal saves untouched; draft not claimed in this pass.
Full suite: 507 tests in 64 files passed (23.76s); build passed (13.64s), existing
chunk warning only and no unused CSS warnings. CSS is 216.82 kB (gzip 30.69 kB).
No filtered new component/test TypeScript diagnostics; global errors remain.
M8 remains open for shared primitive CSS and final acceptance, including transient
arrival-flight geometry. No commit or live multiplayer/mobile acceptance claimed.

Sixteenth bounded change: `overworldPrimitives.css` centralizes nine identical
button, panel, label and reset declaration blocks, imported once with overworld
surface/shell confinement. CSS AST matching removed 103 selector copies across
ten extracted components. Surface-specific mixed selectors, variants, media rules
and layout remain local. App remains the single body/debug-global owner and keeps
its non-overworld control defaults. Three tests cover confinement/import, canonical
declarations/cascade ordering and duplicate/global removal. After correcting a
reference-selector assertion in the new test, full suite passed 510 tests in 65
files (24.61s). Build passed (14.83s), existing chunk warning only, no unused CSS
warnings. CSS is 209.39 kB (gzip 30.41 kB), down 7.43 kB. Desktop checks verified
planning/draft/footer, inspector, archive details, roster and scheduled unlock
cards/inspector, including local gap and primary-padding overrides. No gameplay
claims persisted; normal saves untouched; browser diagnostics empty. New test
has no filtered TypeScript diagnostics; global errors remain. Shared primitive
consolidation is complete for the extracted surfaces. M8 remains open for final
acceptance, including opening/tutorial and transient arrival-flight geometry.
No commit or live multiplayer/mobile acceptance claimed.

Extract the overworld after menu and replay contracts have been proven. Separate
planning, drafts, scheduled unlocks, archive controls, and overlays incrementally.
Assign each transient UI state one owner and retain store/engine authority for
gameplay decisions. Reuse established component and CSS patterns.

Acceptance: browser checks cover opening picks, drafts, assignments, blocked cycle
submission, scheduled unlocks, archive access, and tutorial progression. Relevant
store/server tests cover multiplayer behavior affected by moved callbacks.

## Milestone 9 - Measured Replay Memory Improvements

Completed 2026-10-09. `docs/replay-memory.md` records the gate, reproducible
benchmark, consumer inventory, ownership change and acceptance. Materialization
shares deeply frozen unchanged unit records while preserving full snapshots and
independent arrays. The 24-unit fixture drops from about 9.4 MB to 3.6 MB retained
heap in the direct before/after measurement; small fixtures improve modestly.
Compact/keyframed prototypes do not justify cursor complexity or slower seeks.
Inputs, deterministic JSON and save/report/network versions remain unchanged.
Full suite: 521 tests in 66 files passed; production build passed. Desktop replay
stepping/seeking/summoning, recap, playback/reset and replacement passed without
browser warnings/errors. Measurement noise and untested browser heap/peak cost
are explicitly recorded. No cache, migration, live multiplayer or mobile work.

Proceed only if baseline and follow-up measurements show materialized snapshots
are a meaningful runtime bottleneck. Compare simpler sharing/caching approaches
with initial-state-plus-deltas and keyframes before selecting a representation.

Archived replay payloads currently persist `BattleInput`, not full replay output.
This milestone targets runtime memory and access cost; it does not promise reduced
localStorage usage or require a storage migration. Inventory report, worker, and
network consumers before changing any externally consumed replay shape.

If a cursor is justified, keep the existing snapshot API during migration and
convert one consumer at a time. Define snapshot ownership so consumers cannot
mutate shared historical state. Choose keyframes/cache bounds based on measured
seeking costs.

Acceptance: every reconstructed snapshot matches reference data, including births,
deaths, footprints, timed effects, and metadata. Tests cover sequential playback,
backward/random seeks, animation transitions, recap, event logs, mini-replays,
replay switching, and bounded caches. Record memory and seek-time results. Version
only actual compatibility changes; leave input persistence intact unless separate
evidence justifies changing it.

## Milestone 10 - Targeted Follow-Ups

Completed 2026-10-09. `docs/targeted-followups.md` records each independent gate.
Renderer ID-query measurements do not justify snapshot maps: the 739-step army
trace costs 0.128 ms scanning versus 1.075 ms with cold maps. Different renderer/
mini-replay layout scales remain local. Historical asset contents and runtime
consumers were inspected; archives and 15 upgrade artwork aliases are preserved,
with three explicit alias regression tests. Troop instance/unlock identity overlap
is intentional under the current roster model, so branding/serialization changes
remain deferred. `fixed.ts` semantics are documented with four focused tests;
arithmetic, RNG and persistence are unchanged. Full suite passed 528 tests in 67
files; new script/tests have no filtered TypeScript diagnostics. No runtime UI or
renderer behavior changed in this milestone; M9's browser acceptance remains
applicable. Production build passed (12.53s), with only the existing chunk-size
warning. All planned milestones are complete; remaining measurement limitations
and intentionally deferred work are recorded in the evidence documents.

Complete these as independent small changes when evidence supports them:

- Renderer: profile repeated unit lookups, then use per-snapshot maps where they
  help. Consolidate layout constants only when their semantics are shared.
- Assets: inspect archives and consumers before moving/removing anything. Keep
  upgrade icon aliases while they bridge current IDs to available artwork; remove
  them only after replacements exist and icon tests pass.
- IDs: identify actual confusion-prone boundaries before introducing brands.
  Consider troop instance IDs versus troop unlock IDs first; include catalog,
  serialization, and validation boundaries in any targeted migration.
- Numbers: document `fixed.ts` as two-decimal quantization using JavaScript numbers.
  Preserve its arithmetic and rounding behavior. Rename only if it adds value to
  an already justified change.

RNG replacement, integer fixed-point arithmetic, and save migrations remain
deferred. Revisit them only for demonstrated fairness/numeric problems or an
explicit player-save compatibility requirement.

## Verification And Completion

For each milestone, record changed boundaries, acceptance results, measured
effects where relevant, and any remaining limitation. Add meaningful focused
tests for changed contracts; run the full Vitest suite and production build before
marking a code milestone complete. UI milestones require focused desktop browser
checks. This plan adds no mobile redesign, but extracted styles must preserve
existing responsive behavior.

Before closing a deterministic engine milestone, compare complete replay fixtures
as well as outcomes. Before closing a lifecycle milestone, check cleanup and state
ordering. Update documentation alongside changes. A measurement-gated milestone
may conclude with a documented decision to retain the current implementation.
