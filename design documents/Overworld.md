# Overworld (draft)

This document defines the strategic layer that sits between battles.

## Design goals

* Prioritize readable, low-friction decision-making.
* Keep risk/reward legible before commitment.
* Encourage long-term planning through faction cooldown pressure, not hidden information.
* Make phase transitions explicit so players always know what actions are available.

## Core loop

1. New Rifts appear. Number and tier are described in Rifts.md.
2. Player inspects Rift threats/rewards.
3. Player spends resources in management/upgrades.
4. Player assigns available troops to selected Rifts.
5. Assigned battles resolve (with replay access).
6. Rewards from winning Rift battles are granted. Details in Rifts.md.
7. Recovery timers advance; 
8. Next cycle begins.

## Global state shown at all times

* Current cycle/turn number.
* Total resources by type: Gold and Essence.
* Number of active (assigned to this cycle's Rifts) troops, recovering troops, and idle troops.

Available actions:

* Spend resources on upgrades and unlocks.
* Select one troop and assign it to one Rift.
* Reassign locked troops.
* Confirm assignments and resolve Rift battles, thus starting a new cycle.

## Suggested interface layout

## Top bar

* Left: cycle number, gold, essence.
* Center: select what the center panel displays (Rifts, Factions & Troops)
* Right: settings, help, replay archive.

## Center panel (Rift canvas)

* Overworld map with Rift nodes.
* Currently available Rifts closer to bottom.
* Rifts from last two cycles above that, slightly decreasing in size.
* Hover state: quick summary tooltip; shows tier, types of rewards and enemy troop sizes and types.
* Click state: full Rift detail card on left panel; exact numbers for rewards, enemy troops display stats and abilities.

## Center panel (Factions & Troops canvas)

* Existing factions spread out with their recruited troops arrayed below a structure which matches the style of the faction.
* Below each troop is a yellow plus sign, which can be clicked to buy a new unit for the troop. Its gold cost is below it with red numbers if you don't have enough gold, otherwise it's yellow.
* To the right of each faction's troops is a green plus sign, which can be clicked to buy a new troop. Its essence cost is below it with red numbers if you don't have enough essence, otherwise it's teal.
* In a space to the right of all existing factions is a larger blue plus sign, which can be clicked to buy a new faction. Its essence cost is below it with red numbers if you don't have enough essence, otherwise it's teal.

## Left panel (context panel)

This panel changes by selected context:

* Rift selected: full enemy preview, rewards.
* Troop selected: stats, abilities, type-specific upgrades, faction-specific upgrades, readiness. Below those are available upgrades for that troop type, whose gold cost is below them with red numbers if you don't have enough gold, otherwise they're yellow.
* Faction selected: stat modifiers this faction gives its troops, troop types already enlisted and greyed out ones that are available for purchase, existing faction-wide upgrades. Below those are available upgrades for that faction, whose gold cost is below them with red numbers if you don't have enough gold, otherwise they're yellow.
* Nothing selected: assignment summary with committed pairings, unresolved conflicts (Rifts where two troops of the same faction are assigned) and unassigned troops.

## Right panel (hover panel)

This panel changes by what the cursor is hovering over:

* Upgrade hovered: detailed information about the upgrade
* None of the above hovered: battle log, where clicking a battle allows watching it.
* 

## Bottom action rail

Primary actions based on currently selected object:

* Assignment: `Update Assignments`
* Battle: `Watch Battle`
* Upgrade: `Upgrade [troop type]'s [stat]` or `Upgrade [faction]`
* Unlock: `Unlock [faction troop]` or `Unlock [faction troop]'s [ability]` or  `Unlock [faction troop]`
* Nothing selected: `End cycle`

## UX behavior and guardrails

* Primary action button should always state current phase intent (never generic "Continue").
* Illegal assignments must be blocked with explicit, localized error messages.
* Any action that ends a phase should show a short confirmation summary.
* Replays must remain accessible after phase transitions.

## Data and balancing hooks (draft)

* Rift generation seed per cycle for deterministic debugging.
* Threat budget per cycle (grows over time).
* Reward budget per cycle tied to threat and biome modifiers.
* Recovery duration multipliers based on outcome and troop state.