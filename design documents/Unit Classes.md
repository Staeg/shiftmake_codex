# Unit Classes

This document describes the meaning of unit `unitClassTag` and `attributes` in the current implementation.

## Primary Unit Class

Every combatant has exactly one primary `unitClassTag`, for example:

- `soldier`
- `archer`
- `wizard`
- `champion`

Primary unit class matters for:

- Combined Arms counting
- draft bucketing for troop-class upgrades
- ability filters such as `Only`, `Not`, and `Prio`
- troop identity in replays and tooltips

## Attributes

Combatants also have secondary `attributes`, for example:

- combat style tags: `melee`, `ranged`, `caster`
- race tags: `human`, `elf`, `goblin`, `troll`, `dwarf`, `orc`, `fae`
- special traits: `expendable`, `summoner`, `summoned`

Ability target filters match against the combined visible identity set of:

- the primary `unitClassTag`
- all `attributes`

That means a filter for `caster` matches shamans, druids, and wizards, while a filter for `archer` only matches the primary archer unit class.

## Upgrade matching

Troop-class upgrades key off the primary unit `unitClassTag`, not race.

Examples:

- `Crippling Shots` applies to all Archers
- `R-selected` applies to all Militia
- `Storm Rods` applies to all Wizards

Race upgrades key off race only and can modify:

- abilities
- attributes
- stats, optionally only for non-melee troops

There are no troop stat-upgrade permissions anymore because stat upgrades were removed from the game.
