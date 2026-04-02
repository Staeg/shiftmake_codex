# Overview

This document describes the game as it is currently implemented.

Shiftmake is a browser-based singleplayer strategy game with an auto-battling combat layer and fully replayable battles.

You build a mixed-faction army, preview visible Rifts, assign troops, draft new troops and upgrades with Essence, and chase the highest possible VP total by the end of cycle 10.

## Current flow

1. Start a campaign from one of three save slots.
2. Pick one free opening faction-and-troop combination.
3. Enter the planning screen for the current cycle.
4. Inspect visible Rifts, their mutators, enemy troops, saturation limit, and VP reward.
5. Spend carried Essence on troop and upgrade draft claims.
6. Assign any ready troops to Rifts.
7. End the cycle to auto-resolve all assigned Rift battles.
8. Gain VP equal to the tier of each Rift you win.
9. Gain 2 Essence for the next cycle.
10. After cycle 10 resolves, view the official game-over screen and optionally continue free play.

## Core strategic pressures

- Troops can only act if they are not recovering.
- By default, only one troop from a faction may enter a given Rift.
- Rifts are fully previewable before commitment.
- Battles are not player-controlled, so skill expression is in preparation and assignment.
- Unspent Essence carries over, but ending a cycle while holding Essence triggers a warning.

## Current progression actions

- Claim one free opening troop from any non-summoned faction and troop-type combination.
- Reveal troop choices and claim one for 1 Essence.
- Reveal upgrade choices and claim one for 1 Essence.
- Use owned factions and owned unit types to bias future draft buckets.
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
- Rift victories grant nothing else.
- The scored run officially ends after cycle 10.

## Currently implemented factions

- Humans
- Elves
- Goblins
- Trolls

## Platform target

- Primary: browser/web

Stretch goals mentioned in older docs such as multiplayer or mobile are not part of the current implementation.
