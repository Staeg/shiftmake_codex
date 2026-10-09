# Targeted Audit Follow-Ups

Milestone 10, 2026-10-09. These independent gates do not require speculative
renderer caches, asset removal, ID branding or arithmetic replacement.

## Renderer

The `getUnitById` helper in `BattleRenderer.ts` scans only when step effects need
actors/targets (attack, death, move). It is not called in each animation frame.
Sprites, profiles and layout already have keyed maps or a snapshot-keyed WeakMap.
The other effect branches do not repeatedly resolve BattleUnit IDs.

```powershell
node node_modules/vite-node/vite-node.mjs scripts/rendererLookupBaseline.ts
```

The script models the exact sequential ID-query branches from `playStepEffect`,
including previous/next fallbacks, and verifies equal results before measurement.
It does NOT instantiate Pixi or measure GPU, layout, DOM or animation frame cost.
Seven samples each traverse 100 times, excluding battle resolution; the table
shows median milliseconds per whole replay. Cold maps are lazily constructed per
snapshot during each traversal; warm maps are already populated and reused.
Node v24.14.0, the five M0 fixtures plus M9's 24-unit army:

| Fixture | Steps | Lookup calls | Scan comparisons | Scan ms | Cold map ms | Warm map ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| ordinary | 140 | 45 | 66 | 0.0095 | 0.0128 | 0.0073 |
| summons | 168 | 69 | 172 | 0.0072 | 0.0283 | 0.0080 |
| death-prevention | 82 | 23 | 33 | 0.0016 | 0.0063 | 0.0032 |
| timed-effects | 142 | 45 | 66 | 0.0045 | 0.0098 | 0.0049 |
| long | 1189 | 376 | 563 | 0.0414 | 0.0900 | 0.0505 |
| army | 739 | 932 | 12,391 | 0.1278 | 1.0754 | 0.1192 |

Decision: retain scans. Map construction costs more for these query volumes;
warm reuse has no meaningful absolute benefit. This is a bounded query model,
not a general proof that maps never help larger armies or bulk queries. Revisit
only if renderer profiling finds actual ID lookup cost affecting frames.

`BattleRenderer`'s hex size 30, sprite pixel size 32 and mini-replay hex size 18
have different presentation semantics. They should not become one shared layout
constant. Playback timing constants already live in `battlePresentationTimeline`.
No renderer or layout behavior changed in this milestone, so no new visual
acceptance is claimed beyond M9's desktop replay checks.

## Assets

Inventory: `assets/Deprecated` contains four race PNGs (elf, goblin, human, troll).
`assets/unit sprites old` contains 17 named class/summon PNGs, all byte-different
from the corresponding current files by SHA-256. These are historical source
material, not duplicate generated captures. No runtime import references either
directory; both are preserved in place. No art creation or cleanup is authorized
by this gate alone.

Current consumers:

- `rendering/unitVisualAssets.ts` imports the 17 current unit PNGs and seven race
  placeholder SVGs. `ui/riftVisuals.ts` imports the four current Rift JPEGs.
- `presentation/iconAssets.ts` eagerly imports final PNG/SVG icons. Its renamed
  upgrade aliases bridge current IDs to existing older-named art; they remain.
- Icon generation reads/writes manifests, prompts and final assets under
  `assets/icons`. It does not consume the historical sprite directories.
- `BattleRenderer` separately imports the runtime projectile SVG from `src/assets`.

The 15 upgrade alias entries are still meaningful compatibility bridges, not
automatically dead because their old gameplay IDs changed. No replacements were
generated. Three tests explicitly preserve Storm Rods, Rat Behavior and Dine in
Hell SVG bridges; existing tests retain ability fallback and every-upgrade icon
coverage. No assets were moved, deleted, regenerated or untracked in this milestone.

## ID Boundaries

`TroopId` and `TroopUnlockId` are currently string aliases. `getTroopUnlockId`
returns `race/class`; `createTroopInstance` intentionally uses that same value as
its instance ID. Roster grant checks prevent a second instance of a combination.
Assignments/recovery refer to the roster ID, whereas offers/native/unorthodox
unlocks refer to the catalog combination. This is overlapping representation
under the current one-troop-per-combination model, not evidence of a wrong-ID bug.

Combatants have a separate `combatantId`; `troopInstanceId` is the nullable link
back to a roster entry. Debug/catalog combatants intentionally have null links.
Battle units have individual `id` values and retain combatant/instance identity.
Do not equate those identifiers just because some values are strings.

Save normalization preserves supplied troop IDs or constructs a race/class
fallback; known unlocks are checked against `ALL_TROOP_UNLOCK_IDS`. Input/report/
network serialization still uses strings. Branding would need explicit factories,
validated deserialization and catalog signatures, plus deliberate conversions
where instance and unlock identities overlap. There is no demonstrated confusion
requiring that migration now. Decision: keep current types and wire data. Revisit
when multiple instances or a concrete incorrect-ID boundary is introduced.

## Numbers And Acceptance

`fixed.ts` is documented as two-decimal quantization of JavaScript numbers, not
integer fixed-point arithmetic. Only comments/docs and four tests changed.
Tests lock epsilon adjustment, asymmetric negative ties, arithmetic rounding,
per-addition sum quantization, unrounded clamp bounds and display formatting.
The expression, exported API and every call site remain unchanged. No renaming,
integer conversion, RNG replacement or save migration is justified.

Full suite passed 528 tests in 67 files (25.04s), including unchanged complete
replay goldens. Focused numeric/icon run passed 10 tests. New/changed script and
tests have no filtered TypeScript diagnostics; repository-wide existing errors
remain. Production build passed (12.53s), existing chunk warning only. No live multiplayer
or mobile work, and no renderer speedup claim.
