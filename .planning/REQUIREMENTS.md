# Requirements

## v1 Requirements

### UI Layout And Flow

- [ ] **UI-01**: Player can use the main menu, overworld planning screen, and replay screen without routine vertical scrolling at common desktop sizes, except in unusually content-heavy edge cases
- [ ] **UI-02**: Player can see the primary actionable information for the current screen without opening oversized popups or losing nearby context
- [ ] **UI-03**: Player can review Rift, troop, offer, and replay details within compact layouts that minimize dead space and keep related controls visible together
- [x] **UI-04**: Player can navigate core game flows through stable single-screen layouts that feel visually tidy and easier to parse than the current interface

### Role Behavior

- [x] **ROLE-01**: Frontline units prioritize occupying enemy attention and blocking access paths so enemy units are less able to reach allied backline units
- [x] **ROLE-02**: Frontline units fall back to engaging reachable enemy backline targets when no enemy frontline space is available, instead of wasting turns
- [x] **ROLE-03**: Chaff units attempt to overrun enemy frontline positioning and spill into any reachable targets, prioritizing enemy backline units when possible
- [x] **ROLE-04**: Chaff units remain committed to enemy backline positions once they reach them unless combat state forces a different legal move
- [x] **ROLE-05**: Backline units prefer to stay at range and continue preserving distance from enemy threats whenever battlefield geometry allows
- [x] **ROLE-06**: Replays make the resulting frontline, chaff, and backline behavior readable enough that the role intent feels intuitive to the player

### Campaign Balance

- [ ] **BAL-01**: A normal campaign run presents meaningful pressure in the opening cycles without feeling like an immediate wall
- [ ] **BAL-02**: A normal campaign run remains tense in later cycles without collapsing into a player steamroll
- [ ] **BAL-03**: Rift army composition scales in a way that supports fair challenge across the whole run rather than sharp difficulty spikes
- [ ] **BAL-04**: Essence gain and related progression rewards support steady strategic growth without starving or overfeeding the player
- [ ] **BAL-05**: Unlock and progression pacing supports build variety across a run while keeping the campaign readable and survivable

## v2 Requirements

- [ ] **UI-05**: Player can customize density or layout preferences for different screen sizes
- [ ] **BAL-06**: Player can access deeper analytics or debug-facing balance views from the main game client

## Out Of Scope

- Multiplayer or asynchronous competition features - outside the current singleplayer quality milestone
- Mobile-first layout work - deferred until the browser desktop experience is stable and compact
- Backend persistence, accounts, or cloud saves - not required for improving the current gameplay loop
- New factions, modes, or large content expansion - deferred until UI clarity, role readability, and campaign pacing are healthier

## Traceability

| Requirement ID | Planned Phase | Status |
|---|---|---|
| UI-01 | Phase 1 | Pending |
| UI-02 | Phase 1 | Pending |
| UI-03 | Phase 1 | Pending |
| UI-04 | Phase 1 | Complete |
| ROLE-01 | Phase 2 | Complete |
| ROLE-02 | Phase 2 | Complete |
| ROLE-03 | Phase 2 | Complete |
| ROLE-04 | Phase 2 | Complete |
| ROLE-05 | Phase 2 | Complete |
| ROLE-06 | Phase 2 | Complete |
| BAL-01 | Phase 3 | Pending |
| BAL-02 | Phase 3 | Pending |
| BAL-03 | Phase 3 | Pending |
| BAL-04 | Phase 3 | Pending |
| BAL-05 | Phase 3 | Pending |

---
*Last updated: 2026-04-02 after roadmap creation*
