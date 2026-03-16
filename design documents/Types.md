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
- ability filters such as `Only`, `Not`, and `Prio`
- troop identity in replays and tooltips

## Attributes

Combatants also have secondary `attributes`, for example:

- combat style tags: `melee`, `ranged`, `caster`
- faction tags: `human`, `elf`, `goblin`, `troll`
- special traits: `expendable`

Ability target filters match against the combined visible identity set of:

- the primary `type`
- all `attributes`

That means a filter for `caster` matches shamans, druids, and wizards, while a filter for `archer` only matches the primary archer type.

## Upgradeable stats by unit type

All unit types can upgrade:

- health
- damage

Additional implemented upgrade permissions:

- `champion`: speed
- `wizard`: speed
- `archer`: range
- `soldier`: armor
- `knight`: armor

No faction attribute currently unlocks extra stat-upgrade categories on its own.
