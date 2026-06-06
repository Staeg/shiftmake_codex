# Multi-Hex Battle Map Implementation Plan

This plan implements the multi-hex battle map, unit footprints, placement rules, `Move` stat, range updates, Frontline push-through, and the `Chaff` to `Pusher` role rename. Complete milestones sequentially; each milestone depends on the previous one.

## Milestone 1 - Lock Terminology And Data Compatibility

1. Rename the autonomous role from `chaff` to `pusher` across engine types, catalog definitions, UI labels, tests, docs, and replay text.
2. Add a compatibility normalization helper for stored or debug inputs that still contain `chaff`, mapping them to `pusher` before battle resolution or display.
3. Add `move` to `UnitStats`, `TroopStatKey`, stat breakdowns, tooltip/stat UI, debug battle builders, simulation harness helpers, battle report payload construction, and any tests that construct stats manually.
4. Keep `Move` behavior scoped to the new Frontline push-through/reposition and Pusher breakthrough mechanics only; do not alter ordinary one-step role movement in this milestone set.
5. Preserve current troop quantity expansion: every resolved combatant still expands into `quantity` individual battlefield units.

Acceptance:

- TypeScript has no remaining uncompilable references to `chaff`.
- Old replay/debug data that says `chaff` can still be loaded and displayed as `pusher`.
- Every manually constructed `UnitStats` object includes `move`.

## Milestone 2 - Update Catalog Stats

1. Update all base unit type stats in `src/engine/unitCatalog.ts` to include `move`.
2. Use these base `move` values:
   - Soldier `2`
   - Champion `2`
   - Avenger `1`
   - Beastmaster `2`
   - Druid `2`
   - Elemental `1`
   - Elementalist `2`
   - Knight `1`
   - Militia `3`
   - Archer `2`
   - Wizard `2`
   - Priest `2`
   - Ranger `3`
   - Necromancer `2`
   - Skeleton `2`
   - Shaman `2`
   - Wolf `3`
3. Update non-melee base ranges to `oldRange * 2 + 1`.
4. Leave melee base range at `0`.
5. Treat `Elemental`, `Skeleton`, and `Wolf` as melee for range update purposes because they have the `melee` attribute, even if their old range was nonzero.
6. Update stat clamping so `move` is at least `0`, with no upper cap unless an existing local convention requires one.
7. Update faction and troop-type stat modifier plumbing so future upgrades can modify `move`, even if no current upgrade does.

Acceptance:

- Catalog composition, enemy resolution, summon previews, stat breakdowns, and upgrade tests all include `move`.
- Unit details documentation matches the new base `move` and range values.

## Milestone 3 - Add Footprint Geometry Primitives

1. Extend `src/engine/hex.ts` with flat-top footprint helpers:
   - `FootprintOrientation = 'north' | 'south'`
   - `footprintForSize(anchor, size, orientation)` returning occupied hexes
   - `footprintCenter(occupiedHexes)` for renderer and targeting effects
   - `footprintsOverlap(left, right)`
   - `footprintDistance(left, right)` as minimum hex distance between any occupied hexes
   - `footprintsTouchOrOverlap(left, right)` for melee contact
   - `leftmostHex`, `rightmostHex`, and `closestHexToCenter`
   - a visual flat-top vertical-line helper used by placement constraints
2. Define shapes exactly:
   - Size 1: the anchor hex
   - Size 2: a 3-hex triangle, north-facing or south-facing only
   - Size 3: a 7-hex radius-1 hexagon
   - Size 4: the size-2 triangle plus one surrounding layer, 12 total hexes
   - Size 5: a 19-hex radius-2 hexagon
3. Do not implement left-facing, right-facing, or "forward-facing" triangles.
4. For symmetric hexagon sizes, ignore orientation while preserving the field for replay consistency.

Acceptance:

- Unit tests prove each size returns the exact expected hex count.
- Size 2 and size 4 tests cover both north and south orientations.
- Footprint overlap, distance, center, and visual vertical-line helpers are deterministic.

## Milestone 4 - Change Battle Unit State And Replay Snapshots

1. Add `occupiedHexes: HexCoord[]` and `footprintOrientation: FootprintOrientation` to internal battle units and public `BattleUnit` snapshots.
2. Keep `position` as the unit anchor/representative coordinate for compatibility, but stop using it directly for collision, range, same-hex effects, or engagement.
3. Recompute `occupiedHexes` whenever a unit is placed, moved, displaced, summoned, changed sides, or restored in a snapshot.
4. Add `mapHexes: HexCoord[]` to `BattleReplay`.
5. Keep `mapRadius` only as legacy/debug metadata until all radius-only call sites are replaced.
6. Update `cloneSnapshot`, replay serialization, battle report construction, replay explanations, and UI tooltip unit lookup to preserve the new fields.

