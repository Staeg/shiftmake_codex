# Phase 2: Intuitive Battlefield Roles - Research

**Researched:** 2026-04-02
**Domain:** Pure engine battle-role heuristics, deterministic replay readability, and validation strategy
**Confidence:** MEDIUM-HIGH

## User Constraints

No phase-specific `CONTEXT.md` exists for Phase 2, so there are no additional locked user decisions beyond the roadmap, requirements, and project docs already loaded.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ROLE-01 | Frontline units prioritize occupying enemy attention and blocking access paths so enemy units are less able to reach allied backline units | Role-specific movement scoring, same-hex engagement priority, and seed-sweep backline-breach metrics |
| ROLE-02 | Frontline units fall back to engaging reachable enemy backline targets when no enemy frontline space is available, instead of wasting turns | Explicit fallback target selection after frontline/chaff exhaustion |
| ROLE-03 | Chaff units attempt to overrun enemy frontline positioning and spill into any reachable targets, prioritizing enemy backline units when possible | Overrun-oriented move scoring and backline-first spill behavior |
| ROLE-04 | Chaff units remain committed to enemy backline positions once they reach them unless combat state forces a different legal move | Transient runtime commitment state plus replay-visible commitment behavior |
| ROLE-05 | Backline units prefer to stay at range and continue preserving distance from enemy threats whenever battlefield geometry allows | Threat-aware retreat and distance-preserving ranged positioning |
| ROLE-06 | Replays make the resulting frontline, chaff, and backline behavior readable enough that the role intent feels intuitive to the player | Reason-rich replay steps/metadata, readable messages, and read-only UI consumption of replay output |

## Project Constraints (from CLAUDE.md)

- Use the existing stack: TypeScript + Vite + Svelte + PixiJS.
- Read `TECHNICAL.md` before implementation work.
- Keep all gameplay logic in `src/engine/` with zero rendering or DOM dependencies.
- Svelte components and Pixi rendering must consume resolved engine data only; they must not decide battle outcomes or maintain a second gameplay state.
- Preserve the browser-first singleplayer scope.
- Respect current `localStorage` persistence limits unless storage work is explicitly brought into scope.
- Start file-changing implementation work through the GSD workflow rather than direct ad-hoc edits.

## Summary

Phase 2 is mostly an engine-behavior phase, not a renderer phase. The existing role system in [`src/engine/battle.ts`](C:/Users/staeg/shiftmake%20-%20Codex/src/engine/battle.ts) already branches by `frontline`, `chaff`, and `backline`, but the decisive helpers are still mostly generic: `findClosestEnemy()` is nearest-distance only, `moveToward()` minimizes target distance while avoiding extra unengaged enemies, and `retreat()` picks a random safe adjacent hex. That is enough for deterministic combat, but it is not strong enough to reliably express "hold the line", "overrun into backline", or "keep distance when geometry allows."

The implementation surface is concentrated and favorable for planning. The battle runtime already has reusable helpers for engagement creation, movement legality, role filters, replay step emission, and transient per-unit state. The replay model already records full snapshots and step messages, and the simulation harness already computes `firstBacklineThreatBeat` and `backlineBreachRate`. That means the phase should plan around improving the role-decision heuristics, extending replay reason signals, and adding scenario tests plus seed-sweep validation instead of introducing new systems.

The one likely new concept is transient intent memory. ROLE-04 is hard to satisfy purely from local board geometry because "stay committed to enemy backline once reached" implies some memory of what the unit is trying to do. That state should stay inside the battle runtime and be reflected through replay output, not pushed into UI state.

**Primary recommendation:** Plan this phase as a refactor of battle decision scoring plus replay explanation, with acceptance tests built around fixed tactical scenarios and simulation-harness breach metrics.

## Standard Stack

