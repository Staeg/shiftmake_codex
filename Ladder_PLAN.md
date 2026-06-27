# Ladder Mode Implementation Plan

## Summary

Add `ladder` as Shiftmake's third singleplayer mode. Ladder reuses Campaign progression, battles, unlocks, assignment rules, recovery, Essence, VP, and 10-Cycle structure, but replaces Campaign Rift generation with Rift-sets drawn from a shared database.

The Ladder database will be Render Postgres in production, connected from the existing Render-hosted server using an internal database URL. Render's normal web-service filesystem is ephemeral, and Persistent Disks are single-service-instance storage; Postgres is the right production backend for harvested cross-player Rift-sets.

No ranking, rating, matchmaking rating, player rating, or Rift-set rating fields are part of v1.

## Implementation Progress

Status as of 2026-05-25:

- Milestone 1: Completed. `GameMode` includes `ladder`, `GameState` stores Ladder source metadata, and Ladder-specific payload, Guardian, compatibility, draw, and harvest types live in `src/engine/types.ts`.
- Milestone 2: Completed. `src/engine/ladder.ts` validates compact Rift-sets, reports compatibility issues, converts valid payloads into `RiftInstance[]`, preserves Guardian upgrade snapshots, and builds harvested payloads from completed cycles.
- Milestone 3: Completed for the implemented v1 path. `src/server/ladderRepository.ts` includes Postgres and memory repositories, reads `LADDER_DATABASE_URL` before `DATABASE_URL`, initializes the table/indexes, and exposes insert, draw, compatibility, appearances, spent, harvest child, list, and stats methods. Automated tests cover the isolated memory adapter; live Postgres verification remains an environment smoke check.
- Milestone 4: Completed. Server startup initializes storage and idempotently seeds missing Generation 0 records to 5 sets per Cycle across Cycles 1-10.
- Milestone 5: Completed. `POST /ladder/draw` draws valid unspent sets, inserts a Generation 0 fallback when needed, and the store draws Ladder Rifts after opening races and after each non-final Ladder cycle. Draw does not increment appearances.
- Milestone 6: Completed. `POST /ladder/harvest` increments parent appearances, marks parents spent with 50% probability, and creates child Rift-sets from conquered/unconquered Rift outcomes while reusing Campaign battle and replay resolution.
- Milestone 7: Completed. Singleplayer save slots can start/replace/load Ladder saves, slot summaries show `Ladder`, and current Ladder source metadata persists in normal saves.
- Milestone 8: Completed. The debug menu includes a Ladder database viewer with filters, row stats, compatibility issues, and expandable Rift payloads. Results are limited to 50 rows.
- Milestone 9: Completed except for manual end-to-end smoke on a live Postgres-backed Render-like environment. `TECHNICAL.md`, `design documents/Overview.md`, and `design documents/Rifts.md` are updated. `npm run test` and `npm run build` pass locally.

Verification completed:

- `npm run test`: 25 test files, 261 tests passing.
- `npm run build`: passing.
- Added focused Ladder tests for validation, conversion, baseline seeding, valid draw filtering, appearances, spent state, store-side Ladder draw on opening start, duplicate harvest prevention during slow finalization, and harvested child generation with player Guardian upgrade snapshots.

Known follow-up:

- The production Postgres adapter is implemented and uses `pg`, but automated tests currently exercise the isolated repository adapter rather than a live test Postgres database.

## Production Storage

Use a Render Postgres database in the same Render account and region as the existing multiplayer server.

- Configure the Ladder server with `LADDER_DATABASE_URL` or `DATABASE_URL`.
- Use Render's internal Postgres URL in production.
- Do not store the production Ladder database as JSON on the Render service filesystem.
- Do not rely on Render Persistent Disks for v1 Ladder storage, because they are tied to a single service instance and are less flexible than managed Postgres for querying, pruning, and validation tags.

Recommended Postgres table:

```sql
create table ladder_rift_sets (
  id uuid primary key,
  cycle_number integer not null,
  generation integer not null,
  source_set_id uuid null references ladder_rift_sets(id),
  appearances integer not null default 0,
  spent boolean not null default false,
  compatibility_status text not null,
  compatibility_checked_at timestamptz not null,
  compatibility_issues jsonb not null default '[]'::jsonb,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index ladder_rift_sets_draw_idx
  on ladder_rift_sets (cycle_number, spent, compatibility_status);

create index ladder_rift_sets_generation_idx
  on ladder_rift_sets (cycle_number, generation);

create index ladder_rift_sets_created_at_idx
  on ladder_rift_sets (created_at);
```

The JSONB payload stores the full Rift-set:

