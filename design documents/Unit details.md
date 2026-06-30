# Unit Details

This document lists the current base unit classes before race modifiers, race upgrades, or troop-class upgrades are applied.

Summoned units do not have their own unlockable upgrades.

## Stat meanings

- `unitClassTag`: primary unit class identity
- `attributes`: secondary tags
- `health`: HP before death
- `damage`: base normal attack damage
- `speed`: initiative gained each beat
- `move`: how many legal hexes a unit can travel during ordinary movement and special repositioning
- `range`: hex attack distance, with `0` meaning melee
- `armor`: flat adjustment to incoming normal attack damage; negative armor increases damage taken
- `size`: footprint scale and how much enemy capacity is needed to engage the unit
- `capacity`: how much total enemy size the unit can engage
- `role`: autonomous behavior profile
- `cost`: base troop cost before race cost modifiers
- `quantity`: derived after race resolution as `120 / resolved cost`

Footprint sizes:

- Size 1 occupies one hex.
- Size 2 occupies a north- or south-facing 3-hex triangle.
- Size 3 occupies a 7-hex radius-1 footprint.
- Size 4 occupies the size-2 triangle plus one surrounding layer.
- Size 5 occupies a 19-hex radius-2 footprint.

## Base Unit Classes

### Archer

- Attributes: `ranged`
- Stats: health 30, damage 11, speed 11, move 3, range 5, armor 0, size 2, capacity 0
- Role: backline
- Abilities: none
- Cost: 20
- Troop upgrades:
  - `Crippling Shots` (tier 3): on attack, reduce the target armor by 1 and speed by 1 for the battle
  - `Barrage` (tier 3): while not engaged in melee, shoot all enemies in range, but deal 40% less damage
  - `Hexing Shots` (tier 3): Archer attacks deal +1 damage per Hex stack on the target

### Avenger

- Attributes: `melee`
- Stats: health 200, damage 6, speed 10, move 2, range 0, armor 0, size 3, capacity 1
- Role: frontline
- Abilities: `Vengeance 3`
- Cost: 40
- Troop upgrades:
  - `Sevenfold` (tier 2): consume nearby corpses to summon skeletons, up to 7 times
  - `Witness` (tier 3): when a nearby ally falls, set initiative to 100; when an ally dies touching the Avenger, strike the killer once if it is still there
  - `Wages of Virtue` (tier 3): redirect incoming damage to a random touching ally if possible; when a touching ally is healed, the Avenger is healed too

### Beastmaster

- Attributes: `melee`, `summoner`
- Stats: health 90, damage 8, speed 8, move 3, range 0, armor 0, size 3, capacity 1
- Role: frontline
- Abilities: `Summon Wolf 2`
- Cost: 60
- Troop upgrades:
  - `Throwing Axes` (tier 3): gain 4 range; attacks deal additional damage equal to 10% of the enemy's current health
  - `Opening` (tier 3): when a Beastmaster hits an enemy, all allies adjacent to the target also attack that enemy
  - `Thrill of the Hunt` (tier 3): Wolves summon 1 Wolf on each kill; whenever any allied wolf gets a kill, all allies gain +1 damage for the battle

### Champion

- Attributes: `melee`
- Stats: health 130, damage 20, speed 17, move 3, range 0, armor 0, size 3, capacity 1
- Role: frontline
- Abilities: `Valor 20`
- Cost: 60
- Troop upgrades:
  - `Anointed Executioner` (tier 3): target the lowest-HP legal enemy; healing and positive stat gains affecting the Champion are doubled
  - `Honorable Duel` (tier 3): Champions cannot be targeted by normal attacks from enemies they are not engaged with
  - `Triumphant Zeal` (tier 3): on kill, the Champion and touching allies gain a stack of Zeal; allies gain +10% damage, +10% speed, and +10% max health per Zeal stack

### Druid

