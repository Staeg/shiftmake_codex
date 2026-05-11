# Abilities

This document describes the implemented battle ability architecture and representative authored abilities.

## Ability model

Each ability definition has:

- `trigger`
- `duration`
- optional `target`
- `effects`
- optional `overworldEffectId`
- `shortText`

## Implemented timings

- `startOfBattle`
- `startOfTurn`
- `endOfTurn`
- `onAttack`
- `onDamaged`
- `onKill`
- `onDeath`
- `onFallen`
- `onEffectApplied`
- `passive`

## Implemented trigger modifiers

- `chargeEvery`
- `maxUses`
- `condition: 'forsaken'`
- `repeatPerDistinctFriendlyTroopType`
- `repeatPerOtherFriendlyUnitOnHex`
- `fallen: { allegiance, radius, radiusSource? }`
- `effectApplication: { effectKinds?, dispositions? }`

Meaning:

- `condition: 'forsaken'` requires no other friendly troop types to be present.
- `repeatPerDistinctFriendlyTroopType` counts distinct friendly primary troop `type`s other than the acting unit's own.
- `repeatPerOtherFriendlyUnitOnHex` repeats once per other friendly unit on the acting unit's hex.
- `fallen.radiusSource: 'selfRange'` makes the fallen-unit trigger use the acting unit's resolved range.
- `effectApplication.effectKinds` filters reactions to successful applications of particular effect kinds such as `heal`.
- `effectApplication.dispositions` filters reactions to successful applications of beneficial, harmful, or neutral effects.

## Implemented durations

- `instant`
- `battle`
- `turns`

Turn-based timed rollback currently supports:

- `bolster`
- `haste`
- `ramp`
- `rangeset`
- `roleset`

## Implemented target modes

- `self`
- `random`
- `aoe`
- `default`

`default` currently means:

- on `onAttack`: the attacked unit
- on `onEffectApplied`: the unit that just received the successful effect application
- otherwise the effect's own built-in default resolution, if any

## Implemented target filters

- `notTypes`
- `onlyTypes`
- `prioritizeTypes`
- `unengaged`

Filters match against a unit's combined primary `type` plus `attributes`.

## Implemented effects

### Blast

- deals flat damage to all enemies on the attacked hex

### Bolster

- increases max HP and current HP

### Haste

- increases speed

### Heal

- restores HP immediately
- still counts as a successful heal-effect application even when it restores `0` HP

### Ramp

- increases damage

### StatDelta

- changes a named resolved stat directly for the current battle
- supports negative armor and other negative battle-long deltas where the stat rules permit it

### Rangeset

- sets range to a fixed value

### Roleset

- sets role to a fixed role

### InitiativeSet

- sets initiative to a fixed value

### GrantAbility

- adds a runtime ability to the target if it does not already have it

### Summon

- creates summoned units from the summoned unit's own native unit definition
- may optionally consume a fallen-unit corpse
- may optionally grant extra runtime abilities to the summoned lineage

### Redirect

- creates engagements through the normal capacity rules

### Strike

- performs extra attacks using strike classification

## Runtime interaction rules

### Effect dispositions

Effects may be marked as:

- `beneficial`
- `harmful`
- `neutral`

These dispositions are what `onEffectApplied` reactions filter on. This lets abilities like Shaman `Serve Once More` react to any future beneficial effects instead of hard-coding a specific source ability.

### Summon lineage

Summons can carry extra runtime abilities through the summon effect itself. If one of those granted abilities also summons with further granted abilities, the behavior propagates recursively down that summon lineage.

This is how:

- `Blood in the Water` propagates wolf replication
- `Mitosis` propagates elemental splitting
- `Rising Tide` propagates skeleton healing

### Corpse substitution

Corpse-consuming summon effects can be modified by passive abilities such as `Alternate Fuel`, which lets the actor spend health instead of requiring or consuming a corpse, but only if the payment is survivable.

### Attack categories

Attacks are classified at runtime as:

- `normal`
- `retaliation`
- `strike`

`Retaliate` only answers `normal` attacks, which prevents retaliation loops while still allowing ordinary on-attack and on-kill logic to function.

## Representative ability list

The authoritative catalog lives in `src/engine/unitCatalog.ts`. Unit-facing and upgrade-facing abilities are also summarized in `Unit details.md`; this section calls out the main reusable ability patterns rather than every authored passive helper.

### Alternate Fuel

- `passive`
- Effect: corpse-consuming summon abilities may spend 10 HP instead of requiring or consuming a corpse, if that would not kill the actor

### AoE Ally 0 Heal 7

- `endOfTurn`
- instant
- `target: aoe ally 0`
- Effect: heal allies on this hex for 7

### Blast 5

- `onAttack`
- instant
- Effect: all enemies on the attacked hex take 5 damage

### Bonded

- `passive`
- Effect: dies when its summoner dies

### Charge 4 Random Enemy R Strike 4

- `endOfTurn`
- instant
- `trigger modifier: chargeEvery: 4`
- `target: random enemy R`
- Effect: strike 4

### Charge 4 Summon Elemental

- `endOfTurn`
- battle
- `trigger modifier: chargeEvery: 4`
- `target: self`
- Effect: summon 1 elemental

### Charge 4 Uses 1 Summon Elemental