- Rift id
- Cycle
- tier
- mutator ids
- VP value
- Guardian troop identities
- player-origin Guardian race upgrade ids
- player-origin Guardian troop-class upgrade ids

## Storage Estimates

Measured current generated Campaign Cycle-1 Rift payloads:

- Existing full `RiftInstance[]` shape with resolved combatants: about 13.5-16.7 KB per Rift-set, median about 14.9 KB.
- Proposed compact Generation 0 record: about 1.25 KB per Rift-set.
- Proposed compact harvested record with several conquered Rifts and upgrade snapshots: usually 2-5 KB.
- Conservative upper estimate for unusually large harvested records: 6-8 KB.

With 5 baseline sets per Cycle across 10 Cycles:

- Baseline database: roughly 65 KB compact, plus Postgres row/index overhead.
- 10,000 harvested sets: roughly 30-50 MB expected compact payload storage before database overhead.
- 100,000 harvested sets: likely a few hundred MB including overhead and indexes.

Do not delete Spent Rift-sets in v1. Add dev-visible storage statistics so real observed averages can drive later deletion thresholds and any higher Spent probability.

## Milestone 1: Types And Engine Boundaries

Implementation:

- Add `ladder` to `GameMode`.
- Add Ladder metadata to `GameState`, including current source Rift-set id, generation, and source Cycle.
- Add Ladder-specific types for compact Rift-set payloads, Guardian snapshots, compatibility issues, draw results, and harvest results.
- Keep all gameplay conversion and validation in `src/engine/`.
- Keep DOM, rendering, fetch, and Postgres code out of `src/engine/`.

Checks:

- `npm run test` still passes for existing Campaign and Contest tests.
- TypeScript rejects Ladder code that tries to import server, store, or UI modules into `src/engine/`.
- Existing Campaign and Contest save flows remain unchanged except for the widened `GameMode` type.

## Milestone 2: Rift-Set Validation And Conversion

Implementation:

- Implement pure validation for stored Rift-sets.
- Validate known race ids.
- Validate known unit class ids.
- Validate known race upgrade ids and troop-class upgrade ids.
- Validate known mutator ids.
- Validate Cycle number.
- Validate tier and VP numbers.
- Validate that each Rift has non-empty valid Guardians.
- Tag invalid records as incompatible instead of deleting them.
- Implement conversion from valid Ladder Rift-set payloads into `RiftInstance[]`.
- Store player-origin Guardians as troop identities plus `raceUpgradeIds` and `troopClassUpgradeIds`.
- Resolve player-origin Guardians at battle time through existing engine rules.

Checks:

- Valid generated baseline sets convert into playable `RiftInstance[]`.
- Unknown race ids produce compatibility issues.
- Unknown unit class ids produce compatibility issues.
- Unknown upgrade ids produce compatibility issues.
- Unknown mutator ids produce compatibility issues.
- Incompatible sets are excluded from player draws.
- Player-origin Guardians receive their stored upgrade snapshots in battle inputs.

## Milestone 3: Postgres Ladder Repository

Implementation:

- Add a server-side Ladder repository layer for Postgres.
- Read `LADDER_DATABASE_URL` first, then `DATABASE_URL` as a fallback.
- Add a migration or init script for the `ladder_rift_sets` table and indexes.
- Add repository methods for insert, draw, mark compatibility, increment appearances, mark spent, harvest child, list, and storage stats.
- Use local Postgres for development parity.
- If a JSON repository adapter is added, keep it local/dev-only and do not wire it as production storage.

Checks:

- Empty database initializes without crashing.
- Insert works.
- Draw works.
- Appearance increment works.
- Spent update works.
- List and filter operations work for devtools.
- Queries never return `spent = true` or `compatibility_status != 'valid'` for player draws.
- Repository tests run against a test database or isolated adapter.

## Milestone 4: Baseline Seeding

Implementation:

- Add a seed command or server startup guard.
- Create exactly 5 Generation 0 Rift-sets per Cycle when missing.
- Use current Campaign-style Rift generation for baseline sets.
- Validate all generated baseline records before insertion.
- Make seeding idempotent so repeated runs do not duplicate rows.

Checks:

- Fresh database gets exactly 50 Generation 0 records.
- Re-running seed does not create duplicates.
- Every Cycle 1-10 has at least 5 valid baseline records.
- Seeded records have `appearances = 0`.
- Seeded records have `spent = false`.
- Seeded records have `generation = 0`.
- Seeded records have `source_set_id = null`.

## Milestone 5: Ladder Draw And Cycle Start

Implementation:

