# Phase 3: Full-Run Campaign Balance - Research

**Researched:** 2026-04-02
**Domain:** Campaign pacing, Rift difficulty curve, progression economy, and deterministic balance instrumentation
**Confidence:** MEDIUM-HIGH

## User Constraints

No phase-specific `CONTEXT.md` exists for Phase 3, so there are no additional locked user decisions beyond the roadmap, requirements, and project docs already loaded.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BAL-01 | A normal campaign run presents meaningful pressure in the opening cycles without feeling like an immediate wall | Smoother early Rift schedule, narrower saturation ranges, and policy-driven run sweeps |
| BAL-02 | A normal campaign run remains tense in later cycles without collapsing into a player steamroll | Continued tier escalation through cycle 10, role-aware enemy composition, and modest player-economy bonuses |
| BAL-03 | Rift army composition scales in a way that supports fair challenge across the whole run rather than sharp difficulty spikes | Tier role quotas, bounded stat multipliers, and reduced saturation variance |
| BAL-04 | Essence gain and related progression rewards support steady strategic growth without starving or overfeeding the player | Separate troop and upgrade pacing, first-win bonus, and campaign-sweep metrics for spend cadence |
| BAL-05 | Unlock and progression pacing supports build variety across a run while keeping the campaign readable and survivable | Early troop offers prioritize new factions, upgrades unlock later, and run reports track owned factions/troops over time |

## Project Constraints

- Use the existing stack: TypeScript + Vite + Svelte + PixiJS.
- Read `TECHNICAL.md` before implementation work.
- Keep all gameplay logic in `src/engine/` with zero rendering or DOM dependencies.
- Svelte components and Pixi rendering must consume resolved engine data only.
- Preserve browser-first singleplayer scope.
- Phase 3 depends on Phase 2 in the roadmap; planning can proceed now, but execution should expect the Phase 2 battle-role work to land first.

## Summary

The current campaign balance is driven by a few highly concentrated levers in `src/engine/game.ts`, `src/engine/rift.ts`, and `src/engine/army.ts`. Right now the run has three properties that make pacing hard to tune:

1. The difficulty curve is front-loaded and then plateaus. Cycle 1 already includes a tier-2 Rift, but the schedule stops growing after cycle 6, so late-game tension relies mostly on random compositions rather than a continued campaign ramp.
2. Enemy composition randomness is too wide. `buildEnemyArmy()` shuffles the entire unlock pool, takes `tier + 1` unique combinations, and combines that with saturation from `3` to `15`, so some Rifts are fair and legible while others are difficulty spikes caused by role mix and board density variance rather than the intended tier.
3. The progression economy is flat. The player always gets `+2` Essence at cycle end, troop and upgrade claims both cost `1`, and upgrade offers are available immediately. That keeps runs moving, but it compresses the distinction between “grow roster variety” and “stack permanent power,” which makes unlock pacing less readable.

The codebase already has the right building blocks for a safer balance phase. `src/engine/simulationHarness.ts` supports deterministic seed sweeps and summary metrics, and `src/engine/permutationReport.ts` already shows a pattern for batch reporting. The missing piece is a campaign-level harness that runs full 10-cycle simulations under a few scripted policies and reports outcomes like final VP, owned factions, unused Essence, and win/loss distribution by cycle.

**Primary recommendation:** Plan this phase in three parts: first add campaign-level instrumentation and reports, then rebalance Rift generation/scaling with explicit tables, then rebalance economy/unlock flow with concrete offer rules and costs. Keep every change deterministic and testable from engine code.

## Current Balance Findings

### Finding 1: The early/late curve is uneven

- Current schedule: `2/1/1/1`, `2/2/1/1`, `3/2/1/1`, `3/2/2/1`, `3/3/2/1`, then `4/3/2/1` forever.
- Result: the opening already exposes the player to tier-2 pressure, but later cycles stop adding new difficulty shape and instead depend on random composition spikes.

**Recommended target schedule**

Use an explicit 10-cycle schedule:

