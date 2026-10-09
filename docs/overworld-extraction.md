# Overworld Extraction

Milestone 8 is complete as of 2026-10-09. The incremental records below describe
the work as it progressed; the final acceptance section is the current outcome.

## Current Ownership

| Concern | Current owner |
|---|---|
| Game state, offers, assignment validation, cycle submission | Engine/store |
| Screen routing, tutorial orchestration and scene guards | App |
| Scored-run overlay presentation and styles | GameOverDialog |
| Game-over mount, continuation callback and menu callback | App |
| Opening choices, hover/pin inspection and ability disclosures | OpeningUnlockScreen |
| Opening store commands, tutorial signals/guards and session header | App |
| Scheduled race selection, inspection and legacy troop unlock presentation | ScheduledUnlockScreen |
| Scheduled claim callbacks and room-session controls | App |
| Draft selection, reroll hover and confirmed-card state | Essence draft session |
| Draft choices and confirmation-card presentation/CSS | EssenceDraftPanel |
| Draft store commands, tutorial signals and shared planning inspection | App |
| Planning hover/pin state, comparison and owner-scoped ability tooltips | Planning inspection session |
| Planning inspector presentation, disclosures and styles | PlanningInspector |
| Pointer/mouse/native assignment drag, suppression and conflicts | Assignment interaction session |
| Planning selection, assignment commands and hint geometry | App |
| Cycle hover/focus and Essence pulse lifecycle | Planning attention session |
| Cycle handoff timers and archive-arrival render scheduling | Cycle presentation session |
| Owned troop roster and revealed rival markup/styles | TroopRosterBoard and RivalInfoBoard |
| Rift board markup/styles and mini-replay mounts | RiftBoard |
| Ready troop markup, density styles and shared drag targets | ReadyTroopsPanel |
| Footer layout, notices and cycle controls | PlanningActionRail |
| Footer phase guards, slotted mounts and submission commands | App |
| Rift phase orientation, force groups and result perspective | Rift battle presentation helper |
| Shared portrait-cluster density/layering styles | unitPortraitClusters.css |
| Shared overworld button/panel/label/reset defaults | overworldPrimitives.css |
| Body and global debug/design styles | App |
| Archive selection and viewport pagination | Archive session |
| Archive list/detail presentation and performance derivation | ArchivePanel and archiveDetails |
| Archive commands, shared inspection callbacks and arrival flight geometry | App |

Planning inspection now has one session shared between the board, footer, roster
and archive.
Assignment hints depend on the attention session's hover state and elements in
the planning surface. App still owns their DOM geometry while shared interaction
and inspection sessions avoid writable state copies in the child surfaces.
Tutorial requests must reach the new owner while tutorial persistence and scene
guards stay with App/store. Engine queries remain authoritative.

## First Verified Boundary

`GameOverDialog.svelte` takes VP and two command callbacks. It owns no phase,
visibility or persistence state and adds no subscription. App mounts it only for
`game_over`, calls the existing `gameStore.continuePlaying()` action, and retains
`returnToMainMenu` with its scene guard. Its existing scoped overlay/dialog styles
and shared token-based panel/button styles moved with the markup. No redesign or
gameplay changes were made.

Two SSR tests cover zero/nonzero VP, accessible dialog labeling, debug target
selectors and absence of callback execution while rendering.

Desktop checks at 1440x900 used a constructed Campaign report imported into
previously empty Slot 2 on `127.0.0.1:5174`; existing origin saves and the replay
fixture in QA Slot 1 were preserved. The report is reproducible with
`npx.cmd vite-node scripts/replayPlaybackQaCampaign.ts`, which writes ignored
`artifacts/overworld-game-over-qa-campaign.txt`. It intentionally sets game-over
phase and score for UI testing; it is not ten-cycle resolver integration evidence.

Verified score, centered 480px dialog without overflow, Back to Menu, reloading the
saved game-over phase, Continue to planning, persisted planning after page reload,
and selecting the extracted Continue target in design mode without changing
tweaks. Browser console warning/error list was empty. No live multiplayer or
mobile browser pass was performed.

Full suite: 410 tests in 43 files passed in 21.92s. Production build passed in
13.87s with the existing large-chunk warning and no unused CSS warnings.

## Opening Boundary

