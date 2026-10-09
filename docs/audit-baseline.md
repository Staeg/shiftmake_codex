# Audit Baseline

Captured 2026-10-08 from `e281793` plus Milestone 0 tooling, before engine changes.

## Commands And Conditions

- `npm.cmd test`: 28 files, 299 tests passed, 29.71 seconds wall time.
- `npm.cmd run build`: passed in 18.06 seconds; existing large-chunk warning.
- After adding references, `npm.cmd test`: 29 files, 304 tests passed, 28.03s.
- Source lines including blank lines: App.svelte 12,098; gameStore.ts 1,616;
  battle.ts 5,199.
- Slow suites: gameStore 25.45s, campaign 25.29s, roleBehavior 15.35s, battle
  13.93s. Full-suite timings include parallel execution and build contention.
- `node --import tsx scripts/replayBaseline.ts`: Windows, Node v24.14.0; one
  warmup and three measured runs per fixture. Times below are medians.

| Fixture | Outcome | Steps | Replay JSON bytes | Stored input bytes | Resolve ms | Open ms | 10,000 seeks ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ordinary | defeat | 140 | 239745 | 1137 | 12.319 | 11.340 | 2.467 |
| summons | defeat | 168 | 493357 | 1538 | 12.992 | 11.547 | 1.305 |
| death-prevention | defeat | 82 | 146643 | 1603 | 4.523 | 5.842 | 1.764 |
| timed-effects | defeat | 142 | 243641 | 1359 | 9.894 | 9.362 | 2.481 |
| long | draw | 1189 | 2003676 | 834 | 48.453 | 52.513 | 4.863 |

Open measures input JSON parsing plus deterministic resolution, matching the
archive reconstruction boundary. Seek measures snapshot access and forward/backward
playable-step navigation for 10,000 deterministic positions. It excludes renderer,
DOM, localStorage I/O, and browser presentation time. JSON byte length measures
serialized representation, not retained heap size. Re-run in the same environment
for comparisons; these small fixtures do not establish production-scale costs.

## Replay References

`scripts/replayBaselineFixtures.ts` defines five fixed inputs. Full replay JSON is
captured as gzip files under `src/engine/__fixtures__/replay-reference/`.
`replayReference.test.ts` compares every serialized field, including snapshots,
metadata, map, profiles, event ordering, and alive counts. It also verifies each
special fixture exercises its named mechanic.

Capture command: `node --import tsx scripts/replayBaseline.ts --capture`.
Do not regenerate references to make a behavior-preserving refactor pass. Intentional
changes require reviewing the replay differences and compatibility impact first.

During Milestone 1, type checking found a missing required `shortText` on the
synthetic timed-effect ability. Added that description and recaptured references
before any engine changes. Only the timed-effects troop-profile description and
its JSON size change (243681 replay bytes, 1399 input bytes); snapshots, events,
and outcomes are unchanged. Byte counts now use UTF-8 `TextEncoder` rather than
the repository's narrowed global Buffer declaration.

## Repository Hygiene

Root generated logs, canvas capture, and Playwright screenshots were removed from
the Git index and ignored. Local copies remain available. Asset archive directories
were left untouched for the later asset audit.

## Milestone 4 Comparison

Captured 2026-10-08 on the same Windows/Node v24.14.0 environment. Re-ran
`node --import tsx scripts/replayBaseline.ts` immediately before and after replacing
the unit dirty-check serialization. Both used one warmup and three measured runs,
without simultaneous test/build commands. The existing dev server remained idle.
The original baseline above remains intact; this fresh before/after pair avoids
attributing earlier environment variance to the comparator.

| Fixture | Resolve before/after ms | Open before/after ms | 10,000 seeks before/after ms |
| --- | ---: | ---: | ---: |
| ordinary | 11.362 / 8.226 | 12.302 / 7.168 | 4.386 / 3.778 |
| summons | 13.761 / 6.726 | 11.842 / 8.656 | 2.457 / 2.101 |
| death-prevention | 4.721 / 3.045 | 3.994 / 5.023 | 1.264 / 1.301 |
| timed-effects | 6.276 / 6.035 | 6.999 / 4.820 | 1.498 / 1.171 |
| long | 57.862 / 35.224 | 52.657 / 29.814 | 5.699 / 4.707 |

All outcomes, step counts, replay/input byte counts, and seek checksums match the
pre-change results (with the already documented timed-effect description fix).
Complete replay goldens pass without regeneration. Resolver medians are lower in
this small sample; opening results include a regression for death-prevention.
Navigation itself did not change, so seek differences are measurement noise, not
an optimization claim. These results do not establish production-scale speedups
or retained-memory improvements. Materialization and snapshot cloning remain.

Verification: 31 focused comparator tests, including every field and nested stat,
ordered arrays, nullable identity, coordinate changes and object insertion order.
Isolated strict TypeScript checking also includes unchecked-index and exact-optional
checks. Full suite passed 360 tests in 34 files (21.31s); build passed (14.93s), with
the existing large-chunk warning. Suite times still include concurrent build work.