Acceptance:

- Existing replay consumers still receive `position`.
- New replay snapshots contain authoritative occupied hexes.
- Snapshot cloning is deep enough that later movement cannot mutate earlier replay steps.

## Milestone 5 - Replace Radius/Saturation Board Legality With Explicit Map Hexes

1. Introduce an internal `mapHexes: Set<string>` on battle state.
2. Replace `inRadius(coord, state.mapRadius)` movement legality with `mapHexes.has(hexKey(coord))`.
3. Replace normal allied saturation checks with collision checks against all living unit footprints.
4. A legal footprint placement must satisfy:
   - every occupied hex is in `mapHexes`
   - no occupied hex overlaps any living unit other than the moving unit itself
5. Keep capacity as an engagement stat: it still counts enemy `size`, not occupied hex count.
6. Remove saturation from normal placement/movement decisions, but leave `input.saturation` and replay `saturation` intact for backward payload shape and any remaining debug UI.
7. Convert Whimsy, Quakes, Fade Into Shadow, Skirmisher Step, Diggy Hole, and summons to use footprint legality.

Acceptance:

- No normal movement or spawn path can overlap living unit footprints.
- `scurry` no longer creates invalid physical overlap.
- Existing effects that move units still produce legal footprints or do nothing.

## Milestone 6 - Implement Deterministic Side Placement

1. Expand combatants into individual units exactly as today, excluding delayed Diggy Hole units.
2. For each side, split units into ranged and melee using `stats.range > 0` for ranged and `stats.range === 0` for melee.
3. Place the left side first.
4. Ranged placement:
   - Pick a random ranged unit as the first ranged unit.
   - Place it at a deterministic seed-side anchor near the left deployment area, choosing north/south orientation by RNG when both are legal.
   - Add candidate empty hexes touching every occupied footprint hex.
   - Place each remaining random ranged unit so every footprint hex is at least 1 hex from all existing friendly occupied hexes, and at least one footprint hex shares the visual vertical line of the first ranged unit's leftmost hex.
5. Melee placement:
   - Identify the friendly ranged unit closest to center; use its rightmost hex.
   - Place a random first melee unit so its leftmost hex is 5 hexes from that ranged reference hex.
   - Place remaining random melee units so every footprint hex is at least 1 hex from melee footprints, at least 3 hexes from ranged footprints, and at least one footprint hex shares the visual vertical line of the first melee unit's leftmost hex.
6. Repeat the same process for the enemy side mirrored left-to-right.
7. Mirroring changes coordinates and left/right reference choice; it does not change triangle orientation into side-facing shapes.
8. If a side has no ranged units, use the side's closest-to-center already placed unit as the melee reference; if the side has no units in a category, skip that category.
9. If a candidate anchor fits only one triangle orientation, use that orientation; if both fit, choose by battle RNG; if neither fits, continue searching.

Acceptance:

- Placement tests cover ranged-only, melee-only, mixed armies, and asymmetric unit sizes.
- Enemy placement is a coordinate mirror of the same rules.
- No unit overlaps another unit at battle start.

## Milestone 7 - Generate And Fill The Explicit Battlefield

1. After both sides are placed in provisional coordinates, measure closest footprint distance between opposing sides.
2. Insert empty columns/coordinates between sides until closest opposing footprint distance is exactly 7.
3. Build the final playable `mapHexes` by filling all rows/columns that already exist in the provisional board bounds.
4. Do not add new rows or columns beyond those bounds during fill.
5. Translate already placed unit coordinates through the same gap-insertion transform.
6. Persist final `mapHexes` into the replay.
7. Replace auto-expanding map radius spawn retry loops with deterministic candidate expansion inside the explicit map generation process.

Acceptance:

- Tests prove closest opposing footprint distance is exactly 7 after finalization.
- Tests prove filled board contains all row/column intersections inside established bounds and no out-of-bounds rows/columns.
- Battle initialization cannot infinite-loop; impossible placements fail with a clear engine error.

## Milestone 8 - Make Targeting, Range, And Same-Hex Effects Footprint-Aware

1. Replace direct `hexDistance(actor.position, target.position)` with footprint distance for:
   - ranged attacks
   - closest target selection
   - backline retreat scoring
   - careful advance scoring
   - ability radius checks
   - Mercy Before Dawn
   - Living Circuit
   - Long Shot/Silver Distance bonuses