`OpeningUnlockScreen.svelte` now owns opening markup, styles and transient
inspection state. Its inputs are game data, portrait lookup and an opening-action
contract, not App's individual selection variables. Selection remains derived
from engine/store troops. The component does not subscribe to the store; App
retains claim/unclaim commands and tutorial signals, guarded Begin handling and
room-session controls supplied through a slot. A public inspection-reset method
lets App's existing scene/tutorial orchestration clear local inspection without
mirroring it. Unmounting also discards that state.

`canClaimOpeningTroop` moved the existing recruitment validation into a shared
pure query. Recruitment and presentation use it, replacing the opening UI's
separate eligibility implementation. Three engine tests enumerate all native
troops over three seeds and several pick states, plus phase, deselection, invalid
identity and source-immutability checks. Three SSR tests cover seeded starters,
future inspectors, two selections, disabled Begin and tutorial/session labels.

Existing opening CSS, including breakpoint rules, moved with its markup. Shared
styles remain for scheduled/planning screens. The session-slot presence selector
uses a global descendant because App owns that slotted header. Debug/design
selectors reach the component beneath App's display-contents wrapper.

Desktop acceptance used initially empty QA Slot 3 on `127.0.0.1:5174`, leaving
QA Slots 1/2 and normal-origin saves intact. Verified included starter inspection,
ability disclosure, future inspection without recruitment, two picks, disabling
remaining choices, deselection, replacement pick, persisted selections after
reload, and Begin Campaign into planning. Design mode selected the extracted
included-troop target with zero tweaks. A 1440x900 screenshot showed intact card,
portrait, inspector, and action layout. The existing tutorial on `localhost:5173`
was resumed through replay lessons, entered its dedicated opening save, selected
Goblin Soldier/Human Knight and advanced via Begin Contest to the Essence lesson.
No regular save was replaced by that tutorial flow. Console warnings/errors were
empty. No live multiplayer or mobile browser pass was performed.

Full suite: 416 tests in 45 files passed in 22.26s, including unchanged complete
replay references. Production build passed in 12.83s with the existing chunk
warning. This is a verified intermediate boundary, not completion of M8.

## Scheduled Boundary

`ScheduledUnlockScreen.svelte` owns both scheduled race and legacy troop-class
unlock surfaces, with their existing scoped CSS and responsive rules. It owns
only transient selection/inspection, reads engine-generated offers, and uses the
engine resolver for granted-upgrade previews. App retains store claim callbacks
and the room controls in a named slot. Offer replacement clears race selection;
App's scene reset reaches inspection through a component method. Submitted-session
legacy troop buttons now expose their disabled state as well as guarding commands.

Three SSR tests cover cycle-3/7 offers, advertised included troops, no implicit
claim/selection, read-only controls, legacy choices and inactive-phase rendering.
Desktop checks at 1440x900 used generated reports in disposable QA Slot 2 on
`127.0.0.1:5174`. Cycle contexts were constructed before calling the real engine
offer generator; this is not evidence of a full three/seven-cycle playthrough.
Verified selection/deselection, inspection and stat breakdown, granted ability
disclosure, confirmation, exact roster/upgrade grants, and reload persistence.
The legacy fixture verified focus inspection, two successive choices, option
removal and return to planning. Console warnings/errors were empty. No live
multiplayer or mobile browser validation is claimed.

Full suite: 419 tests in 46 files passed in 22.80s, including unchanged replay
references and local store/server tests. Build passed in 13.53s with only the
existing large-chunk warning. Scoped CSS duplication increases the production
stylesheet from 191.30 to 214.95 kB (gzip 28.93 to 30.49 kB); consolidate shared
inspection styles only after their remaining ownership is settled. This does
not complete M8.

## Draft Boundary

`EssenceDraftPanel.svelte` owns the active footer draft markup and scoped styles.
The unreachable old sidebar draft was removed. `essenceDraftSession.ts` is the
single transient state owner shared by this component and planning's affected
troop highlights. It publishes a read-only subscription with guarded selection,
confirmation and reroll methods; App supplies existing store/tutorial commands
and inspector pin/reset callbacks. No authoritative offer or gameplay state is
duplicated. Session/slot/cycle/phase changes reset presentation, changed offers
drop stale selections, and claimed-side cards remain through view switches.
App retains automatic reveal and cycle-attention timers.