| Cycle | Suggested tiers |
|------|------------------|
| 1 | `1 / 1 / 1 / 1` |
| 2 | `2 / 1 / 1 / 1` |
| 3 | `2 / 2 / 1 / 1` |
| 4 | `2 / 2 / 2 / 1` |
| 5 | `3 / 2 / 2 / 1` |
| 6 | `3 / 3 / 2 / 1` |
| 7 | `3 / 3 / 2 / 2` |
| 8 | `4 / 3 / 2 / 2` |
| 9 | `4 / 3 / 3 / 2` |
| 10+ | `4 / 4 / 3 / 2` |

This removes the immediate cycle-1 spike, keeps pressure growing through cycle 10, and preserves the current “four Rifts per cycle” structure.

### Finding 2: Saturation variance is too large for a fair campaign curve

- Current saturation range is `3..15` for every Rift regardless of tier.
- That is a much stronger variance source than the nominal tier system and can make two same-tier Rifts feel unrelated in difficulty.

**Recommended target bands**

Use tier-bounded saturation bands:

| Tier | Saturation range |
|------|------------------|
| 1 | `5..7` |
| 2 | `6..8` |
| 3 | `7..9` |
| 4 | `8..10` |

This keeps density readable and still lets larger Rifts feel meaningfully different later in the run.

### Finding 3: Random enemy role mixes create avoidable spike fights

- Current enemy generation uses random unique faction/unit combinations with no role-shape guarantees.
- A tier can roll too many backline or too many premium units, which reads as randomness rather than intentional escalation.

**Recommended composition contract**

Use role-slot quotas by tier:

| Tier | Slots |
|------|-------|
| 1 | `frontline`, `flex` |
| 2 | `frontline`, `backline`, `flex` |
| 3 | `frontline`, `chaff`, `backline`, `flex` |
| 4 | `frontline`, `chaff`, `backline`, `flex`, `flex` |

`flex` can be any non-summoned troop, but selection should:

- avoid duplicate unlock IDs inside one Rift
- keep at least two distinct roles when possible
- cap summoner-heavy picks to one summoner in tiers 1-2 and two summoners in tiers 3-4

### Finding 4: Uniform tier stat scaling is too blunt

- Current enemy scaling is `+10%` health, damage, and speed per tier above 1.
- Speed scaling is especially sensitive because it changes turn frequency, not just durability or output.

**Recommended multiplier table**

| Tier | Health | Damage | Speed |
|------|--------|--------|-------|
| 1 | `1.00` | `1.00` | `1.00` |
| 2 | `1.08` | `1.05` | `1.02` |
| 3 | `1.18` | `1.12` | `1.04` |
| 4 | `1.30` | `1.20` | `1.06` |

This keeps higher tiers stronger without making later enemies feel arbitrarily faster in a way that undermines readability.

### Finding 5: Progression incentives are too flat

- Opening troop grants `2` Essence.
- End-cycle always grants `+2` Essence.
- Troop and upgrade claims both cost `1`.
- Upgrade offers are available immediately.

This means the player can pivot into permanent global upgrades almost as quickly as they expand roster variety, which weakens BAL-05.

**Recommended economy targets**

- Keep opening Essence at `2`.
- Keep base end-of-cycle Essence at `2`.
- Add a `+1` first-victory bonus per cycle, max once per cycle.
- Set troop claim cost to `1`.
- Set upgrade claim cost to `2`.
- Require at least `3` owned troops before upgrade offers can be revealed.
- While the player owns fewer than `3` factions, troop offers should prioritize an unowned faction first, then owned faction, then owned unit type.
- After the player owns `3+` factions, troop offers can revert to the current “owned faction / owned unit type / new faction” spread.

This keeps growth steady even on weak cycles, rewards successful play without runaway snowballing, and gives new-faction unlocks more early runway.

## Instrumentation Strategy

The repo already supports deterministic battle sweeps. Phase 3 should extend that pattern to campaign sweeps.