- Attributes: `caster`
- Stats: health 25, damage 11, speed 8, move 3, range 5, armor 0, size 2, capacity 0
- Role: backline
- Abilities: `Shapeshift - Bear`
- Cost: 30
- Troop upgrades:
  - `Forest Friends` (tier 3): end of turn, heal self and all units Bonded to that specific Druid for 20; each shapeshift summons 2 wolves
  - `True Form` (tier 2): shapeshift can trigger a second time
  - `Ent's Visage` (tier 3): after shapeshifting, normal attackers take 6 damage when they hit the Druid; each shapeshift empowers the Druid so its melee hits apply an additional battle-long `-2 speed`

### Elemental

- Attributes: `melee`, `summoned`
- Stats: health 60, damage 13, speed 7, move 2, range 0, armor 5, size 2, capacity 3
- Role: frontline
- Abilities: none
- Cost: 20

### Elementalist

- Attributes: `caster`, `summoner`
- Stats: health 25, damage 10, speed 9, move 3, range 5, armor 0, size 2, capacity 0
- Role: backline
- Abilities: `Charge 4 Summon Elemental`
- Cost: 30
- Troop upgrades:
  - `Crackling Mitosis` (tier 3): when an allied elemental dies, blast enemies within 2 hexes of its occupied hexes for 8; each summoned elemental can repeat the elemental summon once
  - `Living Circuit` (tier 3): end of turn, the Elementalist gains 15 initiative once if any allied elemental is in range, and all allied elementals in range gain 15 initiative
  - `Crack Exploits` (tier 3): Elementalists lose 5 damage; when an enemy loses armor, each allied Elementalist attacks it ignoring range; allied elementals remove 1 armor on attack

### Knight

- Attributes: `melee`
- Stats: health 200, damage 16, speed 7, move 2, range 0, armor 10, size 3, capacity 5
- Role: frontline
- Abilities: `Taunt`
- Cost: 60
- Troop upgrades:
  - `Dine in Hell` (tier 3): start of turn, if engaged at full capacity, gain +5 armor until next turn; while engaged at full capacity, answer normal attacks with one normal attack
  - `Sentinel Runes` (tier 3): the first enemy to move out of contact with the Knight causes 2 elementals to be summoned at its new position; they immediately engage and attack that unit. If unused, this triggers on death against the killer instead
  - `Sunder` (tier 3): Knights remove 20 armor on attack

### Militia

- Attributes: `melee`, `expendable`
- Stats: health 40, damage 8, speed 11, move 4, range 0, armor 0, size 2, capacity 1
- Role: Pusher
- Abilities: none
- Cost: 10
- Troop upgrades:
  - `R-selected` (tier 3): start of turn, gain +10 initiative per other Militia touching them; multiple Militia troops may enter the same Rift
  - `Dogpile` (tier 3): attacks against enemies engaged by at least 3 allies strike 1 extra time
  - `Crippling Hex` (tier 3): enemies who kill Militia gain 1 stack of Hex; enemies get -30% speed for each Hex stack

### Necromancer

- Attributes: `caster`, `summoner`
- Stats: health 40, damage 16, speed 8, move 3, range 5, armor 0, size 2, capacity 0
- Role: backline
- Abilities: `Corpse Summon Skeleton`
- Cost: 40
- Troop upgrades:
  - `Hemomancy` (tier 3): may spend 10 HP instead of consuming a corpse; allied summoned Skeletons heal allies touching them for 7 each turn
  - `Explosion Corpse` (tier 3): summoned skeletons spawn with 100 initiative; consuming a corpse makes enemies adjacent to that corpse lose 1 armor and 1 damage for the battle
  - `Saintbane` (tier 3): whenever an enemy heals or gains stats, raise all corpses adjacent to them as allied Skeletons

### Priest