Five session tests cover independent selection/deselection, non-mutating reads,
confirmed-card lifetime, context changes, reroll limits/opposite-side retention,
stale offers, submitted-session guards and inspection resets. Three SSR tests
cover advertised choices, tutorial/debug targets, partial/full confirmations and
disabled controls. Desktop checks at 1440x900 used disposable QA Slots 2/3 on
`127.0.0.1:5174`, preserving QA Slot 1 and normal-origin saves. Verified selection,
deselection, inspector pinning, synergy and ready-troop highlights, troop reroll
with upgrade selection retained, disabled second reroll, confirmations, view
switching, slot switching, and persisted grants after reload. The final locked
troop portrait has explicit dimensions to avoid an empty intrinsic grid track.
Dynamic cluster styles were verified visually, including 24-unit draft options.

The tutorial pass found a pre-existing obsolete Essence-counter target and a
reveal action missed by automatic reveal. The target now uses Races & Troops;
that view is permitted for the Essence lesson. An already active engine offer
advances the reveal lesson. Browser acceptance resumed the dedicated tutorial
save, reached Draft Choices, confirmed Human Priest/Martyr's Zeal, and reached
the Rifts lesson. No normal save was replaced. No live multiplayer or mobile
browser validation is claimed. Planning/assignment and archive remain incomplete.

Full suite: 427 tests in 48 files passed in 32.73s, including complete replay
references and local store/server tests. Build passed in 18.77s with only the
existing chunk warning and no unused CSS warnings. Production CSS is 217.65 kB
(gzip 31.95 kB). Both browser console warning/error lists were empty. Global
`tsc --noEmit` remains blocked by existing repository type errors; the changed
draft-session and opening/scheduled/draft test files have no reported diagnostics
in the focused output check. This remains partial M8 work.

## Archive Extraction

`ArchivePanel.svelte` owns list/detail markup and scoped styles. The shared
`archiveSession.ts` owns selection and viewport pagination; it clears removed
entries and clamps pages without copying game state. `archiveDetails.ts` derives
combatants, relevant upgrade chips and health/damage bars from stored inputs and
resolved replay data. Replay storage/access and tutorial commands remain App/store
owned. Shared planning inspection is passed as a cohesive contract. Arrival flight
markup remains an App-owned slot because it depends on Rift geometry and timing.

Two session tests, two derivation tests and four SSR tests cover selection,
pagination/removal/resize, source immutability, performance, upgrade filtering,
resolved forces, summary-only/missing payloads, hidden rendering and absence of
render-time commands. Browser checks at 1440x900 used isolated QA Slots 1/2 on
`127.0.0.1:5174`; normal-origin saves were untouched. Slot 2 now contains the
generated pagination fixture (3 playable, 13 summary-only entries). Verified list
selection, stat-panel inspection, ordinary/summons access, replay exit restoration,
Back to archive, both pagination directions and summary-only disabled access.

Browser evidence found an unwired replay-return callback and an inspection reset
that cleared restored selection. The callback now restores selection after the
route update. Pagination was covered by the full-width action footer; empty footer
space now passes pointer events through, with direct children retaining input.
The archive reserves room above End Cycle. Verified clickable pagination and
continued draft selection after this layout repair. No arrival-flight, full
tutorial, mobile or live multiplayer acceptance is claimed by this extraction.

Full suite: 435 tests in 51 files passed (15.59s), including replay references and
local store/server tests. Build passed (8.49s), with only the existing chunk warning
and no unused CSS warnings. CSS is 234.08 kB (gzip 33.67 kB); duplicated shared
inspection styles remain a consolidation target once planning ownership settles.
The QA browser warning/error list was empty. Global TypeScript errors still exist;
new archive TS/test files had no diagnostics in the filtered check. The QA script
now uses TextEncoder for byte sizing instead of the repository's narrow Buffer
ambient declaration. M8 remains incomplete.

## Shared Planning Inspector

`planningInspection.ts` owns hover/pin cards, primary/secondary unit comparison,
highlight keys and ability tooltips. Its read-only subscription is shared by App
and `PlanningInspector.svelte`; there are no writable mirrors. The first pin is
preserved while a second is replaced, and two pinned units suppress third-unit
hover. Ability pins take precedence over hover and are scoped to their detail
owner. Draft choices atomically replace pins; context/scene resets remain App
orchestrated. App retains enemy/mutator tutorial signals and command callbacks.
The sidebar owns markup, styles and disclosure DOM behavior, with resolved data
for the existing selected-roster fallback. Removed the unreachable selected-Rift
sidebar and its unused queries without altering assignment controls.

