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
- `repeatPerDistinctFriendlyTroopClass`
- `repeatPerDistinctFriendlyTroop`
- `repeatPerTouchingFriendlyUnit`
- `fallen: { allegiance, radius, radiusSource? }`
- `effectApplication: { effectKinds?, dispositions? }`

Meaning:

- `condition: 'forsaken'` requires the unit to be in the only troop on its side.
- `repeatPerDistinctFriendlyTroopClass` counts distinct friendly primary troop classes other than the acting unit's own.
- `repeatPerDistinctFriendlyTroop` counts distinct friendly troop groups other than the acting unit's own.
- `repeatPerTouchingFriendlyUnit` repeats once per other friendly unit whose footprint touches the acting unit's footprint.
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

- `notClasses`
- `onlyClasses`
- `prioritizeClasses`
- `unengaged`

Filters match against a unit's combined primary `unitClassTag` plus `attributes`.

## Implemented effects

### Blast

- deals flat damage to all enemies within 2 hexes of the target's occupied hexes

### Bolster

- increases max HP and current HP

### Haste

- increases rate

### Heal

- restores HP immediately
- Mercy Before Dawn uses the heal pipeline when it preserves a dying ally, so heal synergies and healing reductions apply to that save
- Mercy Before Dawn also repeats Priest heals on allies in range below 10% health

### Ramp

- increases damage

### StatDelta

- changes a named resolved stat directly for the current battle
- supports negative armor and other negative battle-long deltas where the stat rules permit it

### Rangeset

- sets range to a fixed value

### Roleset

- sets role to a fixed role

### ReadinessSet

- sets readiness to a fixed value

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

These dispositions are what `onEffectApplied` reactions filter on. This lets effects inside `Grave Vigor` react to any future beneficial effects instead of hard-coding a specific source ability.

### Summon lineage

Summons can carry extra runtime abilities through the summon effect itself. If one of those granted abilities also summons with further granted abilities, the behavior propagates recursively down that summon lineage.

This is how:

- `Thrill of the Hunt` applies wolf replication as a side-wide wolf synergy
- `Crackling Mitosis` propagates elemental splitting
- `Hemomancy` gives healing to allied summoned Skeletons from any source

### Corpse substitution

Corpse-consuming summon effects can be modified by passive abilities such as `Hemomancy`, which lets the actor spend health instead of requiring or consuming a corpse, but only if the payment is survivable.

### Attack categories

Attacks are classified at runtime as:

- `normal`
- `retaliation`
- `strike`

`Dine in Hell` retaliation only answers `normal` attacks while the Knight is engaged at full capacity, which prevents retaliation loops while still allowing ordinary on-attack and on-kill logic to function.

## Representative ability list

The authoritative catalog lives in `src/engine/unitCatalog.ts`. Unit-facing and upgrade-facing abilities are also summarized in `Unit details.md`; this section calls out the main reusable ability patterns rather than every authored passive helper.

### Hemomancy

- `passive`
- Effect: corpse-consuming summon abilities may spend 10 HP instead of requiring or consuming a corpse, if that would not kill the actor

### AoE Ally 0 Heal 7

- `endOfTurn`
- instant
- `target: aoe ally 0`
- Effect: heal touching allies for 7

### Blast 5

- `onAttack`
- instant
- Effect: all enemies within 2 hexes of the target's occupied hexes take 5 damage

### Bonded

- `passive`
- Effect: dies when its summoner dies

### Charge 4 Random Enemy R Strike 2

- `endOfTurn`
- instant
- `trigger modifier: chargeEvery: 4`
- `target: random enemy R`
- Effect: strike 2; each strike resolves on-attack effects such as `Blast`

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
- Effect: set the attacked target's readiness to 0

### Bolstering Light

- `passive`
- Effect: if a Priest heal brings the target to full HP, the target and the Priest gain +1 rate and +1 damage for the battle; otherwise, the target and the Priest gain 40 readiness

### Corpse Summon Skeleton

- `onFallen`
- battle
- `trigger modifier: fallen: { allegiance: all, radius: 0, radiusSource: 'selfRange' }`
- Effect: consume a valid corpse in range to summon 1 skeleton

### Corpse Summon Skeleton (Hemomancy)

- `onFallen`
- battle
- `trigger modifier: fallen: { allegiance: all, radius: 0, radiusSource: 'selfRange' }`
- Effect: consume a valid corpse in range to summon 1 skeleton. If that side owns `Hemomancy`, the summoned Skeleton gains `AoE Ally 0 Heal 7`; this also applies to allied Skeletons summoned by other sources.

### Explosion Corpse

- `passive`
- Effect: skeletons summoned by this unit spawn with 100 readiness; whenever this unit consumes a corpse, enemies adjacent to that corpse's hex lose 1 armor and 1 damage for the battle

### Enhance 1

- `endOfTurn`
- battle
- `target: random ally R`
- `target filter: notClasses: ['caster']`
- Effect: target gains +1 rate and +1 damage

### Executioner

- `passive`
- Effect: prioritize the lowest-current-HP legal attack target

### Forsaken 80

- `startOfBattle`
- battle
- `target: self`
- `trigger modifier: condition: 'forsaken'`
- Effect: gain +80% health, damage, and rate if this is the only troop on its side

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

### Grave Vigor

