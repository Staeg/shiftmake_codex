# Roadmap: Shiftmake

## Overview

This milestone follows the explicit project priority order for the existing brownfield game: first make the main UI compact and readable on common desktop screens, then make battlefield roles behave in ways that match their names and replay presentation, then tune campaign pacing so a full run stays pressured and fair from opening to late cycles. The sequence preserves the pure `src/engine/` boundary and stages UI, role logic, and balance work so later tuning happens on a clearer, more trustworthy foundation.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Compact UI Layouts** - Make the main browser flows fit cleanly on one screen with clearer, denser information layout.
- [ ] **Phase 2: Intuitive Battlefield Roles** - Rework frontline, chaff, and backline behavior so battles read the way players expect.
- [ ] **Phase 3: Full-Run Campaign Balance** - Tune progression, Rift scaling, and rewards so a normal run stays fair and tense throughout.

## Phase Details

### Phase 1: Compact UI Layouts
**Goal**: Players can navigate the core campaign and replay screens through compact single-screen desktop layouts that keep primary actions and context visible together.
**Depends on**: Nothing (first phase)
**Requirements**: UI-01, UI-02, UI-03, UI-04
**Success Criteria** (what must be TRUE):
  1. Player can use the main menu, overworld planning screen, and replay screen at common desktop sizes without routine vertical scrolling outside unusually dense edge cases.
  2. Player can see the main decision-critical information for the current screen without opening oversized popups that hide nearby context.
  3. Player can inspect Rift, troop, offer, and replay details in compact layouts that keep related controls and information visible together.
  4. Player can move through core campaign flows in stable layouts that feel visually tidy and easier to parse than the previous interface.
**Plans**: 3 plans
Plans:
- [ ] 01-01-PLAN.md - Establish shared compact layout tokens and shell density rules without changing navigation
- [ ] 01-02-PLAN.md - Compact the main menu, opening unlock, and overworld planning surfaces into single-screen desktop layouts
- [ ] 01-03-PLAN.md - Compact the replay shell, controls, side rails, and recap while keeping the battlefield dominant
**UI hint**: yes

### Phase 2: Intuitive Battlefield Roles
**Goal**: Battle roles behave and replay clearly enough that frontline, chaff, and backline intent matches player intuition without leaking gameplay logic out of the pure engine.
**Depends on**: Phase 1
**Requirements**: ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05, ROLE-06
**Success Criteria** (what must be TRUE):
  1. Frontline units absorb enemy attention and block access paths in normal battle states so allied backline units are harder to reach.
  2. Frontline units redirect into reachable enemy backline targets when no enemy frontline position is available instead of idling or wasting turns.
  3. Chaff units push past the frontline when legal, prefer spilling into enemy backline targets, and stay committed there once they arrive unless combat state prevents it.
  4. Backline units preserve distance when battlefield geometry allows, and the resulting replay makes each role's intent understandable to the player.
**Plans**: 3 plans
Plans:
- [x] 02-01-PLAN.md - Lock the engine role contract with scenario tests, typed replay intent metadata, and heuristic refactors
- [ ] 02-02-PLAN.md - Add simulation-harness role benchmarks and deterministic seed-sweep regression coverage
- [ ] 02-03-PLAN.md - Surface role intent in replay copy, event log badges, and recap summaries

### Phase 3: Full-Run Campaign Balance
**Goal**: Campaign pacing stays strategically readable, survivable, and tense from early cycles through late cycles through tuned Rift scaling, rewards, and unlock flow.
**Depends on**: Phase 2
**Requirements**: BAL-01, BAL-02, BAL-03, BAL-04, BAL-05
**Success Criteria** (what must be TRUE):
  1. Player feels meaningful pressure in the opening cycles of a normal run without hitting an immediate wall.
  2. Player still faces real tension in later cycles instead of cruising through a steamroll.
  3. Rift enemy compositions scale across the run without sharp unfair spikes that break campaign readability.
  4. Essence income and related progression rewards support steady strategic growth without starving or overfeeding the player.
  5. Unlock pacing supports multiple viable build directions during a run while keeping the campaign readable and survivable.
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Compact UI Layouts | 0/3 | Not started | - |
| 2. Intuitive Battlefield Roles | 0/0 | Not started | - |
| 3. Full-Run Campaign Balance | 0/0 | Not started | - |