Six session tests cover ordering, limits, identity toggles, non-unit previews,
ability ownership/precedence, draft replacement and resets. Four SSR tests cover
empty/debug targets, summoned previews, comparisons, owner-scoped ability text,
resolved roster fallback, non-unit details and action-free rendering. Desktop
checks at 1440x900 used disposable QA Slot 2 on `127.0.0.1:5174`: enemy pins,
Elemental summon comparison, ability disclosure, second-pin replacement, draft
replacement, roster/view resets, 12-unit portrait layout, archive stat inspection
and replay route cleanup. Both browser warning/error lists were empty. The
dedicated tutorial on `localhost:5173` advanced from Rifts through enemy and
modifier inspection to Assign Troops. Normal-origin save slots were untouched.
No assignment, arrival-flight, full tutorial, mobile or live multiplayer acceptance
is claimed here.

Full suite: 445 tests in 53 files passed (28.41s), including replay references and
local store/server tests. The final ten focused tests passed after repairing an
exact-optional-field issue in the fixture. New session/fixture/test files have no
filtered TypeScript diagnostics; global repository errors remain. Build passed
(13.18s), with only the existing chunk warning and no unused CSS warnings. CSS is
246.63 kB (gzip 34.58 kB). Scoped shared styles are still duplicated across extracted
surfaces; consolidate them when the remaining planning ownership is established.

## Assignment Interaction

`troopAssignmentInteraction.ts` owns pointer/mouse/native drag state, tracked
global listeners, click suppression and conflict presentation. App reads the
same read-only session used by the board and ready-troop surfaces. Eligibility,
assignment commands, selected troop and tutorial signals remain App/engine/store
owned. Context resets and App teardown remove listeners. Native drop payloads
are structurally checked before invoking assignment commands.

Twelve fake-runtime tests cover pointer identity/capture, activation thresholds,
overlapping input delivery, exactly-once completion, cancellation, reset/disposal,
click suppression, native payloads and target highlighting. A thirteenth App
integration test uses real game-store cycle resolution and SSR to exercise battle
handoff scheduling. The browser pass exposed a missing shared presentation-timeline
import in App; it is restored and covered by this integration test.

Desktop checks at 1440x900 on the dedicated `localhost:5173` tutorial verified
ready-to-Rift assignment, a same-race rejection with conflict feedback, assigned
troop unassignment, Rift-to-Rift movement and the all-ready-troops submission gate.
After the timing repair, cycle animation finalized to cycle 2 with archive entries.
The resumed tutorial continued through archive battle details and rival information
to completion and returned to the menu. Normal-origin save slots were untouched.
The final tutorial browser warning/error list was empty. This was a resumed tour,
not a fresh full tutorial. Transient incoming-flight geometry was not captured;
that visual acceptance remains open. No mobile or live multiplayer check is claimed.

Full suite: 458 tests in 55 files passed (24.46s), including complete replay
references and local server/store coverage. Build passed (14.48s), with only the
existing chunk warning and no unused CSS warnings. CSS remains 246.63 kB (gzip
34.58 kB); main JS is 822.25 kB (gzip 216.58 kB). The final 13 focused tests passed
after fixture slot-ID repair. New interaction and integration-test files have no
filtered TypeScript diagnostics; existing global repository errors remain.

## Cycle Presentation Lifecycle

`cyclePresentationSession.ts` owns cycle handoff timers, archive-arrival state,
the render/frame handshake and cleanup. App reads its single read-only session;
it retains store finalization, routing, tutorial signals and DOM flight geometry.
Timing constants shared with mini-replay and flight markup preserve the existing
timeline, PvP phase delay and stagger. New animation identity checks reject queued
callbacks from replaced animations. Reset/disposal cancel pending timers and
frames, including zero-valued handles. Completed identity is retained while
asynchronous store finalization runs so reactive updates cannot restart it.

Eight session tests cover timing/source immutability, coalescing, render/frame
ordering, exactly-once finish, delayed finalization, replacement, stale callbacks,
reset/disposal and empty resolutions. The App integration test checks exact
handoff delays for real engine/store resolution. The focused nine tests passed.
Desktop checks on disposable QA Slot 3 at `127.0.0.1:5174` assigned all troops,
resolved two cycles and verified cycle-2 archive/draft controls followed by the
cycle-3 scheduled race unlock. The first animation was visually observed; no
console warnings/errors were reported. The short incoming-flight window was not
captured, so flight geometry acceptance remains open. Normal-origin slots were
untouched; QA Slot 3 now contains the cycle-3 race-unlock state.