- `endOfTurn`
- battle
- `trigger modifier: chargeEvery: 4`
- `trigger modifier: maxUses: 1`
- `target: self`
- Effect: summon 1 elemental, and summoned elementals inherit the same once-only split ability

### Concussive Shots

- `onAttack`
- instant
- `target: default`
- Effect: set the attacked target's initiative to 0

### Corpse Summon Skeleton

- `onFallen`
- battle
- `trigger modifier: fallen: { allegiance: all, radius: 0, radiusSource: 'selfRange' }`
- Effect: consume a valid corpse in range to summon 1 skeleton

### Corpse Summon Skeleton (Rising Tide)

- `onFallen`
- battle
- `trigger modifier: fallen: { allegiance: all, radius: 0, radiusSource: 'selfRange' }`
- Effect: consume a valid corpse in range to summon 1 skeleton with `AoE Ally 0 Heal 7`

### Enhance 1

- `endOfTurn`
- battle
- `target: random ally R`
- `target filter: notTypes: ['caster']`
- Effect: target gains +1 speed and +1 damage

### Executioner

- `passive`
- Effect: prioritize the lowest-current-HP legal attack target

### Forsaken 80

- `startOfBattle`
- battle
- `target: self`
- `trigger modifier: condition: 'forsaken'`
- Effect: gain +80% health, damage, and speed if no other friendly troop types are present

### Frenzy: Ramp 1

- `onDamaged`
- battle
- `target: self`
- Effect: gain +1 damage

### Fading

- `passive`
- Effect: does not leave a corpse on death

### Goblin Farewell

- `onDeath`
- instant
- `target: random enemy 0`
- Effect: strike 1

### Mend 4

- `endOfTurn`
- instant
- `target: aoe ally R`
- Effect: heal allies within this unit's range for 4

### On Death Summon Skeleton

- `onDeath`
- instant
- `target: self`
- Effect: summon 1 skeleton

### On Kill Summon Wolf 1

- `onKill`
- battle
- `target: self`
- Effect: summon 1 wolf, and summoned wolves inherit the same ability

### Pack 1

- `startOfTurn`
- turns 1
- `target: self`
- `trigger modifier: repeatPerOtherFriendlyUnitOnHex`
- Effect: gain +1 damage per other friendly unit on this hex until end of turn

### Power of Friendship

- `startOfBattle`
- battle
- `target: self`
- `trigger modifier: repeatPerDistinctFriendlyTroopType`
- Effect: gain +20% health, damage, and speed per other friendly troop type

### Ramp 1

- `endOfTurn`
- battle
- `target: self`
- Effect: gain +1 damage

### Regen 5

- `endOfTurn`
- instant
- `target: self`
- Effect: heal self for 5

### Regen 60

- `endOfTurn`
- instant
- `target: self`
- Effect: heal self for 60

### Retaliate

- `passive`
- Effect: when hit by a normal attack, make one normal retaliation attack

### Scurry

- `passive`
- Effect: ignore allied saturation limits for spawning and movement occupancy checks

### Serve Once More

- `onEffectApplied`
- battle
- `trigger modifier: effectApplication: { dispositions: ['beneficial'] }`
- `target: default`
- Effect: the same target gains `Fading` and `On Death Summon Skeleton`

### Shapeshift - Bear

- `endOfTurn`
- battle
- `target: self`
- `trigger modifier: chargeEvery: 5`
- `trigger modifier: maxUses: 1`
- Effects: +100 health, +5 speed, +20 damage, set range to 0, set role to frontline

### Shredding Arrows

- `onAttack`
- battle
- `target: default`
- Effect: reduce the attacked target armor by 1 for the battle

### Summon Wolf 2

- `startOfBattle`
- battle
- `target: self`
- Effect: summon 2 wolves

### Summon Wolf 2 (Blood in the Water)

- `startOfBattle`
- battle
- `target: self`
- Effect: summon 2 wolves, each with `On Kill Summon Wolf 1`

### Taunt

- `endOfTurn`
- instant
- `target: aoe enemy 0`
- `target filter: unengaged`
- Effect: redirect into engagements up to remaining capacity

### United

- `passive`
- overworld-only
- Effect: troops of this faction may enter the same Rift together

### Uses 7 Corpse Summon Skeleton

- `onFallen`
- battle
- `trigger modifier: fallen: { allegiance: all, radius: 0, radiusSource: 'selfRange' }`
- `trigger modifier: maxUses: 7`
- Effect: summon 1 skeleton from a valid corpse, up to 7 times

### Valor 20

- `onKill`
- instant
- `target: aoe ally 0`
- Effect: heal allies on this hex for 20

### Vengeance 1

- `onFallen`
- battle
- `trigger modifier: fallen: { allegiance: ally, radius: 0 }`
- `target: self`
- Effect: gain +1 speed and +1 damage

### Vengeance 3

- `onFallen`
- battle
- `trigger modifier: fallen: { allegiance: ally, radius: 0 }`
- `target: self`
- Effect: gain +3 speed and +3 damage

### Zeal

- `onEffectApplied`
- battle
- `trigger modifier: effectApplication: { effectKinds: ['heal'] }`
- `target: default`
- Effect: after this unit successfully applies a heal effect, the same target gains +1 speed and +1 damage
