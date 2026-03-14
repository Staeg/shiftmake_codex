# TECHNICAL.md

Technical implementation reference for Shiftmake. Read alongside the design docs in `design documents/` and `AGENTS.md`.

---

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript |
| Build | Vite |
| UI framework | Svelte |
| Battle renderer | PixiJS |
| Testing | Vitest |
| Save state | localStorage + serialized replay payloads |
| Android (stretch) | Capacitor |
| Multiplayer server (stretch) | Node.js + `ws` |

---

## Core Rule

**All game logic lives in `src/engine/` with no rendering or DOM dependencies.**

The UI and Pixi layers consume engine outputs. They do not decide battle outcomes, mutate combat logic, or maintain parallel gameplay state.

This keeps the project testable, deterministic, and portable to a future server-authoritative or mobile setup.

---

## Project Shape

```text
src/
  engine/
    types.ts        # Shared game/battle/catalog data contracts
    unitCatalog.ts  # Factions, unit types, abilities, upgrades, mutators
    army.ts         # Troop instance resolution and upgrade application
    battle.ts       # Deterministic battle simulator + replay generation
    game.ts         # Campaign loop / cycle resolution
    rift.ts         # Rift generation and reward setup
    save.ts         # Save/load validation and serialization

  store/
    gameStore.ts    # Svelte-facing campaign state and actions
    debugBattleStore.ts
    saveSlots.ts

  ui/
    App.svelte
    UnitTooltip.svelte
    EventLog.svelte

  rendering/
    BattleRenderer.ts
```

---

## Data Model

### Unit identity

Every resolved combatant now has:

- `type`: one primary troop identity such as `soldier`, `archer`, or `shaman`
- `attributes`: secondary tags such as `melee`, `caster`, `ranged`, faction tags, and special traits

This split matters in code:

- target filters such as `Only`, `Not`, and `Prio` match against the combined visible tag set of `type + attributes`
- Combined Arms counts distinct friendly primary `type` values only
- faction composition adds attributes, not extra primary types

### Catalog composition

The catalog layer is declarative:

- `UnitTypeDefinition` provides primary `type`, base `attributes`, stats, quantity, cost, and ability ids
- `FactionDefinition` provides stat adjustments, default roster, added faction attributes, and faction-wide ability ids
- `FactionUpgradeDefinition` can inject abilities, attributes, or stat modifiers
- `composeBaseTroopDefinition()` in `src/engine/unitCatalog.ts` builds the base troop
- `resolveTroopCombatant()` in `src/engine/army.ts` applies troop upgrade levels, faction upgrades, and enemy tier scaling

### Ability model

Abilities are fully data-driven and split into four axes:

- `trigger`: when the ability is allowed to fire
- `duration`: how long its effects last
- `target`: how recipients are selected
- `effects`: what actually happens

Current timing support:

- `startOfBattle`
- `startOfTurn`
- `endOfTurn`
- `onAttack`
- `onKill`
- `onDeath`
- `onDamaged`
- `onFallen`
- `passive` for non-battle or non-triggered catalog presence

Current duration support:

- `instant`
- `battle`
- `turns`

Current trigger modifiers include:

- `chargeEvery`
- `maxUses`
- `condition: 'forsaken'`
- `repeatPerDistinctFriendlyTroopType`
- `repeatPerOtherFriendlyUnitOnHex`
- `fallen` trigger geometry

Current target filters include:

- `notTypes`
- `onlyTypes`
- `prioritizeTypes`
- `unengaged`

Current effect kinds include:

- `blast`
- `bolster`
- `haste`
- `heal`
- `ramp`
- `rangeset`
- `roleset`
- `strike`
- `redirect`

`redirect` is the engagement effect used by Taunt-style abilities. It routes through normal targeting instead of bespoke taunt-only logic.

---

## Battle Runtime

### Public contract

Battle entrypoint:

```ts
resolveBattle(input: BattleInput): BattleReplay
```

The battle engine is deterministic for a fixed seed and input. The replay contains:

- initial snapshot
- ordered `BattleStep[]`
- final outcome
- troop profiles used for tooltip/UI display
- alive-count summaries over time

The renderer is a replay consumer only.

### Internal execution model

`battle.ts` uses a mutable internal working state during simulation, but that state is local to the battle resolver. No live engine state is shared with the UI.

The turn loop is:

1. Apply per-beat initiative gain
2. Select ready units
3. For each acting unit:
   - fire `startOfTurn` abilities
   - execute tactical behavior from its role/engagement state
   - fire `endOfTurn` abilities
   - expire temporary timed effects on that unit

### Temporary effects

Timed abilities are implemented through per-unit active effect instances.

Each temporary runtime entry stores:

- source ability id
- source unit id
- remaining own-turn expirations
- enough applied state to roll the effect back cleanly

The current reversible timed-effect system supports:

- `bolster`
- `haste`
- `ramp`
- `rangeset`
- `roleset`

This is what allows effects like Pack to exist as normal authored abilities instead of special-case damage math.

### Engagements

Engagement capacity and size are enforced at runtime:

- a unit's `capacity` limits how much enemy `size` it can engage
- a unit's `size` determines how much capacity it consumes when targeted
- engagements are tracked symmetrically on both units

`redirect` does not steal existing engagements. It only creates a new engagement when the target is valid and the actor still has spare capacity.

---

## Replay/UI Boundary

The replay snapshot and troop profile data intentionally duplicate resolved battle-facing information so the UI does not need to recompute gameplay state.

That includes:

- `type`
- `attributes`
- role
- resolved stats
- abilities

Tooltips and overlays should read from replay/profile data, not from catalog assumptions.

---

## Save System

Campaign state is serialized as plain JSON. Replay payloads are also stored as serializable data, keyed separately from the main campaign save.

Rules:

- no classes in persistent state
- no functions or non-JSON values
- replay payloads must be reconstructible from saved battle input

The save/load boundary lives in `src/engine/save.ts`.

---

## Testing Strategy

`npm run test` covers the engine and store layers. The most important battle tests currently verify:

- deterministic battle resolution
- faction/unit composition
- ability definition resolution
- charge and max-use behavior
- forsaken gating
- Combined Arms repeat logic
- temporary Pack-style turn buffs and expiry
- type/attribute-based targeting

When adding new ability modifiers or effect kinds, add tests in `src/engine/battle.test.ts` before wiring the UI.

---

## Coding Conventions

- Keep catalog data declarative in `unitCatalog.ts`
- Prefer standalone pure-ish functions over classes or inheritance
- Keep the renderer passive; it should never infer outcomes
- Use replay steps as the source of truth for battle presentation
- When extending ability behavior, prefer adding typed fields and generic runtime helpers before adding one-off branches

---

## Build Commands

```bash
npm install
npm run dev
npm run build
npm run test
npm run preview
```