- Add server endpoint `POST /ladder/draw` with `{ cycleNumber }`.
- Draw one valid unspent Rift-set for the requested Cycle.
- If no valid unspent set exists for a Cycle, generate and insert a fresh Generation 0 fallback before drawing.
- Add a store-side Ladder client for draw requests.
- Start Ladder saves like Campaign, but populate `openRifts` from the drawn Rift-set after opening races.
- On each Ladder Cycle transition, draw the next Cycle's valid Rift-set.
- Do not increment appearances during draw; appearances increments when the Cycle finishes.

Checks:

- Starting Ladder reaches planning with database-sourced Rifts.
- Reloading a Ladder save mid-Cycle keeps the same current Rift-set.
- Draw excludes spent records.
- Draw excludes incompatible records.
- Server unavailable produces a clear blocking UI message.
- Server unavailable does not silently fall back to Campaign generation.
- Campaign and Contest still start with their existing Rift sources.

## Milestone 6: Harvesting Completed Cycles

Implementation:

- Add server endpoint `POST /ladder/harvest`.
- On Ladder Cycle completion, increment parent `appearances` by 1.
- On Ladder Cycle completion, mark the parent `spent = true` with 50% probability.
- Create a child Rift-set with `generation = parent.generation + 1`.
- For conquered Rifts, replace Guardians with the Troops the player assigned there.
- Store conquered Guardian troop identities with all current player race and troop-class upgrade ids.
- For Rifts the player did not send Troops to, retain the original Guardians.
- Use the same battle and replay resolution path as Campaign.

Checks:

- Parent appearances increments whether or not the parent becomes spent.
- Parent spent marking happens at the requested 50% probability.
- Harvested child preserves all Rifts from the parent set.
- Conquered Rifts store player Guardian troop identities.
- Conquered Rifts store race upgrade ids.
- Conquered Rifts store troop-class upgrade ids.
- Unplayed Rifts retain original Guardian identities.
- Child generation is exactly parent generation plus 1.
- Child source id is the parent id.

## Milestone 7: Save, Load, And UI Integration

Implementation:

- Add Ladder start and replace buttons to singleplayer save slots.
- Display Ladder as its own mode label in slot summaries.
- Persist current Ladder source Rift-set metadata in saves.
- Keep `App.svelte` thin: UI dispatches actions, while store, server, and engine modules own Ladder behavior.
- Do not add Ladder controls to Contest multiplayer flow.

Checks:

- Ladder save can be created.
- Ladder save can be loaded.
- Ladder save can be overwritten.
- Ladder save can be cleared.
- Reloading mid-Cycle keeps the same current source Rift-set id.
- Completing a loaded Ladder Cycle harvests against the correct parent id.
- No Ladder UI appears in the Contest multiplayer room flow.

## Milestone 8: Devtool Viewer

Implementation:

- Extend the dev-only debug tools with a Ladder database viewer.
- Add filters for Cycle, generation, spent status, and compatibility status.
- Show per Rift-set:
  - id
  - source id
  - Cycle
  - generation
  - appearances
  - spent
  - compatibility status
  - compatibility issues
- Expand each Rift to show:
  - tier
  - modifiers
  - VP
  - Guardians
  - upgrade snapshots
- Add a storage stats view for total rows, valid rows, spent rows, incompatible rows, and approximate payload bytes.

Checks:

- Devtool can inspect seeded records.
- Devtool can inspect harvested records.
- Incompatible records are visible to developers.
- Incompatible records are never drawn for players.
- Large result sets are paginated or limited.
- Production player-facing UI exposes none of the database browser.

## Milestone 9: Documentation And Final Verification

Implementation:

- Keep this file updated as implementation details settle.
- Update `TECHNICAL.md` with Ladder architecture, Render Postgres persistence, server endpoints, and engine boundary notes.
- Update relevant design docs if implemented behavior differs from existing Campaign/Rift docs.
- Document local development setup for the Ladder database.
- Document required Render environment variables.

Checks:

- Docs describe Render Postgres as production storage.
- Docs do not describe rating or ranking as implemented v1 behavior.
- `npm run test` passes.
- `npm run build` passes.
- Manual smoke test:
  - start Ladder
  - finish a Cycle
  - verify parent appearances increments
  - verify parent may be marked spent
  - verify harvested child insert appears in devtool
  - verify next Cycle draws a valid Rift-set

## Assumptions

- Ladder v1 uses Campaign's 10-Cycle structure and progression rules.
- Production storage is Render Postgres.
- Baseline seed count is 5 Rift-sets per Cycle.
- Player-origin Guardians are stored as troop identities plus upgrade id snapshots, not baked stats.
- Spent Rift-set pruning is deferred until real storage data exists.
- Rating and ranking are intentionally absent from v1 schema, UI, and logic.