### Core
| Library / Module | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | `^5.5.4` declared | Engine/runtime implementation | Existing strict typing already models combat and replay contracts |
| Vitest | installed `2.1.9`, declared `^2.0.5` | Engine and store validation | Existing test runner already covers battle determinism and engine behavior |
| `src/engine/battle.ts` | repo module | Authoritative role behavior and replay step emission | All battle rules already live here; phase should extend this surface |
| `src/engine/types.ts` | repo module | Replay and battle contracts | New transient/runtime-visible concepts should be typed first |
| `src/engine/simulationHarness.ts` | repo module | Seed sweeps and replay-derived metrics | Already measures backline threat timing and breach rate |

### Supporting
| Library / Module | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Svelte UI helpers | Svelte `^4.2.19` declared | Read-only replay presentation | Only if replay readability needs message/metadata consumption changes |
| Pixi replay renderer | PixiJS `^7.4.2` declared | Visual replay playback | Only if engine-emitted replay signals need thin presentation support |
| `src/ui/inspectText.ts` | repo module | Player-facing role descriptions | Update if role semantics change enough to make current copy inaccurate |
| `src/ui/battleRecap.ts` | repo module | Replay recap summaries | Extend only if recap must surface role-behavior outcomes |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Reworking `src/engine/battle.ts` heuristics | UI-side replay interpretation layer | Wrong layer; would duplicate logic and violate engine authority |
| Replay-derived validation via `simulationHarness.ts` | Manual-only replay inspection | Too subjective for ROLE-01 through ROLE-05 |
| Transient runtime intent state | Hard-coded positional rules only | Simpler, but likely too weak for ROLE-04 commitment behavior |

**Installation:**
```bash
npm install
```

**Version verification:** Registry verification via `npm view` was not possible in this offline/sandboxed session. Versions above come from `package.json`, the installed Vitest runtime, and local environment inspection.

## Architecture Patterns

### Recommended Project Structure
```text
src/
├── engine/
│   ├── battle.ts              # Role decision helpers and replay step emission
│   ├── types.ts               # Battle/replay contracts
│   └── simulationHarness.ts   # Metrics and seed sweeps for tactical validation
├── ui/
│   ├── inspectText.ts         # Read-only role copy
│   ├── EventLog.svelte        # Replay log consumer
│   └── battleRecap.ts         # Replay recap consumer
└── rendering/
    └── BattleRenderer.ts      # Replay-only visuals
```

### Pattern 1: Centralize Role Decisions In Shared Scoring Helpers
**What:** Keep `executeTurnActions()` small and move role intent into composable helper functions that score candidate targets and moves differently for frontline, chaff, and backline.
**When to use:** For ROLE-01 through ROLE-05 changes.
**Example:**
```ts
// Source: src/engine/battle.ts
function executeTurnActions(state: InternalState, actor: InternalUnit): void {
  clearStaleEngagements(state);
  const engagedEnemies = [...actor.engagedWith]
    .map((enemyId) => state.units.get(enemyId))
    .filter((enemy): enemy is InternalUnit => Boolean(enemy?.alive));
  if (engagedEnemies.length > 0) {
    attack(state, actor, chooseAttackTarget(state, actor, engagedEnemies), 'melee');
    return;
  }

  if (actor.role === 'frontline') {
    if (nonEngagedEnemiesOnHex(state, actor).length > 0) {
      drawAttention(state, actor);
      return;
    }
    pursue(state, actor, ['frontline', 'chaff']);
    return;
  }
}
```

### Pattern 2: Keep Replay Authoritative
**What:** Any new explanation for role behavior should be emitted from battle resolution as step messages and/or typed metadata, then consumed by UI/rendering.
**When to use:** For ROLE-06 or any readability improvement.
**Example:**
```ts
// Source: src/engine/types.ts
export interface BattleStep {
  index: number;
  kind: BattleStepKind;
  actorIds: string[];
  targetIds: string[];
  message: string;
  snapshot: BattleStateSnapshot;
  metadata?: Record<string, number | string | boolean>;
}
```