### Recommended new engine surfaces

- `src/engine/campaignSimulation.ts`
- `src/engine/campaignSimulation.test.ts`
- `scripts/reportCampaignBalance.ts`

### Recommended policy IDs

- `greedy-vp`: always assign ready troops to the highest-tier available Rift first and spend Essence on immediate strength
- `greedy-growth`: prioritize new-faction troop claims before upgrades and assign broadly
- `balanced`: prefer new factions until 3 are owned, then mix troop and upgrade spending

### Recommended campaign metrics

- final victory points
- victories and defeats by cycle
- cycles with zero assignments
- owned factions and troop count at cycles `3`, `6`, and `10`
- average unused Essence
- average highest Rift tier defeated
- game-over reach / post-cycle-10 reach

These metrics are enough to evaluate BAL-01 through BAL-05 without inventing a UI analytics surface.

## Open Questions

1. Should late-game tension come mainly from higher tiers or from more successful player assignment pressure?
   - Recommendation: use higher tiers plus composition quality first; do not add more than four Rifts per cycle in this phase.

2. Should victory points remain score-only?
   - Recommendation: yes for Phase 3. Keep VP as score and tune Essence/offer pacing separately to avoid mixing two progression currencies.

3. Should unit/faction upgrade numbers themselves be retuned in this phase?
   - Recommendation: only if campaign sweeps show a specific upgrade is distorting the whole run after schedule/economy changes. Do not start Phase 3 by editing catalog numbers blindly.

## Environment Availability

| Dependency | Required By | Available | Version | Notes |
|------------|------------|-----------|---------|-------|
| Node.js | scripts, Vitest | yes | `v24.14.0` | Local environment |
| npm | test workflow | yes | `11.9.0` | Local environment |
| Vitest | engine verification | yes | `2.1.9` | Full suite runs locally |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `vite.config.mts` |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BAL-01 | Early cycles are survivable but pressured under scripted policies | campaign simulation + engine tests | `npm run test` | no |
| BAL-02 | Late cycles still produce losses, close calls, or constrained growth under scripted policies | campaign simulation + engine tests | `npm run test` | no |
| BAL-03 | Rift schedules, saturation bands, role quotas, and tier multipliers stay deterministic | unit + simulation | `npm run test` | partial |
| BAL-04 | Essence income and spend rules are deterministic and test-covered | unit + campaign simulation | `npm run test` | partial |
| BAL-05 | Offer gating and new-faction priority are deterministic and test-covered | unit + campaign simulation | `npm run test` | partial |

### Sampling Rate

- Per task commit: `npm run test`
- Per wave merge: `npm run test`
- Phase gate: full suite green before `$gsd-verify-work`

### Known Precondition

The current branch's full suite is not green yet because Phase 2 role-behavior tests are already present and currently failing. Phase 3 execution should assume Phase 2 lands first or be rebased onto a branch where those failures are resolved.

## Sources

### Primary

- `.planning/PROJECT.md`
- `.planning/ROADMAP.md`
- `.planning/REQUIREMENTS.md`
- `.planning/STATE.md`
- `AGENTS.md`
- `TECHNICAL.md`
- `design documents/Overworld.md`
- `design documents/Rifts.md`
- `src/engine/game.ts`
- `src/engine/rift.ts`
- `src/engine/army.ts`
- `src/engine/simulationHarness.ts`
- `src/engine/permutationReport.ts`
- `src/engine/campaign.test.ts`
- `src/engine/rift.test.ts`
- `src/engine/simulationHarness.test.ts`
- `src/engine/permutationReport.test.ts`

### Secondary

- Local `npm run test` output from this session, confirming the suite runs but is currently red because `src/engine/roleBehavior.test.ts` fails.

## Metadata

**Confidence breakdown:**

- Core architecture: HIGH
- Current balance pain points: HIGH
- Exact tuning values: MEDIUM
- Validation path: MEDIUM-HIGH

**Research date:** 2026-04-02
**Valid until:** 2026-05-02
