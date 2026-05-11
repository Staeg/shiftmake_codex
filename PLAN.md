# Contest Mode Implementation Plan

## Summary

Add `Contest` as a second game mode selectable when starting an empty slot or replacing an occupied slot. Keep all Contest rules in `src/engine/`; Svelte and Pixi only display state and replay resolved battles.

Contest v1 uses a symmetric human-vs-AI economy: both players start with two troops, gain Essence, receive draft offers, and use scheduled faction unlocks. The AI picks unlocks randomly, then uses deterministic battle simulation to choose allocations.

## Key Changes

- Add `gameMode: 'campaign' | 'contest'` to `GameState`; default legacy/new flow remains `campaign`.
- Add Contest player state:
  - `contest.players.human` and `contest.players.ai`, each with VP, Essence, troops, unlocked factions, troop unlocks, upgrades, draft/unlock offers, and recent unlocks.
  - Keep human-facing aliases or selectors so existing Campaign UI logic can be reused where practical.
- Extend `RiftInstance` for Contest:
  - `controller: 'neutral' | 'human' | 'ai'`
  - `occupyingTroopIds: TroopId[]`
  - `occupyingPlayerId: 'human' | 'ai' | null`
  - Neutral guardian army remains visible; AI-held occupying troops are visible with their affecting upgrades/stat breakdowns.
- Add Contest rift schedule:
  - Start with three T1 Rifts.
  - Add one Rift at cycle 3, tier 2.
  - Add one Rift at cycle 5, tier 3.
  - Add one Rift at cycle 7, tier 4.
  - End after cycle 8.

## Contest Rules

- Human and AI assign troops simultaneously each cycle.
- A player cannot assign troops to a Rift they already control.
- Troops assigned by a successful conqueror become Rift occupants and are unavailable until defeated.
- If a neutral Rift receives troops from only one player, resolve against guardians; victory makes those troops the occupants.
- If both players send troops to a neutral Rift:
  - Resolve each side against guardians independently.
  - Any side that defeats guardians gains guardian troop unlocks.
  - If exactly one side wins, that side occupies the Rift.
  - If both sides win, resolve a fresh full-force PvP battle using the originally assigned full forces, ignoring guardian damage; PvP winner occupies the Rift.
  - If neither side wins, the Rift remains neutral.
- If a Rift is held, an opposing assignment fights the occupying troops; a victory transfers control and makes attackers the new occupants.
- At cycle end, after all battles resolve, award VP for all currently held Rifts equal to each Rift's tier.
- Contest ends after resolving and scoring cycle 8.

## AI

- AI unlocks:
  - Opening troops: choose two legal native troops randomly.
  - Draft offers and scheduled unlocks: choose randomly among valid offered troops/upgrades/types.
- AI allocation:
  - Use only start-of-cycle known information.
  - Ignore human assignments and human upgrades obtained later that cycle.
  - Search available Rifts by descending target subset size: all available Rifts, then all subsets missing one, down to one Rift.
  - For each subset, enumerate valid troop-to-Rift allocations under current assignment constraints.
  - Simulate battles without renderer/animation using `resolveBattle`.
  - Pick the first allocation where every targeted Rift is predicted as a win.
  - Cache battle results by `(rift defender snapshot, troop set, upgrade ids, mutators, saturation)` and stop on first failed Rift within an allocation.

## UI/Store

- Main menu slot cards get `Start Campaign`, `Start Contest`, and occupied-slot replace options for both modes.
- Save summaries show mode, cycle, phase, lead faction/player summary, and last played timestamp.
- Overworld shows Contest VP as Human vs AI and labels Rift control: Neutral, Held by You, Held by AI.
- Enemy-held Rift cards show only visible occupying troops and their affecting upgrades/stat breakdowns; no AI reserve, failed attack, or hidden roster information.
- Replay archive supports guardian checks, holder defense battles, and PvP battles with clear labels.

## Tests

- Engine tests for Contest initialization, rift schedule, cycle-8 game over, and end-cycle VP scoring after battles.
- Assignment tests for "cannot send to own Rift," held-troop unavailability, same faction/type constraints, and simultaneous neutral allocation.
- Resolution tests for: solo conquest, failed solo attack, both clear guardians then PvP, only one clears guardians, attacking an occupied Rift, unlock rewards for both guardian victors.
- AI tests with small deterministic rosters proving subset fallback, valid assignment constraints, battle-result caching, and no use of hidden human same-cycle choices.
- Store/save tests for mode selection, replacing slots, save/load of Contest state, and replay payload persistence.
- UI smoke tests for mode selection, control labels, visible enemy-held upgrades, and hidden AI reserve information.

## AI Runtime Estimate

Naive exhaustive Cycle 8 search is too large. With six available Rifts and roughly 14 ready AI troops, ignoring faction/type constraints, checking every non-empty allocation across all subset sizes is about `678 billion` candidate allocations. At the measured local resolver speed of about `6.5 ms` for small fights and `40 ms` for heavier T4 fights, a literal search is completely infeasible.

Implementation should use pruning and caching from the start. A practical v1 target is to cap allocation search with deterministic ordering, memoized battle checks, and an explicit time/candidate budget; otherwise worst-case Cycle 8 can balloon from seconds into hours or days.

## Assumptions

- Existing Campaign behavior remains unchanged.
- Contest uses symmetric economy/progression for AI and human.
- Newly conquered Rifts score at that same cycle end after battle resolution.
- Guardian troop unlocks are granted on successful guardian clears; if both players clear guardians before PvP, both receive those unlocks.