### Pattern 3: Validate Tactical Intent With Replay-Derived Metrics
**What:** Use the existing simulation harness to quantify whether backline protection and breach timing improved across many seeds.
**When to use:** For regression protection and planner-defined success checks.
**Example:**
```ts
// Source: src/engine/simulationHarness.ts
return {
  outcome: replay.outcome,
  beatsToEnd,
  firstContactBeat,
  firstBacklineThreatBeat,
  backlineBreachRate: firstBacklineThreatBeat === null ? 0 : 1,
};
```

### Pattern 4: Prefer Typed Runtime State Over Ad-Hoc Branches
**What:** If ROLE-04 needs memory, add a typed internal runtime field for battle-only intent instead of hiding commitment in fragile positional heuristics.
**When to use:** When chaff must stay committed to a backline target/zone after the first breach.
**Example:** Add battle-only intent state on the internal unit/runtime structure, then include the result in replay messages or metadata rather than exposing a second source of truth in UI state.

### Anti-Patterns to Avoid
- **UI-owned combat reasoning:** Do not infer or "fix" role behavior in Svelte or Pixi.
- **One-off per-unit exceptions:** Keep behavior role-driven and data-oriented; avoid scattering bespoke branches by troop ID.
- **Unreadable replay changes:** Generic messages like "`moves.`" or "`engages enemies.`" are too weak if the phase depends on player readability.
- **Distance-only targeting for all roles:** This collapses distinct role identities into the same movement behavior.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tactical validation | Ad-hoc console logging or spreadsheet-only checks | `src/engine/simulationHarness.ts` seed sweeps | Already computes role-relevant replay metrics deterministically |
| Replay explanation | A UI-side interpretation engine | Battle-emitted `BattleStep.message` and `metadata` | Keeps replay authoritative and deterministic |
| Second combat state for readability | Renderer/store-side mirror state | Existing replay snapshots and step stream | Avoids divergence between simulation and presentation |
| Movement legality | New pathfinding subsystem | Existing neighbor-based legal move helpers and scoring | Current battles are one-hex-step tactical movement; scoring is the missing layer, not pathfinding |

**Key insight:** This phase should change decision quality, not architecture ownership. The existing engine/replay stack already has the right seams.

## Common Pitfalls

### Pitfall 1: Frontline And Chaff Still Share The Same Effective Pursuit Logic
**What goes wrong:** Frontline and chaff feel similar because both rely on nearest-target pursuit with minimal role-specific scoring.
**Why it happens:** `findClosestEnemy()` is distance-based, and `moveToward()` optimizes distance first.
**How to avoid:** Add role-specific scoring dimensions such as "blocks path to allied backline", "reaches backline hex", and "keeps current overrun lane."
**Warning signs:** Replays show frontline units bypassing intercept opportunities or chaff stalling behind contested front hexes.

### Pitfall 2: ROLE-04 Cannot Be Guaranteed Without Memory
**What goes wrong:** Chaff reaches backline once, then drifts away on later turns because the board state no longer makes the current heuristic obviously backline-oriented.
**Why it happens:** Current role behavior is stateless between turns except for engagements and board position.
**How to avoid:** Introduce typed transient commitment state or target-zone memory inside the battle runtime.
**Warning signs:** Same scenario produces initial breach followed by aimless re-targeting.

### Pitfall 3: Backline Retreat Is Too Random To Read As Intentional
**What goes wrong:** Backline units technically retreat, but not in ways players read as "preserving distance."
**Why it happens:** `retreat()` currently picks a random adjacent enemy-free hex.
**How to avoid:** Score retreat hexes by future threat distance, line preservation, and continued ranged attack opportunities.
**Warning signs:** Archers/wizards sidestep into equally dangerous positions or break spacing without benefit.

### Pitfall 4: Replay Readability Is Underspecified
**What goes wrong:** Behavior improves mechanically, but players still cannot tell why a unit moved or switched targets.
**Why it happens:** Existing log messages are generic, and current recap utilities focus on damage/healing/kills rather than intent.
**How to avoid:** Add explicit replay reasons for decisions that matter to player intuition.
**Warning signs:** Reviewers need to inspect raw coordinates to understand whether the role system is working.

