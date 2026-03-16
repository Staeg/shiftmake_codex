# Abilities

This document describes the implemented ability system and current ability catalog.

## Ability model

Each ability is defined by:

- `trigger`
- `duration`
- optional `target`
- `effects`
- optional `overworldEffectId`
- `shortText`

## Implemented timings

- `endOfTurn`
- `onAttack`
- `onDamaged`
- `onDeath`
- `onFallen`
- `onKill`
- `passive`
- `startOfBattle`
- `startOfTurn`

## Implemented durations

- `battle`
- `instant`
- `turns`

## Implemented target modes

- `aoe`
- `default`
- `random`
- `self`

## Implemented target filters

- `notTypes`
- `onlyTypes`
- `prioritizeTypes`
- `unengaged`

Filters match against a unit's combined primary `type` plus `attributes`.

## Implemented trigger modifiers

- `condition: 'forsaken'`
- `chargeEvery`
- `fallen: { allegiance, radius }`
- `maxUses`
- `repeatPerDistinctFriendlyTroopType`
- `repeatPerOtherFriendlyUnitOnHex`

Meaning:

- `condition: 'forsaken'` requires no other friendly troop types to be present
- `repeatPerDistinctFriendlyTroopType` counts distinct friendly primary types
- `repeatPerOtherFriendlyUnitOnHex` repeats once per other friendly unit on the same hex

## Implemented effects

### Blast

- damages all valid targets on the chosen hex or area

### Bolster

- increases max HP and current HP
- supports battle-long and temporary turn-based versions

### Haste

- increases speed

### Heal

- restores HP immediately

### Ramp

- increases damage

### Redirect

- creates engagements through normal capacity checks

### Rangeset

- sets range to a fixed value

### Roleset

- sets role to a fixed role

### Strike

- performs extra normal attacks

## Temporary effects

Turn-based timed effects currently support clean rollback for:

- `bolster`
- `haste`
- `ramp`
- `rangeset`
- `roleset`

## Current ability list

### Blast 5

- `onAttack`
- instant
- Effect: all enemies on the attacked hex take 5 damage

### Bonded

- passive
- Effect: dies when its summoner dies

### Enhance 1

- `endOfTurn`
- battle
- `target: random ally R`
- `target filter: notTypes: ['caster']`
- Effect: target gains +1 speed and +1 damage

### Forsaken 80

- `startOfBattle`
- battle
- `target: self`
- `trigger modifier: condition: 'forsaken'`
- Effect: +80% health, damage, and speed if no other friendly troop types are present

### Frenzy: Ramp 1

- `onDamaged`
- battle
- `target: self`
- Effect: gain +1 damage

### Fading

- passive
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
- Effect: heal allies within this unit's range by 4

### Pack 1

- `startOfTurn`
- turns 1
- `target: self`
- `trigger modifier: repeatPerOtherFriendlyUnitOnHex`
- Effect: gain +1 damage per other friendly unit on the hex until end of turn

### Power of Friendship

- `startOfBattle`
- battle
- `target: self`
- `trigger modifier: repeatPerDistinctFriendlyTroopType`
- Effect: +20% health, damage, and speed per other friendly troop type

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

### Shapeshift - Bear

- `endOfTurn`
- `trigger modifier: chargeEvery: 5`
- `trigger modifier: maxUses: 1`
- battle
- `target: self`
- Effects: +100 health, +5 speed, +20 damage, set range to 0, set role to frontline

### Summon X Y

- `startOfBattle`
- battle
- `target: self`
- Effect: creates X unit Y times on target's hex if possible, otherwise random hex adjacent to target

### Taunt

- `endOfTurn`
- instant
- `target: aoe enemy 0`
- `target filter: unengaged`
- Effect: redirect into engagements up to remaining capacity

### United

- passive
- overworld-only
- Effect: troops of this faction may enter the same Rift together

### Valor 20

- `onKill`
- instant
- `target: aoe ally 0`
- Effect: heal allies on this hex for 20

### Vengeance 1

- `onFallen`
- `trigger modifier: fallen: { allegiance: ally, radius: 0 }`
- battle
- `target: self`
- Effect: gain +1 speed and +1 damage
