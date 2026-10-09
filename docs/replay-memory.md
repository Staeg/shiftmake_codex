# Replay Memory Gate

Milestone 9, 2026-10-09. Decision: share unchanged, deeply frozen unit
records while retaining the full snapshot API. Do not add a cursor, keyframes,
cross-replay cache, persisted delta format or migration.

## Measurement

Run from the repository root on Node v24.14.0:

```powershell
node --expose-gc node_modules/vite-node/vite-node.mjs scripts/replayMemory.ts --all
```

The generated `artifacts/replay-memory-baseline.json` is ignored. Each fixture/mode
runs in an isolated process. Three GC-retained heap samples hold 12 independently
resolved replays (3 for the larger army). The reported value is the per-replay
median. Expected/candidate verification graphs remain constant across samples and
are excluded by subtraction. Each sample's retained models leave function scope
before the next GC/baseline. Compact closures are created in a separate factory so
they cannot retain the original snapshot graph through a shared lexical context.
Every candidate reconstructs the complete replay and passes deep equality first.

Modes: `shared` uses the integrated resolver; `materialized` recreates independently
cloned unit records in each snapshot; `deltas` stores initial units, event data and
changed units; `keyframes` adds frames every 64 steps. Compact prototypes use frozen
unit records and uncached random access. Creation timing includes resolution and
any conversion, not a comparison of optimized integrated resolvers. Ten thousand
deterministic random snapshot reads measure data access, not Pixi rendering.

Five fixtures are the M0 inputs. `army` uses the ordinary input with quantities
12 on both sides (24 units, 739 steps, 17,760 historical unit references). This
is a targeted stress input, not a representative production workload survey.

Retained JavaScript heap bytes, final comparative run:

| Fixture | Unshared | Shared | Deltas | Keyframes |
| --- | ---: | ---: | ---: | ---: |
| ordinary | 311,257 | 301,985 | 325,526 | 323,477 |
| summons | 581,793 | 435,193 | 469,569 | 470,298 |
| death-prevention | 215,941 | 195,644 | 210,478 | 210,726 |
| timed-effects | 337,011 | 305,214 | 328,261 | 331,061 |
| long | 2,445,913 | 2,312,449 | 2,532,212 | 2,534,255 |
| army | 14,000,928 | 3,576,987 | 5,248,187 | 5,249,805 |

Milliseconds for 10,000 random snapshot reads:

| Fixture | Unshared | Shared | Deltas | Keyframes |
| --- | ---: | ---: | ---: | ---: |
| ordinary | 0.968 | 0.568 | 33.337 | 18.418 |
| summons | 0.624 | 1.426 | 87.299 | 32.482 |
| death-prevention | 0.776 | 0.922 | 18.203 | 16.059 |
| timed-effects | 0.965 | 0.638 | 29.996 | 13.106 |
| long | 1.749 | 1.484 | 294.222 | 23.110 |
| army | 1.308 | 1.148 | 697.188 | 84.276 |

GC and object-layout noise are material: recreated unshared army samples range
9,351,651-14,002,472 bytes; integrated shared samples range
3,562,581-5,323,792 bytes. The direct pre-change resolver measurement was
9,367,144 bytes median (samples 13,963,597 / 9,348,429 / 9,367,144), versus
3,576,987 integrated shared: approximately 62% lower. This supports the decision
without claiming that the noisier recreated median proves a 74% improvement.

V8 serialized graph sizes for army are 10,350,430 / 3,887,686 / 3,841,412 /
3,842,586 bytes respectively. These account for aliases but are NOT retained heap.
Full JSON is unchanged at 11,020,397 bytes. Compact representations barely reduce
the shared graph and are slower to seek; measured heap also does not favor them.
Army creation medians are 982.122 / 974.522 / 1033.953 / 1058.792 ms. No meaningful
resolve-time improvement is claimed. Browser heap/peak allocation and real-world
distribution were not measured. Initial gate prototypes had a closure-retention
error; their compact heap numbers were discarded, not used for the decision.

## Ownership And Consumers

`battle.ts` already records exact unit deltas. Final materialization now freezes
initial records and clones/freezes each changed record once. Units include frozen
stats, position, footprint coordinates/array, attributes and engagement IDs.
Snapshot arrays remain independently owned. Consumers must copy before modifying
a unit; existing construction types remain mutable for compatibility. The working
resolver, inputs and independently resolved replays do not share these records.
No cache lifetime, bound or seek reconstruction is introduced.

Inventory before changing ownership:

- `ReplayViewer`, `ReplayRecap`, `battleRecap`, `BattleRenderer`, mini-replays,
  ability lab and archive details read snapshot units; no runtime mutation found.
- Store selections and cycle animation records retain resolved replay objects;
  `getReplay`/slot loading resolve input on demand, without a resolved replay cache.
- `saveSlots` stores `StoredReplayPayload` inputs; legacy full-output read fallback
  remains unchanged. Reports and multiplayer projection likewise bundle inputs.
- Battle reports use resolved output for summary/diagnostics, then persist inputs;
  campaign reports bundle input payload maps. Their version/encoding is unchanged.
- Contest AI worker sends a game and returns player planning state, not snapshots.
  Permutation/report scripts inspect resolved snapshots and serialize results;
  unit freezing does not change JSON values or structured-clone wire data.

There is an intentional in-process ownership change: writes to resolver-produced
unit records now throw in strict mode instead of editing an isolated record.
An existing footprint-isolation test was updated to require mutation rejection.
This is documented, not hidden behind a claim of identical mutability. No replay
format, deterministic content or persistence version changed.

## Acceptance

- Complete pre-audit goldens remain exact for all five fixtures, including births,
  death prevention, timed effects, footprints, events, profiles and metadata.
- Eleven ownership/access tests cover frozen nested fields, unchanged identity
  sharing, changed identity replacement, independent snapshot arrays/resolutions,
  input preservation and forward/backward/random snapshot access.
- Full suite passed 521 tests in 66 files (23.05s), including playback scheduling,
  animation transitions, recap, event log helpers, replay replacement, Rift/cycle
  mini-replay integration, persistence, reports and local multiplayer contracts.
- Desktop browser on disposable QA Slot 2 verified next/previous, event jumps
  #100 to #1 across summoning, recap, 64x playback to 142/142, reset to 0/142,
  return to archive and replacement by a 901-step replay at step 0. Battlefield
  renders; warning/error logs empty. No new strategic save progress was made.
- Build passed (11.89s), existing chunk-size warning only. New script/test have
  no filtered TypeScript diagnostics; repository-wide pre-existing errors remain.
- No live multiplayer, mobile, frame-by-frame mini-replay capture or browser heap
  claim. Existing mini-replay integration passes using newly frozen engine output;
  the renderer-facing snapshot API and transitions are unchanged.