- `passive`
- Effect: after this unit beneficially affects an ally, that ally ignores future beneficial effects and targeting from units with `Grave Vigor`
- With `War Drums`, every ally on the chosen hex receives the Grave Vigor bonuses first, then each becomes ineligible for later Grave Vigor targeting and beneficial effects

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

### Thrill of the Hunt

- passive
- Side-wide wolf synergy: whenever an allied Wolf gets a kill, that Wolf summons 1 Wolf and all allies gain +1 damage for the battle

### Pack 1

- `startOfTurn`
- turns 1
- `target: self`
- `trigger modifier: repeatPerTouchingFriendlyUnit`
- Effect: gain +1 damage per other touching friendly unit until end of turn

### Power of Friendship

- `startOfBattle`
- battle
- `target: self`
- `trigger modifier: repeatPerDistinctFriendlyTroop`
- Effect: gain +20% health, damage, and rate per other friendly troop on this side

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

### Forest Friends

- `passive`
- Effect: end of turn, heal self and all units Bonded to this specific unit for 20; whenever this unit shapeshifts, summon 2 wolves

### Retaliate

- `passive`
- Effect: when hit by a normal attack while engaged at full capacity, make one normal retaliation attack

### Grave Vigor Corpse Mark

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
- Effects: +100 health, +5 rate, +20 damage, set range to 0, set role to frontline

### Crippling Shots

- `onAttack`
- battle
- `target: default`
- Effect: reduce the attacked target armor by 1 and rate by 1 for the battle

### Barrage

- passive
- While unengaged, Archers attack all legal enemies in range at 60% damage

### Hexing Shots

- passive
- Archer attacks deal +1 damage per Hex stack on the target

### Honorable Duel

- passive
- Champions cannot be targeted by normal attacks unless the attacker is engaged with them

### Dreamwork

- passive
- Once per beat, Soldiers attack an adjacent enemy when another ally hits that enemy with a normal attack

### Wages of Virtue

- passive
- Avengers redirect incoming normal attack damage to a random touching ally if possible; redirect chains track visited units so they cannot loop forever
- When a touching ally is actually healed, the Avenger receives the same amount of healing without causing a recursive heal loop

### Throwing Axes

- passive
- Beastmasters become ranged backline attackers and add damage equal to 10% of the target's current HP before normal attack damage is resolved

### Opening

- passive
- When a Beastmaster hits an enemy, allies touching the target also make normal attacks against that enemy; each Beastmaster-target pair can trigger once per attack chain

### Triumphant Zeal

- passive
- When a Champion kills an enemy, the Champion and touching allies gain 1 stack of Zeal
- Zeal gives allies +10% damage, +10% rate, and +10% max HP per stack

### Hunter's Zeal

- passive
- When a Ranger kills an enemy, the Ranger and allies adjacent to the killed enemy gain 1 stack of Zeal
- At end of turn, allies gain 5 readiness per Zeal stack

### Martyr's Zeal

- passive
- When a Soldier dies, all allies gain 1 stack of Zeal
- At end of turn, allies heal 5 health per Zeal stack

### Crippling Hex

- passive
- Enemies who kill Militia gain 1 stack of Hex
- Enemies lose 30% rate per Hex stack

### Vulnerability Hex

- passive
- If a Wizard is present, enemies damaged by Blast have a 20% chance to gain 1 stack of Hex
- Enemies take an additional 100% Blast damage per Hex stack

### Gargantuan Zeal

- passive
- When a Troll is present, a random unit from each allied troop gains 1 stack of Zeal at battle start
- Allies gain damage equal to `5 x size` per Zeal stack

### Overwhelm Hex

- passive
- When a Goblin is present, a random unit from each enemy troop gains 1 stack of Hex at battle start
- Enemies lose health equal to your living Goblins per Hex stack at end of turn

### Crack Exploits

- passive
- Elementalists lose 5 damage; when an enemy actually loses armor, each allied Elementalist makes a normal attack against that enemy ignoring range
- Allied Elementals remove 1 armor on attack

### Saintbane

- passive
- When an enemy actually heals or gains positive stats, adjacent corpses are raised as allied Skeletons

### Holy Constructs

- passive
- While an allied Priest is present, the first actual heal on each non-`Fading` ally summons an Elemental adjacent to that ally
- Allied Elementals heal touching allies for 20 when they die

### Final Hex

- passive
- Shaman attacks add 1 `Hexed` stack; attacking a target that already has 5 stacks kills it directly

### Summon Wolf 2

- `startOfBattle`
- battle
- `target: self`
- Effect: summon 2 wolves

### Summon Wolf 1

- `startOfBattle`
- battle
- `target: self`
- Effect: summon 1 wolf

### Taunt

- `endOfTurn`
- instant
- `target: aoe enemy 0`
- `target filter: unengaged`
- Effect: redirect into engagements up to remaining capacity

### United

- `passive`
- overworld-only
- Effect: troops of this race may enter the same Rift together

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
- Effect: heal touching allies for 20

### Vengeance 1

- `onFallen`
- battle
- `trigger modifier: fallen: { allegiance: ally, radius: 0 }`
- `target: self`
- Effect: gain +1 rate and +1 damage

### Vengeance 3

- `onFallen`
- battle
- `trigger modifier: fallen: { allegiance: ally, radius: 0 }`
- `target: self`
- Effect: gain +3 rate and +3 damage