### Pitfall 5: Role Copy Drifts From Real Behavior
**What goes wrong:** Tooltips say one thing while the engine does another.
**Why it happens:** `src/ui/inspectText.ts` hardcodes role descriptions and is currently less specific than the Phase 2 requirements.
**How to avoid:** Update role copy after the engine behavior contract is finalized.
**Warning signs:** QA feedback says the replay is right but the role labels are misleading.

## Code Examples

Verified patterns from project sources:

### Current Role Dispatcher
```ts
// Source: src/engine/battle.ts
if (actor.role === 'chaff') {
  if (nonEngagedEnemiesOnHex(state, actor).length === 0) {
    pursue(state, actor, ['backline']);
    return;
  }
  pileOn(state, actor);
  return;
}
```

### Existing Generic Pursuit Logic
```ts
// Source: src/engine/battle.ts
function pursue(state: InternalState, actor: InternalUnit, preferredRoles: RoleId[]): boolean {
  if (enemyUnitsOnHex(state, actor).some((enemy) => matchesRoleFilter(enemy, preferredRoles))) {
    return drawAttention(state, actor, preferredRoles);
  }
  const target = findClosestEnemy(state, actor, preferredRoles, false) ?? findClosestEnemy(state, actor, [], false);
  if (!target) {
    return false;
  }
  const moved = moveToward(state, actor, target);
  const enemiesOnCell = enemyUnitsOnHex(state, actor);
  if (enemiesOnCell.length === 0) {
    return moved;
  }
  if (enemiesOnCell.some((enemy) => matchesRoleFilter(enemy, preferredRoles))) {
    return drawAttention(state, actor, preferredRoles) || moved;
  }
  return drawAttention(state, actor) || moved;
}
```

