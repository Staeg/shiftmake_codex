# Overworld

This document describes the current campaign layer.

## Screens and phases

The app has:

- a main menu with 3 save slots
- a main-menu tutorial entry with a dedicated fixed tutorial save that does not occupy a normal save slot
- an overworld screen
- a replay viewer

The campaign phases inside the overworld are:

- `opening_unlock`: choose two free opening factions; each faction option grants one preselected native starting troop and shows its other native troop types as later unlock potential
- `faction_unlock`: choose a scheduled new faction at the start of cycle 3 or cycle 7
- `troop_type_unlock`: scheduled troop unlock grant step for that newly unlocked faction
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

- Choose any offered opening faction for free; the faction's preselected starting troop type is included automatically.
- Choose a second offered opening faction for free; its preselected starting troop type is included automatically.
- The player can inspect the other native troop types each offered faction may unlock later, but does not choose the starter's troop type.
- After the second choice, both starting troops are added, both factions are marked owned, 2 Essence is granted, and cycle-1 Rifts are generated.
- Normal troop drafts then use only those unlocked factions' native rosters, plus any latent Rift-earned combinations for already-unlocked factions.

### Scheduled faction unlocks

- At the start of cycle 3, the player gets a faction unlock offer with up to 3 still-locked factions. With the currently implemented 7-faction catalog, fewer than 3 options can appear if fewer than 3 factions remain locked.
- Each cycle-3 faction option previews its native troop roster, defeated-enemy troop combinations that could be unlocked for that faction in the future, 1 preselected faction upgrade, and 2 preselected troop types that will be granted immediately.
- After choosing the cycle-3 faction, the selected faction, its preselected upgrade, and its 2 preselected troop types are added without a follow-up troop-type picker.
- At the start of cycle 7, the same flow repeats, but the chosen faction receives 2 preselected faction upgrades and 3 preselected troop types.

### Drafting

- Reveal one combined Essence draft when no draft offer is active.
- The draft costs 2 Essence when both troop and upgrade options are available.
- If only troop options or only upgrade options remain, the one-sided draft costs 1 Essence.
- Claim one troop option and one upgrade option from a revealed draft without spending additional Essence.
- Troop draft candidates are limited to unlocked factions; defeating an enemy from a locked faction records the combination latently until that faction is later unlocked.
- Troop draft options that would leave the roster with more troops of one faction or troop type than current discovered Rifts are hidden.
- Spendable Essence must be used before ending the cycle. If no draft can be revealed, leftover Essence carries over.

### Rift planning

- Inspect Rift enemies, mutators, VP reward, and fit directly from the board without selecting the Rift card itself.
- Select a troop to inspect stats and assign it to a Rift.
- Assign or unassign ready troops.
- End the cycle to resolve all assigned Rift battles after every ready troop is assigned.

### Archive and postgame

- Open archived battle replays when their payloads are still stored.
- View summary-only archive entries when older replay payloads have been evicted for space.
- After cycle 10, choose either `Continue playing` or return to the menu.

## Assignment rules

- A troop cannot be assigned while recovering.
- A troop can only be assigned to one Rift at a time.
- By default, multiple troops from the same faction cannot enter the same Rift.
- The `United` overworld ability lifts that faction restriction for the upgraded faction.
- Multiple troops of the same troop type cannot enter the same Rift.

## Recovery

- Victory recovery: ready next cycle by default
- Defeat recovery: ready next cycle by default

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
9. If the new cycle is 3 or 7, phase changes to the scheduled faction unlock before normal planning resumes.
10. If the resolved cycle was cycle 10 and the postgame screen has not already been dismissed, phase changes to `game_over`.

## Current UI structure

The implemented overworld UI currently has:

- a top bar with cycle, VP, Essence, status counts, screen actions, and end-cycle control
- a left context panel for the selected Rift or troop
- a center panel that switches between Rifts and troops
- a right sidebar for draft offers, owned upgrades, and archive browsing
- an overlay card for the cycle-10 postgame moment

## Confirmations and warnings

- Ending a cycle is blocked while any ready, non-occupying troop is unassigned.
- Ending a cycle is blocked while an Essence draft can be revealed or a revealed draft still has unclaimed choices.
- Spendable Essence is routed first; assignment blockers are shown after Essence is spent and active drafts are finished.
