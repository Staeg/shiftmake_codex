# Roadmap: Shiftmake

## Overview

This milestone follows the explicit project priority order for the existing brownfield game: first make the main UI compact and readable on common desktop screens, then make battlefield roles behave in ways that match their names and replay presentation, then tune campaign pacing so a full run stays pressured and fair from opening to late cycles.

## Phases

- [ ] **Phase 1: Compact UI Layouts** - Make the main browser flows fit cleanly on one screen with clearer, denser information layout.
- [x] **Phase 2: Intuitive Battlefield Roles** - Rework frontline, chaff, and backline behavior so battles read the way players expect. (Completed 2026-04-02)
- [ ] **Phase 3: Full-Run Campaign Balance** - Tune progression, Rift scaling, and rewards so a normal run stays fair and tense throughout.

## Phase Details

### Phase 1: Compact UI Layouts
**Goal**: Players can navigate the core campaign and replay screens through compact single-screen desktop layouts that keep primary actions and context visible together.
**Depends on**: Nothing
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria**:
1. Player can use the main menu, overworld planning screen, and replay screen at common desktop sizes without routine vertical scrolling outside unusually dense edge cases.
2. Player can see the main decision-critical information for the current screen without opening oversized popups that hide nearby context.
3. Player can inspect Rift, troop, offer, and replay details in compact layouts that keep related controls and information visible together.
4. Player can move through core campaign flows in stable layouts that feel visually tidy and easier to parse than the previous interface.
**Plans**: 5 plans
- [x] 01-01-PLAN.md - Establish shared compact layout tokens and shell density rules without changing navigation
- [ ] 01-02-PLAN.md - Compact the main menu, opening unlock, and overworld planning surfaces into single-screen desktop layouts
- [ ] 01-03-PLAN.md - Compact the replay shell, controls, side rails, and recap while keeping the battlefield dominant
- [ ] 01-04-PLAN.md - Close overworld fit, inspect overflow, and stale cross-mode selection carryover from UAT
- [ ] 01-05-PLAN.md - Close replay control sizing, dead-space, and click-lock consistency gaps from UAT

### Phase 2: Intuitive Battlefield Roles
**Goal**: Battle roles behave and replay clearly enough that frontline, chaff, and backline intent matches player intuition without leaking gameplay logic out of the pure engine.
**Depends on**: Phase 1
**Requirements**: ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05, ROLE-06
**Success Criteria**:
1. Frontline units absorb enemy attention and block access paths in normal battle states so allied backline units are harder to reach.
2. Frontline units redirect into reachable enemy backline targets when no enemy frontline position is available instead of idling or wasting turns.
3. Chaff units push past the frontline when legal, prefer spilling into enemy backline targets, and stay committed there once they arrive unless combat state prevents it.
4. Backline units preserve distance when battlefield geometry allows, and the resulting replay makes each role's intent understandable to the player.
**Plans**: 3 plans
- [x] 02-01-PLAN.md - Lock the engine role contract with scenario tests, typed replay intent metadata, and heuristic refactors
- [x] 02-02-PLAN.md - Add simulation-harness role benchmarks and deterministic seed-sweep regression coverage
- [x] 02-03-PLAN.md - Surface role intent in replay copy, event log badges, and recap summaries

### Phase 3: Full-Run Campaign Balance
**Goal**: Campaign pacing stays strategically readable, survivable, and tense from early cycles through late cycles through tuned Rift scaling, rewards, and unlock flow.
**Depends on**: Phase 2
**Requirements**: BAL-01, BAL-02, BAL-03, BAL-04, BAL-05
**Success Criteria**:
1. Player feels meaningful pressure in the opening cycles of a normal run without hitting an immediate wall.
2. Player still faces real tension in later cycles instead of cruising through a steamroll.
3. Rift enemy compositions scale across the run without sharp unfair spikes that break campaign readability.
4. Essence income and related progression rewards support steady strategic growth without starving or overfeeding the player.
5. Unlock pacing supports multiple viable build directions during a run while keeping the campaign readable and survivable.
**Plans**: 3 plans
- [ ] 03-01-PLAN.md - Add campaign-level balance instrumentation and deterministic policy-driven simulation reports
- [ ] 03-02-PLAN.md - Rework Rift schedule, saturation bands, role quotas, and tier scaling into explicit deterministic tables
- [ ] 03-03-PLAN.md - Rebalance Essence flow, offer gating, and unlock pacing with campaign-simulation coverage

## Progress

**Execution Order:** 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Compact UI Layouts | 0/3 | Not started | - |
| 2. Intuitive Battlefield Roles | 3/3 | Complete | 2026-04-02 |
| 3. Full-Run Campaign Balance | 0/3 | Not started | - |