- Attributes: `caster`
- Stats: health 25, damage 7, speed 8, move 3, range 5, armor 0, size 2, capacity 0
- Role: backline
- Abilities: `Mend 4`
- Cost: 20
- Troop upgrades:
  - `Bolstering Light` (tier 3): when a Priest heal brings its target to full HP, that target and the Priest gain +1 speed and +1 damage for the battle; otherwise, that target and the Priest gain 40 initiative
  - `Mercy Before Dawn` (tier 3): the first time each battle an ally in range would die, it survives at 1 HP; whenever a Priest heals an ally, the heal repeats on all allies in range under 10% health
  - `Holy Constructs` (tier 3): while a Priest is present, the first time each non-`Fading` ally is actually healed, summon an Elemental adjacent to them; allied Elementals heal adjacent allies for 20 on death

### Ranger

- Attributes: `ranged`
- Stats: health 50, damage 16, speed 13, move 4, range 7, armor 0, size 2, capacity 0
- Role: backline
- Abilities: `Self Haste 2`
- Cost: 60
- Troop upgrades:
  - `On the Hunt` (tier 3): on attack, set the target initiative to 0; the first 2 kills against non-`Fading` enemies consume the corpse and summon a wolf there
  - `Shadow's Embrace` (tier 3): after ranged attacks, move to a safer hex that still keeps an enemy in range; attacks against unengaged targets deal double damage
  - `Hunter's Zeal` (tier 3): on kill, Rangers and allies adjacent to the killed enemy gain a stack of Zeal; allies gain 5 initiative per Zeal stack at end of turn

### Shaman

- Attributes: `caster`
- Stats: health 20, damage 11, speed 8, move 3, range 5, armor 0, size 2, capacity 0
- Role: backline
- Abilities: `Enhance 1`
- Cost: 20
- Troop upgrades:
  - `War Drums` (tier 2): `Enhance 1` affects all allies on the chosen allied hex
  - `Grave Vigor` (tier 3): beneficial effects also make the target summon a skeleton on death and leave no corpse; `Enhance` gives affected allies 1 extra strike on their next normal attack; targets affected by any beneficial effect from a Grave Vigor Shaman ignore future beneficial effects and targeting from Grave Vigor Shamans
  - `Final Hex` (tier 3): Shaman attacks apply 1 stack of `Hexed`; attacking an enemy with 5 stacks kills it directly

### Skeleton

- Attributes: `melee`, `summoned`
- Stats: health 40, damage 13, speed 7, move 3, range 0, armor 0, size 2, capacity 1
- Role: Pusher
- Abilities: `Bonded`, `Fading`
- Cost: 20

### Soldier

- Attributes: `melee`
- Stats: health 100, damage 10, speed 10, move 3, range 0, armor 2, size 2, capacity 2
- Role: frontline
- Abilities: none
- Cost: 24
- Troop upgrades:
  - `Shield Drill` (tier 3): Soldiers have -4 armor, but each ranged attack can deal at most 1 damage to a Soldier after all modifiers
  - `Dreamwork` (tier 3): once per beat, Soldiers attack an adjacent enemy when that enemy is hit by another ally's normal attack
  - `Martyr's Zeal` (tier 3): when a Soldier dies, all allies gain a stack of Zeal; at end of turn, allies heal 5 health per Zeal stack

### Wizard

- Attributes: `caster`
- Stats: health 20, damage 9, speed 8, move 3, range 5, armor 0, size 2, capacity 0
- Role: backline
- Abilities: `Blast 5`
- Cost: 20
- Troop upgrades:
  - `Storm Rods` (tier 3): every 4 turns, make 2 extra strikes against a random enemy in range; `Blast` deals +1 damage per allied elemental anywhere on the battlefield, and Wizards summon 1 elemental at battle start
  - `Spell Echo` (tier 2): each `Blast` echoes from every enemy hit by that `Blast` or its echoes, but each enemy can be hit only once per `Blast` chain
  - `Vulnerability Hex` (tier 3): if a Wizard is present, enemies damaged by `Blast` have a 20% chance to gain a stack of Hex; each Hex stack makes that enemy take an additional 100% damage from `Blast`

