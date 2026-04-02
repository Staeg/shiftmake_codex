# Types

This document describes the meaning of unit `type` and `attributes` in the current implementation.

## Primary type

Every combatant has exactly one primary `type`, for example:

- `soldier`
- `archer`
- `wizard`
- `champion`

Primary type matters for:

- Combined Arms counting
- draft bucketing for troop-type upgrades
- ability filters such as `Only`, `Not`, and `Prio`
- troop identity in replays and tooltips

## Attributes

Combatants also have secondary `attributes`, for example:

- combat style tags: `melee`, `ranged`, `caster`
- faction tags: `human`, `elf`, `goblin`, `troll`
- special traits: `expendable`, `summoner`, `summoned`

Ability target filters match against the combined visible identity set of:

- the primary `type`
- all `attributes`

That means a filter for `caster` matches shamans, druids, and wizards, while a filter for `archer` only matches the primary archer type.

## Upgrade matching

Troop-type upgrades key off the primary unit `type`, not faction.

Examples:

- `Shredding Arrows` applies to all Archers
- `Scurry` applies to all Militia
- `Storm` applies to all Wizards

Faction upgrades key off faction only and can modify:

- abilities
- attributes
- stats, optionally only for non-melee troops

There are no troop stat-upgrade permissions anymore because stat upgrades were removed from the game.
