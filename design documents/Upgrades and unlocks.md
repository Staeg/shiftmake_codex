# Upgrades and unlocks

This document describes the current progression system.

## Currency

The only progression currency is `Essence`.

Current rules:

- the two opening faction choices are free, and each selected faction grants its preselected starting troop
- each cycle grants `+2` Essence after battles resolve
- revealing a combined troop-and-upgrade draft costs `2` Essence when both sides still have options
- a one-sided draft fallback costs `1` Essence if only troop unlocks or only upgrade unlocks remain
- claiming options from a revealed draft costs no additional Essence
- unused Essence carries over between cycles

Removed from the progression model:

- gold
- buying units
- stat upgrades
- faction unlock purchases
- blueprints
- post-battle reward claims

## Unlocking troops

Each unlocked faction has a native troop roster that can appear in normal troop offers.

Off-roster faction-and-troop combinations are not part of the normal pool by default. They enter a latent future-unlock pool by winning Rifts that contain those combinations.

Owning any troop from a faction marks that faction as owned for draft bucketing.

Current roster rule:

- the campaign keeps at most one troop per `faction/unitType` combination
- claiming a troop unlock immediately adds that troop to the player's roster if it is not already owned
- Rift-earned off-roster unlocks do not immediately add a troop
- latent Rift-earned combinations only become normal troop-offer candidates after their faction is unlocked

## Troop offer generation

Troop offers show 3 unique options.

Buckets are filled in this order:

1. a troop from a faction the player already owns
2. a troop of a unit type the player already owns
3. a recently defeated latent troop whose faction is already owned, then another troop from an owned faction

If any bucket cannot be satisfied, that slot falls back to a random unowned troop unlock from the remaining claimable pool.

Generated offers persist in save data until they are claimed or the cycle advances.

Offer candidate pool:

- native troop combinations for unlocked factions only
- latent off-roster troop combinations previously discovered through Rift victories, but only after their faction is unlocked

Opening faction rule:

- the opening screen only shows native faction rosters
- the player chooses two starting factions, not troop types
- each faction option includes one preselected starting troop type from that faction's native roster
- the player can still see the other native troop types that faction may unlock later
- the generated opening offer should not force duplicate starting troop types across the two selected factions
- after the opening campaign starts, only those two factions' native rosters are claimable in normal troop drafts

## Scheduled faction unlocks

At the start of cycle 3:

- choose from up to 3 still-locked factions
- each faction option shows its native troop roster
- each faction option also shows defeated-enemy troop combinations already discovered for that faction, as future unlock potential
- each faction option shows the 2 troop types that will be unlocked immediately if selected
- the chosen faction immediately receives 1 preselected faction upgrade
- the chosen faction immediately receives its 2 preselected troop type unlocks from its native roster plus any latent defeated troops for that faction

At the start of cycle 7:

- repeat the same faction choice flow
- each faction option shows the 3 troop types that will be unlocked immediately if selected
- the chosen faction immediately receives 2 preselected faction upgrades
- the chosen faction immediately receives its 3 preselected troop type unlocks from its native roster plus any latent defeated troops for that faction

With the current 7-faction content set, fewer than 3 faction options can appear if fewer than 3 factions remain locked.

## Unlocking upgrades

Upgrades are permanent unlocks, not purchases with escalating costs.

Implemented upgrade families:

- faction upgrades
- troop-type upgrades

There are no troop stat upgrades.

## Upgrade offer generation

Upgrade offers are revealed as part of the combined Essence draft and show 3 unique options when enough upgrades remain.

Buckets are filled in this order:

1. a troop-type upgrade for a unit type the player already owns
2. a faction upgrade for a faction the player already owns
3. a random upgrade affecting a random allied troop among those with the fewest existing faction-plus-type upgrades affecting them

If any bucket cannot be satisfied, that slot falls back to a random unowned upgrade from the remaining pool.

Generated offers persist in save data until they are claimed or the cycle advances.

## Implemented faction upgrades

- `Humans United`
- `Human Combined Arms`
- `Tubthumping`
- `Hold the Standard`
- `Elven Eyes`
- `Fade Into Shadow`
- `Elven Forsaken`
- `Long Shot Doctrine`
- `Silver Distance`
- `Goblin Farewell`
- `Goblin Pack`
- `Snatch the Moment`
- `Loot Frenzy`
- `Troll Momentum`
- `Stoneblood`
- `Troll Frenzy`
- `Crushing Sweep`
- `Rowdy Regrowth`
- `Diggy Hole`
- `Ale and Hearty`
- `Mycelial Beards`
- `Stall Warts`
- `Seeing Red`
- `First Blood`
- `Warcry`
- `Berserk`
- `Ensorcel`
- `Glamour`
- `Changeling`
- `Whimsy`

## Implemented troop-type upgrades

- `Shield Drill`
- `Crippling Shots`
- `Sevenfold`
- `Witness`
- `Bloodhounds`
- `Thrill of the Hunt`
- `Anointed Executioner`
- `Forest Friends`
- `True Form`
- `Ent's Visage`
- `Crackling Mitosis`
- `Living Circuit`
- `Dine in Hell`
- `Sentinel Runes`
- `Rat Behavior`
- `Dogpile`
- `Hemomancy`
- `Explosion Corpse`
- `Bolstering Light`
- `Mercy Before Dawn`
- `On the Hunt`
- `Shadow's Embrace`
- `War Drums`
- `Grave Vigor`
- `Storm Rods`
- `Spell Echo`

Removed upgrades:

- `Just a bunch of guys`
- `Challenge Accepted`
- `Leyline Focus`