Full suite: 466 tests in 56 files passed (23.99s), including replay references and
local store/server coverage. Build passed (12.47s), with only the existing chunk
warning and no unused CSS warnings. CSS remains 246.63 kB (gzip 34.58 kB); main JS
is 823.15 kB (gzip 216.88 kB). New TS/test files have no filtered diagnostics;
global repository TypeScript errors remain. M8 is still incomplete.

## Player Roster Board

`TroopRosterBoard.svelte` owns player-roster markup and scoped styles. It derives
owned races, effective troop presentations and future classes through existing
engine queries. App retains selected race/troop identity, command callbacks,
tutorial signals and routing. Shared inspection is one cohesive contract; the
board keeps no writable selection mirror or store subscription. Game and
highlight keys are explicit template dependencies. Debug selectors and existing
portrait density/layout rules move with the markup. Parent selectors targeting
the roster grid deliberately cross the component boundary.

Four SSR tests cover authoritative resolved troops, future classes on selected
or highlighted races, identity-scoped highlights, empty data, source immutability
and action-free rendering. Desktop QA on disposable Slot 2 at `127.0.0.1:5174`
verified race expansion, future-class inspection, 24-unit portrait clusters,
owned-troop selection and draft-driven inspector replacement. Normal-origin saves
were untouched. No responsive redesign or live multiplayer pass is claimed.

Full suite: 470 tests in 57 files passed (25.17s), including replay references and
local store/server coverage. Final build passed (11.84s) with only the existing
chunk warning and no unused CSS warnings. CSS is 260.05 kB (gzip 36.27 kB); shared
styles remain duplicated until the other planning boards are moved. Final focused
tests passed after fixture type repair; no filtered roster-test TypeScript
diagnostics remain, while global repository errors persist. M8 remains incomplete.

## Rival Information Board

`RivalInfoBoard.svelte` owns rival snapshot markup and scoped styles, with no
store subscription or local gameplay/selection copy. Revealed troops and upgrades
come from `opponentInfo`, not the later live rival roster. Current Rift occupation
controls mobile-threat styling; engine resolution supplies upgraded combatants.
The same planning inspector contract handles hover/pinning and cycle-scoped troop
highlights. App retains view routing and tutorial signals. Dead App rival queries
and unused imports were removed; parent layout selectors cross the boundary.

Five SSR tests cover resolved snapshot troops/upgrades, live-roster separation,
occupation styling, highlight identity, unknown intel, immutability and command-free
rendering. `rivalInfoFixture()` builds a constructed Contest UI state with one
holding and one mobile rival troop. The existing Vite-node QA generator writes its
report to `artifacts/rival-info-qa.txt`; this is a presentation fixture, not evidence
of simulated Contest progression. Imported through the local report UI into
disposable QA Slot 3 on `127.0.0.1:5174`, it verified race/troop portraits, the
24-unit cluster, threat borders, two-unit comparison/highlights, upgrade detail
text and route cleanup. Normal-origin saves were untouched. Slot 3 now holds the
constructed rival fixture instead of the previous cycle-3 Campaign fixture.

Full suite: 475 tests in 58 files passed (23.87s), including complete replay
references and local store/server coverage. Build passed (13.56s), with only the
existing chunk warning and no unused CSS warnings. CSS is 276.44 kB (gzip 37.15 kB);
main JS is 824.91 kB (gzip 217.41 kB). Shared-style duplication remains to consolidate.
New fixture/test/QA-script files have no filtered TypeScript diagnostics; global
errors remain. No mobile/live multiplayer acceptance is claimed. M8 remains open.

## Shared Portrait Styles

Identical cluster rules from App, both unlock screens, draft, archive, inspector,
roster and rival components are centralized in `unitPortraitClusters.css`, imported
once by `main.ts`. The mechanical extraction compared Svelte CSS AST declarations
and moved only selectors whose bodies were identical across their occurrences.
It consolidated 139 selectors into 47 declaration blocks. Different detail-art
rules, context-specific selectors and media rules stayed local.

Browser verification exposed two issues before acceptance: planning has an
`overworld-shell` root rather than `overworld-surface`, and the retained inspector
base rule tied the initial shared foreground rule in specificity. Shared selectors
now cover both roots and include the common `.unit-icon-cluster` class. The dense
inspector hero is again 62.20 px at opacity 1/z-index 5, versus 8.46 px background
portraits at z-index 1. Verified rival, Rift, ready-troop, draft and roster clusters,
including 24-unit future troops. Opening/scheduled unlock and archive-detail
visuals remain part of the final M8 pass; no mobile or live multiplayer claim.

