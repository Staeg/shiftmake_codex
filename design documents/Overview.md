# Overview

This document describes the game as it is currently implemented.

Shiftmake is a browser-based strategy game with singleplayer Campaign and Ladder modes, a Contest vs AI mode, an auto-battling combat layer, and fully replayable battles.

You build a mixed-faction army, preview visible Rifts, assign troops, draft new troops and upgrades with Essence, and chase the highest possible VP total by the end of cycle 10.

## Current flow

1. Start a Campaign, Ladder, or Contest vs AI run from one of three save slots.
2. Pick two free opening factions from the opening offer. Each faction option includes one specific starting troop type; the player chooses the faction, not the troop type.
3. Enter the planning screen for the current cycle.
4. Inspect visible Rifts, their mutators, enemy troops, capacity metadata, and VP reward directly from the board.
5. Spend carried Essence on troop and upgrade draft claims.
6. Assign every ready troop to Rifts.
7. End the cycle to auto-resolve all assigned Rift battles.
8. Gain VP equal to the tier of each Rift you win.
9. Gain 2 Essence for the next cycle.
10. After cycle 10 resolves, view the official game-over screen and optionally continue free play.

Ladder follows the same 10-cycle progression, unlock, assignment, Essence, VP, recovery, and battle rules as Campaign. Its difference is the Rift source: each cycle's four Rifts are drawn from a shared Ladder Rift-set database. When a Ladder cycle completes, the source Rift-set is harvested into a child Rift-set where conquered Rifts use the player's assigned troops as future Guardians.

## Core strategic pressures

- Troops can only act if they are not recovering.
- By default, only one troop from a faction may enter a given Rift.
- Only one troop of a given troop type may enter a given Rift.
- Rifts are fully previewable before commitment.
- Battles are not player-controlled, so skill expression is in preparation and assignment.
- Spendable Essence must be used before ending a cycle. If no draft can be revealed, leftover Essence can carry forward.
- Every ready troop must be assigned before ending a cycle; troops already holding Contest Rifts count as committed.

## Current progression actions

- Claim two free opening factions. Each chosen faction grants its preselected starting troop from that faction's native roster, while the rest of that faction's native roster is shown as later unlock potential.
- After the opening campaign starts, normal troop drafts are limited to the two unlocked factions' native rosters plus any latent Rift-earned combinations for already-unlocked factions.
- At the start of cycle 3, choose a new faction from the scheduled faction unlock offer. The chosen faction arrives with 1 preselected faction upgrade and 2 preselected troop types already unlocked. Other native and latent troop types for that faction are still shown as later unlock potential.
- At the start of cycle 7, choose another new faction from the scheduled faction unlock offer. The chosen faction arrives with 2 preselected faction upgrades and 3 preselected troop types already unlocked. Other native and latent troop types for that faction are still shown as later unlock potential.
- Spend 2 Essence to reveal a combined troop-and-upgrade draft, then claim one troop option and one upgrade option at no additional cost. If one side of the draft is exhausted, a one-sided fallback costs 1 Essence.
- Use owned factions and owned unit types to bias future draft buckets.
- Troop drafts hide options that would make the roster impossible to assign under current Rift count limits.
- Winning a Rift can make unusual faction-and-troop combinations from that Rift's enemy army latent future unlocks; those combinations become draftable only once their faction is unlocked.
- Build synergies through faction-wide and troop-type-wide upgrades.

Removed from the current game:

- gold
- stat upgrades
- buying extra units
- faction unlock purchases
- blueprints
- post-battle reward claims

## Current victory structure

- The score is `victoryPoints`.
- Winning a Rift grants VP equal to that Rift's tier.
- Rift victories can also record unusual troop combinations that appeared in the defeated Rift for future faction unlocks.
- The scored run officially ends after cycle 10.
- Ladder has no rating, ranking, matchmaking rating, player rating, or Rift-set rating in v1.

## Currently implemented factions

- Humans
- Elves
- Goblins
- Trolls
- Dwarves
- Orcs
- Fae

## Platform target

- Primary: browser/web

Stretch goals mentioned in older docs such as multiplayer or mobile are not part of the current implementation.
