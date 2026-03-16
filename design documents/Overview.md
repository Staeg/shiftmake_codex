# Overview

This document describes the game as it is currently implemented.

Shiftmake is a browser-based singleplayer strategy game with an auto-battling combat layer and fully replayable battles.

You manage a mixed-faction army, choose which troops to send into visible Rifts, and grow stronger through troop unlocks, faction upgrades, stat upgrades, and reward choices earned from victories.

## Current flow

1. Start a campaign from one of three save slots.
2. Choose one starting faction from the four implemented factions.
3. Enter the planning screen for the current cycle.
4. Inspect visible Rifts, their mutators, enemy troops, saturation limit, and rewards.
5. Spend gold and essence on army growth.
6. Assign any ready troops to Rifts.
7. End the cycle to auto-resolve all assigned Rift battles.
8. Claim any post-battle reward choices.
9. Repeat with newly generated Rifts.

## Core strategic pressures

- Troops can only act if they are not recovering.
- By default, only one troop from a faction may enter a given Rift.
- Victories and defeats both cause recovery; defeats take longer.
- Rifts are fully previewable before commitment.
- Battles are not player-controlled, so skill expression is in preparation and assignment.

## Current progression actions

- Unlock a new faction with essence.
- Unlock a new troop type within an unlocked faction with essence.
- Add units to an existing troop with gold.
- Buy troop stat upgrades with gold.
- Buy faction-wide upgrades with gold.
- Claim free faction-upgrade rewards from victorious Rifts.

## Currently implemented factions

- Humans
- Elves
- Goblins
- Trolls

## Platform target

- Primary: browser/web

Stretch goals mentioned in older docs such as multiplayer or mobile are not part of the current implementation.