Three tests check confinement, all helper densities/positions and foreground
selector contracts. Full suite passed: 478 tests in 59 files (23.15s); focused
tests passed again after the cascade repair. Final build passed (11.64s), existing
chunk warning only, no unused CSS warnings. CSS is 227.30 kB (gzip 32.87 kB), down
49.14 kB from the preceding extraction. Main JS is 824.55 kB (gzip 217.39 kB).
Filtered TypeScript output has no diagnostics for the new test; existing global
errors remain. This is partial shared-style consolidation, not completion of M8.

## Planning Attention Lifecycle

`planningAttentionSession.ts` is the single owner of End Cycle hover/focus state
and the existing 2400 ms Essence focus pulse. App consumes the read-only store and
keeps its engine blocking queries, focus commands, tutorial signals and assignment
hint geometry. The never-called assignment focus function and its timer/state
were removed. Assignment feedback remains driven by the active End Cycle focus.

Synchronization includes save/session, campaign, mode, cycle, phase and screen;
center-mode changes deliberately retain the pulse so Spend Essence can navigate
to the draft. Replacement and dispose clear timers, including handle zero, and
callback identity guards prevent an old queued timer from clearing a newer pulse.
Ten tests cover this lifecycle. Browser checks on QA Slots 2/3 verified blocked
End Cycle draft highlighting, focus-leave cleanup, two ready-troop assignment
highlights, hint-arrow rendering and navigation cleanup. The timed Essence pulse
was verified with the fake runtime, not exercised via a system notice in browser.
Normal save origins remained untouched; no live multiplayer/mobile checks.

Full suite passed: 488 tests in 60 files (22.56s); build passed (13.21s), existing
chunk warning only and no unused CSS warnings. CSS remains 227.30 kB (gzip 32.87
kB). No filtered new owner/test TypeScript errors; existing repository errors
remain. This completes the attention-timer ownership boundary, not all of M8.

## Rift Presentation Contract

`riftBattlePresentation.ts` removes App's implicit store dependencies from phase
orientation, force grouping, result perspective and visible defenders. App now
passes game/records explicitly from Svelte templates, and incoming archive cards
use the same phase/result functions. Engine queries still resolve all stats and
abilities. The helper has no store, DOM, timers or mutable gameplay state. Shared
health-tone types are no longer exported from the mini-replay component.

Six tests cover authoritative static data, assigned troops, resolved rival holders,
local/opponent/result orientation, fallback/legacy identities, ordered guardian
and late PvP phases, coalesced forces, late loss classes, stale/missing records
and immutability. Constructed participant variants exercise presentation contracts,
not simulated PvP outcomes. The existing no-guardian PvP sequence is preserved.

Browser verified rival-held and neutral defenders, pointer assignment of both
ready troops, animation force/health presentation and handoff to cycle 3. The
scheduled race-unlock screen additionally passed card and inspector portrait
checks after shared CSS consolidation. QA Slot 3 now stores cycle-3 race unlock;
normal-origin saves were untouched. Arrival-flight geometry was not captured.
Full suite: 494 tests in 61 files (22.97s); build passed (11.99s), existing chunk
warning only and no unused CSS warnings. New helper/test files have no filtered
TypeScript errors; global repository errors remain. Rift markup/styles still
belong to App and are the next boundary. M8 is not complete.

## Rift Board Surface

`RiftBoard.svelte` receives game/resolution data, the existing assignment owner,
shared inspection and a cohesive planning contract. It owns markup/styles and
mini-replay mounts, not gameplay state, assignment commands or local selection.
App retains tutorial routing, selection/suppressed-click handling, holding IDs and
hint/arrival geometry. Engine queries remain authoritative for eligibility and
upgrade applicability. Debug, tutorial, drop and flight IDs were preserved.

Applicable selectors were selected from the original Svelte CSS AST and checked
against compiled markup. Rift-only App selectors/keyframes and newly unreachable
selectors were removed. Parent grid rules now use a global child boundary. Existing
board media rules moved intact; shared primitive styles still need consolidation.