### Wolf

- Attributes: `melee`, `summoned`
- Stats: health 70, damage 6, speed 12, move 4, range 0, armor 0, size 2, capacity 1
- Role: Pusher
- Abilities: `Bonded`, `Pack 1`
- Cost: 20

## Current race upgrades

### Humans

- `Tubthumping` (tier 1): multiple Human troops may enter the same Rift; harmful damage or speed reductions become `+1` instead
- `Combined Arms` (tier 2): gain +20% health, damage, and speed for each other friendly troop on its side
- `Hold the Standard` (tier 2): whenever a non-`Fading` ally dies, each Human unit heals 15

### Elves

- `Feline Grace` (tier 1): all non-melee Elven troops gain +2 range; the first time an Elven backline unit is engaged each battle, it retreats 1 hex for free
- `Forsaken` (tier 3): if this is the only troop on its side, gain +80% health, damage, and speed
- `Silvershot Doctrine` (tier 2): ranged and caster attacks gain +1 damage and +2 initiative per hex of distance; attacks made from max range make the target lose 30 initiative

### Goblins

- `Gallowsworn` (tier 1): on death, make 1 extra strike against a random touching enemy; on kill, all enemies lose 10 initiative
- `Horde` (tier 2): start of turn, gain +4 damage per other friendly unit touching it until end of turn
- `Overwhelm Hex` (tier 1): when a Goblin is present, a random unit from each enemy troop gains 1 stack of Hex at battle start; enemies lose health equal to your living Goblins per Hex stack at end of turn

### Trolls

- `Gargantuan Zeal` (tier 1): when a Troll is present, a random unit from each allied troop gains 1 stack of Zeal at battle start; allies gain damage equal to `5 x size` per Zeal stack
- `Mossblood` (tier 2): after taking damage, gain +1 damage for the battle; the first lethal hit leaves the Troll alive at 25 HP and removes `Regen 5`
- `Rowdy Regrowth` (tier 2): whenever a Troll regains health, it gains 20 initiative and +1 damage

### Dwarves

- `Diggy Hole` (tier 1): Dwarven units do not spawn at battle start; after 10 beats, they spawn on the enemy side of the board with 100 initiative
- `Ale and Hearty` (tier 2): Dwarven troops gain +60% speed, but one random unit from each Dwarven troop has speed set to 1 at combat start
- `Stall Warts` (tier 3): Dwarven troops gain +1 armor and lose 1 speed for the battle after they are hit by normal attacks

### Orcs

- `Seeing Red` (tier 1): whenever an Orc kills an enemy unit, it loses 1 armor for the battle and gains 75 initiative
- `First Blood` (tier 2): Orc units make an immediate normal attack when they engage, before the normal engagement attack
- `Berserk` (tier 3): when an Orc would die from damage, it becomes immune to damage, has its initiative set to 0, and dies at the end of its next turn

### Fae

- `Glamour` (tier 2): once per battle per Fae unit, redirect an incoming normal attack to a random enemy in range; triggered attack effects resolve as though the Fae made the attack
- `Changeling` (tier 3): if a Fae troop was brought to battle, after beat 12 one random enemy unit from each enemy troop changes sides
- `Whimsy` (tier 3): whenever a Fae unit takes damage, it relocates to a random hex

## Notes

- Base unit costs are race-neutral. Resolved troop cost can change after race modifiers.
- Because quantity is derived from resolved cost, Goblin troops are usually larger than equivalent troops from other races.
- Stat upgrades were removed from the game. Only race upgrades and troop-class upgrades remain.
- Some summon-facing upgrades are side-wide in battle resolution. For example, wolves created by Druids or Rangers still benefit from owned wolf synergies such as `Thrill of the Hunt`, even if no Beastmaster is present in that battle.
