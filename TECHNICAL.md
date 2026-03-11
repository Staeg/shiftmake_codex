# TECHNICAL.md

Technical implementation reference for Shiftmake. Read alongside the design docs in `design documents/` and `CLAUDE.md` (project guidance).

---

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript |
| Build | Vite |
| UI framework | Svelte |
| Battle renderer | PixiJS |
| Pixel art authoring | Aseprite |
| Testing | Vitest |
| Save state | localStorage (serialized game state) |
| Android (stretch) | Capacitor |
| Multiplayer server (stretch) | Node.js + `ws` |

---

## Foundational Architecture Principle

**The game engine must have zero dependencies on rendering or the DOM.**

All game logic lives in `src/engine/` as pure TypeScript. It takes game state and inputs, returns new game state and event logs. No PixiJS, no Svelte, no `document` anywhere in this layer. This enables:

- Unit testing all game logic with Vitest, no browser required
- Running the same engine on a Node.js multiplayer server
- Completely replacing the renderer without touching game logic

---

## Directory Structure

```
src/
  engine/           # Pure TypeScript. Zero rendering deps.
    types.ts        # All shared data types/interfaces
    battle.ts       # Battle resolution — takes two armies, returns BattleLog
    army.ts         # Faction/troop/unit state and mutations
    rift.ts         # Rift generation and reward logic
    upgrades.ts     # Upgrade tree definitions and application
    save.ts         # serializeGameState / deserializeGameState

  ui/               # Svelte components
    App.svelte
    screens/        # Full-screen views (strategic map, upgrade screen, etc.)
    components/     # Reusable UI elements

  rendering/        # PixiJS battle viewer
    BattleRenderer.ts   # Owns the PixiJS Application instance
    animations/         # Per-unit-type sprite animation logic

  store.ts          # Single Svelte store wrapping GameState
  main.ts           # Entry point
```

---

## Data Flow

```
User input (Svelte UI)
  → calls engine function (e.g. engine/rift.ts)
  → returns new GameState + optional BattleLog
  → store.ts updates the Svelte store
  → Svelte UI re-renders reactively
  → if BattleLog present, rendering/ plays it back via PixiJS
```

Game state is a single serializable plain object (`GameState`). Mutations never happen in place — engine functions return new state. This makes save/load and future undo/replay straightforward.

---

## Key Type Definitions (starting point for `engine/types.ts`)

```typescript
type UnitTypeId = string;   // e.g. "archer", "berserker"
type FactionId = string;    // e.g. "elves", "trolls"

interface UnitType {
  id: UnitTypeId;
  baseStats: UnitStats;
}

interface Faction {
  id: FactionId;
  defaultUnitTypes: UnitTypeId[];
}

interface Troop {
  factionId: FactionId;
  unitTypeId: UnitTypeId;
  count: number;
  upgrades: UpgradeId[];
}

interface Army {
  troops: Troop[];
}

interface Rift {
  id: string;
  reward: Reward;
  enemyArmy: Army;
}

interface BattleLogEvent {
  type: string;    // "attack", "defeat", etc.
  // event-specific payload
}

interface BattleLog {
  events: BattleLogEvent[];
  outcome: "victory" | "defeat";
}

interface GameState {
  playerArmy: Army;
  resources: Record<string, number>;
  openRifts: Rift[];
  recoveryTimers: Record<string, number>;  // troopId → turns remaining
  unlockedFactions: FactionId[];
}
```

---

## Battle System

Battle resolution is a pure function:

```typescript
function resolveBattle(playerTroop: Troop, enemyArmy: Army): BattleLog
```

It produces a complete ordered log of events — every attack, counter, defeat — that fully describes what happened. The renderer plays this log back as animation; it never computes battle outcomes itself.

**Determinism is required.** Given the same inputs, `resolveBattle` must always produce the same log. If randomness is used, seed the RNG and include the seed in the log so replays are reproducible.

---

## Battle Screen & Information Layer

The battle screen layers two systems:

```
<div style="position: relative; width: 100%; height: 100%">
  <canvas />                    <!-- PixiJS: sprites, animations -->
  <div id="overlay" />          <!-- Svelte: tooltips, stat panels, combat log -->
</div>
```

PixiJS handles all animated/sprite content. Svelte handles all informational content (unit stat tooltips, ability descriptions, combat log, etc.).

**Hover interaction pattern:**
1. PixiJS sprite sets `eventMode = 'static'`, fires `pointerover` with canvas coordinates
2. Store updates with `hoveredEntity` and screen-space position
3. Svelte tooltip component reactively appears at that position

No game-logic decisions are made on the battle screen — it is a viewer only. Richness of information display is encouraged; interactivity is limited to panning/zooming the view and hovering for info.

---

## Save System

State is saved to `localStorage` as JSON. The save boundary is explicit:

```typescript
// engine/save.ts
export function serialize(state: GameState): string
export function deserialize(json: string): GameState
```

All game state must be expressible as plain JSON — no class instances, no circular references, no non-serializable values anywhere in `GameState`. Enforce this at the type level (no methods on state objects).

Auto-save after every player decision. Keep a small circular buffer of recent saves for basic undo support.

---

## Build & Development Commands

```bash
npm install
npm run dev       # Vite dev server with hot reload
npm run build     # Production build
npm run test      # Vitest (engine logic only, no browser required)
npm run preview   # Preview production build locally
```

---

## Coding Conventions

- Engine functions are pure: `(state, input) => newState`. No mutation.
- IDs are `string` type aliases (`FactionId`, `UnitTypeId`) for self-documenting code.
- `BattleLog` is the only communication channel between engine and renderer — never pass live game state into PixiJS code.
- Svelte stores hold `GameState`. Components read from the store; they never hold game state locally.
- No class hierarchies in game data. Prefer interfaces + standalone functions over OOP inheritance. Composition via interfaces.

---

## Stretch Goal Notes

**Android (Capacitor):** The Vite web build wraps directly. No code changes required if `GameState` serialization is clean and no desktop-only browser APIs are used.

**Multiplayer:** The server imports `src/engine/` directly (same TypeScript, compiled for Node.js). It is the authority on battle outcomes. Clients send troop selections; server returns `BattleLog`. The clean engine boundary makes this straightforward to add later without refactoring.