Five SSR tests cover resolved forces and input targets, supplied selection and
holding identities, submitted-plan read-only state, shared conflicts/drag preview,
Contest labels and resolved phase geometry IDs. Browser verified the desktop grid,
portraits, enemy/mutator inspection, assign/return-to-ready, both draft halves,
three assignments, resolving animation and cycle-2 planning/new archives. QA Slot 2
has advanced to cycle 2 Campaign; Slot 3 remains cycle-3 race unlock. Normal-origin
saves were untouched. Transient arrival geometry was not captured; no mobile/live
multiplayer acceptance is claimed.

Full suite passed: 499 tests in 62 files (22.98s). Build passed (12.75s), existing
chunk warning only, no unused CSS warnings. CSS is 230.77 kB (gzip 32.75 kB);
main JS is 826.95 kB (gzip 218.12 kB). No filtered new board-test TypeScript
diagnostics; existing repository errors remain. M8 still needs remaining ready/
action-rail boundaries, shared-style consolidation and final acceptance.

## Ready Troops And Action Rail

`ReadyTroopsPanel.svelte` renders ready troops using engine-resolved definitions
and the existing assignment/inspection owners. Selection, suppressed-click handling,
commands and tutorial routing stay in App. `PlanningActionRail.svelte` owns footer
layout, system notices and cycle controls with explicit cycle/notice contracts.
App retains phase guards and supplies draft, ready and tutorial slots. Neither
component owns gameplay state or subscribes to the gameplay store. Slot-dependent
layout selectors cross component boundaries explicitly; responsive rules moved
unchanged. Dead App drag aliases, detail wrappers, imports and styles were removed.

Eight SSR tests cover ready eligibility, empty state, supplied highlighting and
attention, shared conflict state, dense portraits, cycle labels/targets, blocked
versus disabled controls and conditional notice actions without render commands.
Desktop browser checks on isolated QA Slot 2 verified footer layout, blocked cycle
draft highlighting, ready troop inspection, drag assignment and return to ready,
and roster view retaining the draft/cycle slots while hiding ready troops. The
draft was not claimed during this pass. Normal-origin saves remained untouched.
Notice action behavior is covered by SSR/owner tests, not new browser evidence.

Full suite: 507 tests in 64 files passed (23.76s). Build passed (13.64s), existing
chunk warning only and no unused CSS warnings. CSS is 216.82 kB (gzip 30.69 kB);
main JS is 830.42 kB (gzip 218.58 kB). Filtered TypeScript output has no diagnostics
for the new components/tests; existing repository errors remain. M8 stays open
for shared primitive styles and final acceptance, including arrival-flight geometry.
No live multiplayer or mobile acceptance is claimed.

## Shared Primitive Defaults

`overworldPrimitives.css` centralizes nine canonical declaration blocks: button
cursor/active/disabled states, heading/paragraph reset, labels, interactive base,
panel base, panel descendant sizing and primary-button variant. CSS AST matching
removed 103 identical selector copies across ten extracted surfaces. Mixed rules
retain their surface-specific selectors; nonmatching declarations, media rules,
layout and keyframes remain local. Copied body/debug globals were removed from
the three boards and footer components; App remains their single owner. App keeps
its own scoped primitives because it also presents non-overworld controls.

Three tests verify overworld confinement, singleton import, declaration equivalence
and primary cascade ordering, and absence of duplicates/copied globals. The initial
reference assertion incorrectly required App to retain unused list/title/troop
selectors; it now compares their identical interactive defaults with App's primary
base. Focused rerun and final full suite pass: 510 tests in 65 files (24.61s).

Desktop browser checks verified the planning board/footer, selected draft and
inspector, archive details, roster, scheduled race cards and their inspector.
Computed styles confirm local 8px inspector/14.4px card gaps and large primary
padding override the shared defaults. No claims, assignments or unlocks were
persisted in this pass. QA Slot 3 remains at race unlock; normal saves untouched.
Browser warning/error log was empty. Opening and tutorial are still part of the
final acceptance pass rather than newly verified by this CSS pass.

Build passed (14.83s), existing chunk warning only, no unused CSS warnings. CSS is
209.39 kB (gzip 30.41 kB), down 7.43 kB from the footer extraction; main JS is
829.14 kB (gzip 218.39 kB). No filtered new test TypeScript diagnostics; existing
global errors remain. General primitive consolidation is complete for these
extracted surfaces; M8 still needs final acceptance including arrival geometry.

## Final Acceptance

