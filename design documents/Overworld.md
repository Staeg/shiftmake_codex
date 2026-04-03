# Overworld

This document describes the current campaign layer.

## Screens and phases

The app has:

- a main menu with 3 save slots
- an overworld screen
- a replay viewer

The campaign phases inside the overworld are:

- `opening_unlock`: choose the free opening faction-and-troop combination from a faction's native roster
- `planning`: inspect Rifts, draft unlocks, assign troops, end cycle
- `game_over`: shown immediately after cycle 10 resolves

## Global state shown in the overworld

- cycle number
- victory points
- Essence
- troop status counts: active, recovering, idle
- currently discovered Rifts
- active troop and upgrade draft offers
- battle archive

## Current actions

### Opening unlock

- Choose any non-summoned faction and troop-type combination for free.
- That choice immediately adds the troop, marks its faction as owned, grants 2 Essence, and generates cycle-1 Rifts.

### Drafting

- Reveal a troop offer if you have at least 1 Essence and no active troop offer.
- Reveal an upgrade offer if you have at least 1 Essence and no active upgrade offer.
- Claim one option from an offer for 1 Essence.
- Unused Essence carries over between cycles.

### Rift planning

- Select a Rift to inspect enemies, mutators, VP reward, and assignable troops.
- Select a troop to inspect stats and assign it to a Rift.
- Assign or unassign ready troops.
- End the cycle to resolve all assigned Rift battles.

### Archive and postgame

- Open archived battle replays when their payloads are still stored.
- View summary-only archive entries when older replay payloads have been evicted for space.
- After cycle 10, choose either `Continue playing` or return to the menu.

## Assignment rules

- A troop cannot be assigned while recovering.
- A troop can only be assigned to one Rift at a time.
- By default, multiple troops from the same faction cannot enter the same Rift.
- The `United` overworld ability lifts that faction restriction for the upgraded faction.

## Recovery

- Victory recovery: ready next cycle by default
- Defeat recovery: ready next cycle by default
- `Quagmire` doubles recovery time for troops sent into that Rift

Recovery is reduced by 1 for everyone when the cycle advances, so base recovery of 1 means a troop is ready on the next planning phase.

## Cycle resolution

When the player ends the cycle:

1. Every discovered Rift with assigned troops resolves a battle.
2. Winning a Rift grants VP equal to its tier.
3. Assigned troops enter recovery and then tick down for the new cycle.
4. All discovered Rifts from the old cycle are marked resolved or expired.
5. Cycle number increases.
6. Essence increases by 2.
7. Active draft offers are cleared.
8. New Rifts are generated.
9. If the resolved cycle was cycle 10 and the postgame screen has not already been dismissed, phase changes to `game_over`.

## Current UI structure

The implemented overworld UI currently has:

- a top bar with cycle, VP, Essence, status counts, screen actions, and end-cycle control
- a left context panel for the selected Rift or troop
- a center panel that switches between Rifts and troops
- a right sidebar for draft offers, owned upgrades, and archive browsing
- an overlay card for the cycle-10 postgame moment

## Confirmations and warnings

- Ending a cycle with no assignments is allowed, but prompts for confirmation.
- Ending a cycle with unspent Essence is allowed, but prompts for confirmation.
- If both are true, the warning combines both conditions into one confirmation message.