2. Replace direct same-position checks with footprint intersection or contact helpers as appropriate:
   - "on this hex" ally/enemy effects use footprint overlap on the relevant effect hex
   - melee engagement uses touch-or-overlap contact
   - corpse effects use the corpse hex and footprint distance from that hex
3. For attacks and effects that need a single visual target hex, use the closest pair of footprint hexes or the target footprint center.
4. Store corpses at the killed unit's anchor hex unless the killing/effect context has a more specific target hex.
5. Update blast chains and AoE targeting to operate over map hexes, then include units whose footprints occupy or are within radius of affected hexes.

Acceptance:

- Ranged units can attack if any part of the enemy footprint is within range.
- Melee units engage when footprints touch or overlap, not only when anchors match.
- Existing ability tests are updated to assert equivalent footprint-aware behavior.

## Milestone 9 - Update Existing Role Movement For Footprint Legality

1. Keep ordinary role movement to one legal adjacent anchor step.
2. Generate movement candidates by shifting the unit anchor to adjacent hexes, recomputing its footprint, and filtering with map/collision legality.
3. Do not allow ordinary movement to overlap enemies as a way to engage; instead, units move into contact range and then engage if contact exists.
4. Update Frontline objective selection, Pusher objective selection, Backline retreat, Backline advance, draw-attention behavior, and route metadata to use footprint distance and legal footprint movement.
5. Keep replay metadata fields stable where possible; add `occupiedHexes` and footprint-aware target metadata only where needed.

Acceptance:

- Existing role behavior tests pass after expectation updates.
- Units no longer stack on a shared hex to fight.
- One-step movement remains the default non-special movement rule.

## Milestone 10 - Implement Frontline Push-Through And Reposition

1. At the start of Frontline role behavior, after stale engagement cleanup and before default attack-only handling, check whether the unit is engaged and under capacity.
2. Search reachable anchor destinations up to `actor.resolvedStats.move` steps away.
3. Candidate destinations may:
   - move only the Frontline unit, or
   - push one or more currently engaged smaller enemy units out of the way.
4. A push is legal only if:
   - every pushed enemy has `enemy.size < actor.size`
   - every pushed enemy lands on a legal non-overlapping footprint
   - the actor remains in melee contact with every unit it was engaged with before the move
   - the actor's own final footprint is legal
   - all displacement is within the actor's `Move` budget
5. Score legal candidates by:
   - most total engaged enemy size after the move, capped by capacity
   - most newly engaged enemies
   - shortest movement path
   - deterministic RNG tie-break
6. Apply the best candidate if it improves engaged enemy size or newly engaged enemy count.
7. Emit replay metadata with reason code `frontline-push-through` or `frontline-reposition-capacity`.
8. If no improving candidate exists, fall back to attacking an already engaged target as today.

Acceptance:

- Tests cover successful displacement, non-displacing reposition, blocked push due to occupied destination, blocked push against equal/larger enemy, and blocked push that would break existing engagement.
- Frontline units never exceed capacity after the new engage step.

## Milestone 11 - Implement Pusher Breakthrough

1. Before the generic engaged-unit attack behavior, check whether the acting Pusher is engaged with at least one smaller enemy.
2. A breakthrough target is valid only if:
   - target size is smaller than the Pusher size
   - at least one other allied unit is also engaged with that target
3. If a valid target exists, remove only the engagement between the Pusher and that target.
4. If the Pusher still has other engagements, attack one of those remaining engaged enemies.
5. If the Pusher has no remaining engagements, continue into normal Pusher objective behavior and pursue enemy Backline.
6. Emit replay metadata with reason code `pusher-breakthrough`.

Acceptance:

- Tests cover breakthrough when another ally holds the smaller enemy.
- Tests prove breakthrough does not occur when the Pusher is the only engager.
- Tests prove breakthrough does not occur against same-size or larger enemies.

## Milestone 12 - Update Summons, Delayed Spawns, Side Changes, And Death Hooks

1. Summons choose legal full-footprint placements starting from the origin hex, then neighboring map hexes.
2. Bonded summons inherit side, footprint size, and orientation resolution from their summoned troop stats.
3. Diggy Hole delayed spawns use the enemy-side mirrored placement process with legal footprints and explicit map hexes.
4. Changeling side changes preserve footprint and orientation, then clear invalid engagements and backline commitments.
5. Death removes the full footprint from occupancy and clears all engagements.
6. Sentinel Runes, corpse summon, Loot Frenzy, Thrill of the Hunt, Hold the Standard, Pack, Dogpile, and Roll the Boulder all use footprint-aware same-area helper calls.