### Existing Role Description Copy
```ts
// Source: src/ui/inspectText.ts
export function formatRoleExact(role: RoleId): string {
  return {
    frontline: 'Frontline units push toward enemies, prefer holding contested hexes, and commit to engagements first.',
    chaff: 'Chaff units look for swarm opportunities, reinforce friendly stacks, and trade positioning for pressure.',
    backline: 'Backline units prefer space, attack from range when possible, and retreat rather than hold a crowded hex.',
  }[role];
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Implicit role intuition from generic move/engage heuristics | Explicit role branching in `executeTurnActions()` | Already in current repo | Good base, but not enough to satisfy Phase 2 requirements consistently |
| Replay as renderer-owned reconstruction | Replay-first authoritative battle output | Already in current repo | Enables engine-side explanation without UI gameplay logic |
| Manual replay reading only | Existing simulation-harness metrics including backline breach timing | Already in current repo | Gives planners a quantitative guardrail for ROLE-01 and ROLE-05 |

**Deprecated/outdated:**
- Purely generic replay messages for important tactical decisions: adequate for debugging, weak for ROLE-06.
- Random backline retreat selection as the main "preserve distance" policy: likely insufficient for player intuition.

## Open Questions

1. **How should chaff commitment be represented?**
   - What we know: ROLE-04 requires persistence across turns, and current role logic is mostly stateless.
   - What's unclear: Whether commitment should bind to a specific target, a backline hex, or a broader enemy-side zone.
   - Recommendation: Decide this before planning tasks; it affects type design, helper APIs, and replay explanation.

2. **What exactly counts as frontline "blocking access paths"?**
   - What we know: The requirement is about reducing enemy access to allied backline, not merely engaging first.
   - What's unclear: Whether success is defined by occupying contested hexes, intercepting chaff lanes, or lowering measured breach rate over seed sweeps.
   - Recommendation: Define 2-3 canonical scenarios and one simulation-harness metric target in the plan.

3. **How much UI work belongs in ROLE-06?**
   - What we know: The phase is engine/replay focused, and engine authority must be preserved.
   - What's unclear: Whether clearer log messages alone are enough, or whether recap/tooltip/event-log surfaces also need thin presentation changes.
   - Recommendation: Plan engine metadata/messages first, then add only read-only UI consumers if replay review is still ambiguous.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Vitest, Vite, npm scripts | ✓ | `v24.14.0` | — |
| npm | Install/test workflow | ✓ | `11.9.0` | — |

**Missing dependencies with no fallback:**
- None.

**Missing dependencies with fallback:**
- None.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `2.1.9` installed |
| Config file | `none` via dedicated Vitest config; uses [`vite.config.mts`](C:/Users/staeg/shiftmake%20-%20Codex/vite.config.mts) |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ROLE-01 | Frontline protects allied backline by intercepting and absorbing attention | unit + seed sweep | `npm run test` | ❌ Wave 0 |
| ROLE-02 | Frontline falls through to reachable backline targets when frontline space is gone | unit | `npm run test` | ❌ Wave 0 |
| ROLE-03 | Chaff overruns frontline and prefers spilling into backline | unit + seed sweep | `npm run test` | ❌ Wave 0 |
| ROLE-04 | Chaff stays committed after reaching backline | unit | `npm run test` | ❌ Wave 0 |
| ROLE-05 | Backline preserves distance when geometry allows | unit + seed sweep | `npm run test` | ❌ Wave 0 |
| ROLE-06 | Replay output makes role intent readable | unit | `npm run test` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] Add role-behavior scenario tests, preferably in a new focused file such as `src/engine/roleBehavior.test.ts` or as a clearly separated section in `src/engine/battle.test.ts`.
- [ ] Add simulation-harness coverage for breach timing and backline protection regressions using `src/engine/simulationHarness.ts`.
- [ ] Add replay-readability assertions covering decision messages and/or typed metadata for ROLE-06.
- [ ] Validate whether a reliable filtered test command exists; in this session `npm run test -- src/engine/battle.test.ts` failed with sandbox-related `spawn EPERM`, while full-suite `npm run test` passed.

## Sources

### Primary (HIGH confidence)
- Local project requirements: `.planning/REQUIREMENTS.md` - Phase 2 requirement text
- Local roadmap/state/project docs: `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/PROJECT.md`
- Project constraints: `CLAUDE.md`, `AGENTS.md`, `TECHNICAL.md`
- Battle role design reference: `design documents/Battle details.md`
- Implementation source: [`src/engine/battle.ts`](C:/Users/staeg/shiftmake%20-%20Codex/src/engine/battle.ts) - current role decision helpers
- Replay/contract source: [`src/engine/types.ts`](C:/Users/staeg/shiftmake%20-%20Codex/src/engine/types.ts)
- Metrics source: [`src/engine/simulationHarness.ts`](C:/Users/staeg/shiftmake%20-%20Codex/src/engine/simulationHarness.ts)
- Replay presentation sources: [`src/ui/inspectText.ts`](C:/Users/staeg/shiftmake%20-%20Codex/src/ui/inspectText.ts), [`src/ui/EventLog.svelte`](C:/Users/staeg/shiftmake%20-%20Codex/src/ui/EventLog.svelte), [`src/ui/battleRecap.ts`](C:/Users/staeg/shiftmake%20-%20Codex/src/ui/battleRecap.ts)
- Validation sources: `package.json`, `src/engine/battle.test.ts`, `src/engine/simulationHarness.test.ts`, `src/store/gameStore.test.ts`

### Secondary (MEDIUM confidence)
- Installed tool inspection from local environment: `node --version`, `npm.cmd --version`, `npm run test`

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: MEDIUM - versions were verified locally, but registry verification was not possible offline
- Architecture: HIGH - directly supported by current code structure and project rules
- Pitfalls: HIGH - based on current implementation behavior, design docs, and test surface gaps

**Research date:** 2026-04-02
**Valid until:** 2026-05-02
