# Replay Playback Ownership

Milestone 6 completed 2026-10-08. Milestone 7 subsequently moved viewer presentation
into `ReplayViewer.svelte`; playback state, scheduling and renderer lifetime retain
the explicit owners established here.

## State And Transitions

| Concern | Owner | Transition / cleanup |
| --- | --- | --- |
| Game, route, save slot, archive index, system feedback | `gameStore.ts` | Session actions and persistence; no playback-tick writes to saved game data |
| Resolved replay, stored input, imported report, position, selected event, playing, rate | `ReplayPlaybackState` in `replayPlaybackState.ts`; atomic source remains `gameStore` | Open/import reset position, selection and playing; close clears loaded data; rate survives replay close/open but resets on session initialization |
| Manual step, seek and event-selection semantics | `navigateReplay` | Beat-skipping navigation uses existing `replayNavigation.ts`; seek clears selection; event selection follows the chosen step |
| Session subscription | `gameSessionStore` read-only view | Shallow field/reference comparison suppresses playback-only notifications |
| Playback subscription | `replayPlaybackStore` read-only view | Suppresses session-only notifications; replay replacements compare reference, not only ID |
| Archive input persistence | `saveSlots.ts` or multiplayer client cache | Deterministic resolver constructs loaded replay; playback views do not resolve or persist inputs |
| Tutorial progress and save ordering | `gameStore.ts` and `tutorial.ts` | Progress is persisted by explicit tutorial actions; App selects requested surfaces after store transitions |
| Animation-frame handle, timeline cache and cursor | `replayPlaybackController.ts`, wired by `ReplayViewport.svelte` | One frame loop; pause cancels frames; seek/rate/replay changes rebase the timeline; exit/reset/dispose also release the one-entry cache |
| Replay renderer and initialization attempt | `replayRendererLifecycle.ts`, wired by `ReplayViewport.svelte` | Coalesced import/init per host, route/connection checks, exactly-once destroy on replacement/exit/dispose; late completion cannot publish a stale renderer |
| Renderer effects and interaction timers | `BattleRenderer.ts` and `animation.ts` | Effect cancellation cancels requested frames, delayed effects and drag-reset timers; destroy cancels resize work, disconnects observer and removes handlers |
| Hover/lock, event pin, navigation kind and renderer highlights | `ReplayViewer.svelte` / its viewport | Viewer-local state; reset on replay-reference/scene transitions |
| Mini-replay renderers | `RiftBattleMiniReplay.svelte` | Separate cycle animation lifecycles, not controlled by main replay playback state |
| Multiplayer reconnect timer and socket | `gameStore.ts` / multiplayer client | Session lifecycle only; not moved into playback |

The source store remains a single atomic snapshot. Views introduce no independently
writable copies and preserve the flat public `gameStore.subscribe` API and actions.
App now subscribes to session and playback separately, so game-derived reactivity
does not rerun solely because the playback step changes. Views release their source
subscription on last unsubscribe and synchronously read fresh state on resubscribe.

## Store Test Profile

Command before changes:

```powershell
npx.cmd vitest run src/store/gameStore.test.ts --reporter=json --outputFile=artifacts/m6-store-before.json
```

The 31-test store file took 14.48s. Main-menu initialization and tutorial exit each
took about 4.02s and 4.04s because both started the real tutorial battle fixture.
Main-menu initialization checks persisted progress, not combat: it now seeds the
dedicated tutorial save and progress through the real persistence helpers. Its
single observed post-change duration was 4.12ms. The existing start/exit/resume
integration and `tutorial.test.ts` still build the actual tutorial battle. Resolver
injection is not needed for this narrow routing test.

Other expensive store tests exercise real archive/report/cycle behavior and remain
real resolver integrations. Their timings vary with generated inputs and concurrent
work. The post-change store file took 15.95s, with the report test varying from
1.25s to 5.47s, so these runs do not establish a whole-suite speedup.

Post-change focused command:

```powershell
npx.cmd vitest run src/store/replayPlaybackState.test.ts src/store/gameStore.test.ts --reporter=json --outputFile=artifacts/m6-store-after.json
```

All 38 tests passed. Six view/navigation tests cover notification isolation,
same-ID replacement, subscriptions, reference preservation, absent replays and
navigation semantics. A real stored-input integration checks archive opening,
forward/backward navigation, seeking, event selection, play/rate updates, reopen,
close, unchanged game references, unchanged save payload and the flat public API.

## Lifecycle Verification

Nine deterministic scheduler tests cover cue order/timing, catch-up, beat skipping,
pause/resume without elapsed-time carryover, rate changes, external seeks,
same-ID replay replacement, active-screen guards, callback-triggered switching,
end/no-cue handling and disposal. Eight lifecycle tests cover coalesced import/init,
canceling pending imports and initialization, host replacement, disconnected hosts,
failure/retry, stale failures and idempotent disposal. Four animation tests verify
frame cancellation before and during an effect, including cancellation inside its
update callback without rescheduling or finishing. These tests use controlled
schedulers/promises rather than elapsed wall-clock waits.

Renderer teardown releases constructed resources immediately, even during init.
Shared texture loading itself is not aborted; late completion is guarded and cannot
publish the destroyed renderer. App compares replay references rather than IDs
when loading renderer state. Real store tests switch between two archived inputs,
check tutorial progress while a replay is loaded, and verify replay arrival/open/
close via the fake multiplayer socket without requiring a live connection.

Final full suite: 401 tests in 39 files passed (20.19s). Production build passed
(14.67s) with the existing large-chunk warning. New playback, lifecycle and animation
modules/tests pass isolated strict TypeScript checking including unchecked-index
and exact-optional flags. Repository-wide checking still has pre-existing errors;
this milestone does not claim a clean full type check. Complete engine reference
replays remain unchanged, without recapture.

## Desktop Browser Verification

Reproducible QA report generation:

```powershell
npx.cmd vite-node scripts/replayPlaybackQaCampaign.ts
npm.cmd run dev -- --host 127.0.0.1 --port 5174 --strictPort
```

The script writes `artifacts/replay-playback-qa-campaign.txt` with real ordinary,
summon and long battle inputs. Import through Debug's report-file control into an
empty slot on the separate QA origin, then complete its opening draft and open the
archive battles. The browser run verified all three slots were empty before
importing; existing saves on port 5173 were untouched.

At 1440x900, checks covered ordinary (140 steps), summons (168) and long (1189)
archives; forward/backward navigation; backward/forward event selection; slow and
fast playback; rate changes while playing; pause/resume; and stopping at the end.
Leaving the long replay while its Pause control was visible removed all canvases.
Reopening an archive reset to paused step zero and created exactly one canvas.
These exit/reopen checks were repeated after the final animation cleanup. No
console warnings/errors were captured. The existing tutorial resumed its
battle-layout replay at paused step zero on the disposable localhost origin.

The desktop screenshot retained the existing battlefield, controls and inspector
layout. The existing archive sidebar is hidden at the default 1280px width, so the
archive pass used its supported desktop width; responsive redesign, live
multiplayer connection UX and mobile checks remain outside this plan's scope.
