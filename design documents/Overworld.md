# Overworld

This document describes the currently implemented campaign layer.

## Screens and phases

The app has:

- a main menu with 3 save slots
- an overworld/planning screen
- a replay viewer

The campaign phases inside the overworld are:

- `faction_draft`: choose the opening faction
- `planning`: inspect rifts, manage troops, assign troops, end cycle
- `reward_claims`: choose free faction-upgrade rewards earned from victories

## Global state shown in the overworld

- cycle number
- gold
- essence
- troop status counts: active, recovering, idle
- currently discovered rifts
- battle archive

## Current actions

### Army growth

- Unlock a new faction.
- Unlock a new troop type for an unlocked faction.
- Add one unit to an existing troop.
- Buy allowed stat upgrades for a troop.
- Buy an available default faction upgrade.

### Rift planning

- Select a Rift to inspect enemies, mutators, rewards, and assignable troops.
- Assign or unassign ready troops.
- End the cycle to resolve all assigned Rift battles.

### Rewards and archive

- Claim pending reward choices after victories.
- Open archived battle replays when their payloads are still stored.
- View summary-only entries when older replay payloads have been evicted for space.

## Assignment rules

- A troop cannot be assigned while recovering.
- A troop can only be assigned to one Rift at a time.
- By default, multiple troops from the same faction cannot enter the same Rift.
- The `United` overworld ability lifts that faction restriction for the upgraded faction.

## Recovery

- Victory recovery: 1 cycle
- Defeat recovery: 2 cycles
- `Quagmire` doubles recovery time for troops sent into that Rift

Recovery is reduced by 1 for everyone when the cycle advances.

## Cycle resolution

When the player ends the cycle:

1. Every discovered Rift with assigned troops resolves a battle.
2. Victories immediately grant resource rewards.
3. Victories may also generate pending reward choices.
4. Assigned troops enter recovery.
5. Unresolved discovered Rifts are marked expired.
6. Cycle number increases.
7. New Rifts are generated.

## Current UI structure

The implemented overworld UI is not the old draft layout from earlier docs. It currently has:

- a top bar with resources and mode switching
- a center view that switches between Rifts and Troops/Factions
- a left context panel for the selected troop, faction, rift, or replay summary
- a right detail/log panel for hovered details and archive browsing
- a bottom action rail for the current primary action

## Not currently implemented

- overworld map travel
- multi-cycle Rift persistence as actual gameplay behavior
- blueprint unlock flow
- troop-type-wide global upgrades