Acceptance:

- Summon-heavy tests do not create overlaps.
- Death and side-change tests leave no stale engagement or occupied-hex state.

## Milestone 13 - Update Pixi Replay Rendering

1. Change `BattleRenderer` board drawing to use `replay.mapHexes`.
2. Reduce `HEX_SIZE` so expanded battlefields fit within the same replay panel footprint.
3. Keep unit icon pixel size close to the current visual size.
4. Draw each unit's footprint as a subtle filled/tinted set of cells below the icon.
5. Position the icon, outline, target marker, hover target, attack projectile endpoints, melee effects, summon effects, and buff indicators at the footprint center.
6. Remove or bypass old same-hex density layout for normal units; use it only as a defensive fallback for legacy replay snapshots without `occupiedHexes`.
7. Keep DOM replay controls and Svelte UI as replay consumers only.

Acceptance:

- A replay with many size-2 units remains readable at desktop and mobile widths.
- Hover/click targets align with visible icons.
- Projectile and melee effects originate and land near footprint centers.

## Milestone 14 - Update UI Text, Debug Tools, And Reports

1. Update `StatBreakdownGrid`, `UnitTooltip`, detail cards, debug battle setup, ability verification lab, replay explanations, battle recap, and event log text for `Move` and `Pusher`.
2. Update any role labels, role descriptions, filters, scenario names, and test fixtures that mention `Chaff`.
3. Update report diagnostics or payload validators if they assume radius-only maps or no occupied-hex snapshots.
4. Update tutorial text only where it directly names the old role or old stacking model.

Acceptance:

- UI no longer displays `Chaff`.
- Tooltips show `Move`.
- Reports include enough map/footprint data to reproduce replay rendering issues.

## Milestone 15 - Update Documentation

1. Update `TECHNICAL.md`:
   - battle replay now includes explicit `mapHexes`
   - engine owns footprint placement and movement rules
   - renderer consumes map/footprint replay data
   - `Move` scope is currently push-through/breakthrough only
2. Update `design documents/Battle details.md`:
   - multi-hex footprints
   - north/south triangle rule
   - deterministic placement
   - 7-hex opposing gap
   - no normal stacking/saturation occupancy
   - footprint-aware engagement and targeting
   - Frontline push-through
   - Pusher breakthrough
3. Update `design documents/Unit details.md`:
   - `Move` stat meaning
   - Pusher role description
   - base unit move/range changes
   - new size footprint meanings
4. Update any other markdown file that contradicts the new model.

Acceptance:

- No design document still describes Chaff as an active role.
- No design document still describes normal battle occupancy as many units sharing one hex by saturation.
- Triangle footprints are documented as north/south only.

## Milestone 16 - Test And Verification Pass

1. Add or update engine tests for:
   - footprint shapes and orientation
   - explicit map fill
   - deterministic placement
   - exact 7-hex opposing gap
   - movement legality
   - engagement/contact
   - range/AoE footprint behavior
   - Frontline push-through
   - Pusher breakthrough
   - summons and delayed spawns
2. Update UI/rendering tests for replay explanations, battle recap, timeline effects, and tooltip stat display.
3. Run `npm.cmd run test`.
4. Run `npm.cmd run build`.
5. Start the dev server with `npm.cmd run dev`.
6. Open a representative replay in the in-app browser and inspect:
   - desktop viewport
   - mobile/narrow viewport
   - many-unit battle
   - mixed size 1/2/3+ battle
   - summon-heavy battle
7. Confirm the board is nonblank, fitted, readable, and interactive, with no incoherent overlap.

Acceptance:

- Tests and production build pass.
- Manual replay inspection confirms the larger map does not consume more replay panel space than the current implementation.
- Unit icons remain roughly comparable to current visual size.

## Milestone 17 - Cleanup And Compatibility Review

1. Remove dead saturation-only helpers that are no longer used by battle placement or movement.
2. Keep compatibility shims only where old replay/debug payloads need them.
3. Search the repo for stale terms and assumptions:
   - `chaff`
   - `saturation`
   - `mapRadius`
   - `same hex`
   - `position`
4. For each remaining hit, either update it or leave a deliberate compatibility comment.
5. Re-run `npm.cmd run test` after cleanup.

Acceptance:

- Remaining legacy terms are intentional and documented.
- No renderer or UI file owns gameplay placement, targeting, movement, or engagement decisions.
- The implementation still respects the architecture rule that `src/engine/` is pure TypeScript with no DOM/Pixi dependencies.