Completed 2026-10-09 against the final source after the temporary trace was removed.
The fresh `localhost:5174` origin was empty before this pass; normal save origins
and QA Slot 1 on `127.0.0.1:5174` were preserved. Desktop checks used the default
1280x720 viewport and a targeted 1440x900 override, reset afterward. No mobile
redesign or live multiplayer browser checks were performed.

| Requirement | Authoritative evidence |
|---|---|
| Opening picks and inspection | Fresh Campaign, first/second claim and Begin gate; future Goblin Militia detail/24-body portraits; tutorial's two opening choices and Begin Contest |
| Combined draft | Both halves independently selected/confirmed; confirmed troop remained while upgrade was pending; tutorial progressed only after both commands |
| Blocked submission | Native End Cycle focus kept planning active and highlighted draft; after draft completion, assignment tooltip/gate remained until all troops were assigned |
| Assignments | Three fresh-Campaign drags, four next-cycle drags, four traced-fixture drags and all three tutorial drags; shared-owner return-to-ready verified in preceding footer pass |
| Cycle handoff | Fresh Campaign reached cycle 2 and then scheduled cycle 3; traced Campaign reached cycle 3 and tutorial Contest reached cycle 2 |
| Scheduled unlock | Selected Humans, Confirm Humans enabled, claim returned to planning with Human Soldier/Archer and 2 VP; earlier passes cover cycle 7/legacy fixtures |
| Archive access | New records present after handoff; first new cycle-2 battle opened as CYCLE-2-RIFT-4, step 0/142, with correct Goblin Wizard force; earlier passes cover detail/pagination/missing replay states |
| Tutorial progression | Complete real UI flow: footer Watch Battle, replay tasks, menu/start/opening, Essence view, automatic reveal, both draft commands, Rift enemy/mutator targets, assignments, End Cycle, ready Continue, archive inspection, Rival Info, Finish Tutorial returning to menu |
| Store/server behavior | Final full suite includes 32 store progression/compatibility tests, 27 server tests and three local two-client tests; moved UI callbacks continue to delegate to those commands |
| Responsive preservation | CSS extraction retained media rules and surface-specific variants; this is not mobile browser acceptance |

### Arrival Geometry

Long synchronous resolution caused browser input/evaluation timeouts even when
submission succeeded. State was checked before proceeding; no duplicate submission
was issued. Two short-lived flight captures were missed. A temporary development
trace at the existing `incomingBattleLogStyle` DOM measurement point then captured
four actual incoming rows on `127.0.0.1:5174` at 07:46:17 UTC. It was removed before
the final suite/build; no instrumentation remains in source.

| Rift | Source left/top (px) | Source width/height (px) | Target row top (px) |
|---|---|---|---|
| cycle-2-rift-4 | 861.786 / 422.625 | 72.625 / 57.250 | 123.438 |
| cycle-2-rift-3 | 464.384 / 422.625 | 72.625 / 57.250 | 177.038 |
| cycle-2-rift-2 | 861.786 / 201.946 | 72.625 / 100.455 | 230.638 |
| cycle-2-rift-1 | 464.384 / 201.946 | 72.625 / 100.455 | 284.238 |

All four flight origins/sizes exactly matched measured Rift mini-replay bounds;
all destination widths matched the 283.661px archive list, with x=1120.572px and
53.6px row offsets. None used the viewport-center fallback. The scheduled screen
confirmed finalization afterward. This proves geometry and handoff, not a captured
frame-by-frame visual animation recording; timing/order remains covered by the
cycle presentation owner tests and earlier resolving browser checks.

### Outcome And Limitations

Final suite: 510 tests in 65 files passed (23.88s). Build passed (13.10s), existing
chunk-size warning only, no unused CSS warnings. CSS is 209.39 kB (gzip 30.41 kB),
main JS 829.14 kB (gzip 218.39 kB). Browser warning/error logs were empty. Existing
global TypeScript errors remain; the new primitive test had no filtered diagnostic.
App is 3066 physical lines; file size is supporting context, not the ownership
acceptance criterion. Changes remain uncommitted.

At the existing 1280px opening breakpoint, revealing the inspector moves cards
because the empty panel changes from `display:none` to visible. This can retarget
a pointer click; keyboard activation works. The same collapse rule exists in
pre-audit commit `e281793`; it was not introduced or redesigned by the extraction.
The existing first-pin/second-pin inspection behavior also remains unchanged.
Neither issue is represented as newly fixed by this audit milestone.
