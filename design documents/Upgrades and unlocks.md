# Upgrades and unlocks

This document describes the current progression system.

## Currency

The only progression currency is `Essence`.

Current rules:

- the two opening race choices are free, and each selected race grants its preselected starting troop
- each cycle grants `+2` Essence after battles resolve
- revealing a combined troop-and-upgrade draft costs `2` Essence when both sides still have options
- a one-sided draft fallback costs `1` Essence if only troop unlocks or only upgrade unlocks remain
- claiming options from a revealed draft costs no additional Essence
- spendable Essence must be used before ending a cycle; leftover Essence only carries over when no Essence draft can be revealed

Removed from the progression model:

- gold
- buying units
- stat upgrades
- race unlock purchases
- blueprints
- post-battle reward claims

## Unlocking troops

Each unlocked race has a native troop roster that can appear in normal troop offers.

Off-roster race-and-troop combinations are not part of the normal pool by default. They enter a latent future-unlock pool by winning Rifts that contain those combinations.

Owning any troop from a race marks that race as owned for draft bucketing.

Current roster rule:

- the campaign keeps at most one troop per `race/unitClass` combination
- claiming a troop unlock immediately adds that troop to the player's roster if it is not already owned
- Rift-earned off-roster unlocks do not immediately add a troop
- latent Rift-earned combinations only become normal troop-offer candidates after their race is unlocked

## Troop offer generation

Troop offers show 3 unique options.

Buckets are filled in this order:

1. a troop from a race the player already owns
2. a troop of a troop class the player already owns
3. a recently defeated latent troop whose race is already owned, then another troop from an owned race

If any bucket cannot be satisfied, that slot falls back to a random unowned troop unlock from the remaining claimable pool.

Generated offers persist in save data until they are claimed or the cycle advances.

Troop options that would make the current roster impossible to fully assign are filtered out. In practice, a draft option is hidden if taking it would leave the player with more troops of one race or one troop class than there are currently discovered Rifts.

Offer candidate pool:

- native troop combinations for unlocked races only
- latent off-roster troop combinations previously discovered through Rift victories, but only after their race is unlocked

Opening race rule:

- the opening screen only shows native race rosters
- the player chooses two starting races, not troop classes
- each race option includes one preselected starting troop class from that race's native roster
- the player can still see the other native troop classes that race may unlock later
- the generated opening offer should not force duplicate starting troop classes across the two selected races
- after the opening campaign starts, only those two races' native rosters are claimable in normal troop drafts

## Scheduled race unlocks

At the start of cycle 3:

- choose from up to 3 still-locked races
- each race option shows its native troop roster
- each race option also shows defeated-enemy troop combinations already discovered for that race, as future unlock potential
- each race option shows the 2 troop classes that will be unlocked immediately if selected
- the chosen race immediately receives 1 preselected race upgrade
- the chosen race immediately receives its 2 preselected troop class unlocks from its native roster plus any latent defeated troops for that race

At the start of cycle 7:

- repeat the same race choice flow
- each race option shows the 3 troop classes that will be unlocked immediately if selected
- the chosen race immediately receives 2 preselected race upgrades
- the chosen race immediately receives its 3 preselected troop class unlocks from its native roster plus any latent defeated troops for that race

With the current 7-race content set, fewer than 3 race options can appear if fewer than 3 races remain locked.

## Unlocking upgrades

Upgrades are permanent unlocks, not purchases with escalating costs.

Implemented upgrade families:

- race upgrades
- troop-class upgrades

There are no troop stat upgrades.

## Upgrade offer generation

Upgrade offers are revealed as part of the combined Essence draft and show 3 unique options when enough upgrades remain.

Buckets are filled in this order:

1. a troop-class upgrade for a troop class the player already owns
2. a race upgrade for a race the player already owns
3. excluding the troop class chosen in bucket 1 and the race chosen in bucket 2, a random upgrade affecting a random allied troop among those with the fewest existing race-plus-class upgrades affecting them and at least one available upgrade after those exclusions

If any bucket cannot be satisfied, that slot falls back to a random unowned upgrade from the remaining pool.

Generated offers persist in save data until they are claimed or the cycle advances.

## Implemented race upgrades

- `Combined Arms`
- `Tubthumping`
- `Hold the Standard`
- `Feline Grace`
- `Forsaken`
- `Silvershot Doctrine`
- `Gallowsworn`
- `Horde`
- `Roll the Boulder`
- `Mossblood`
- `Rowdy Regrowth`
- `Diggy Hole`
- `Ale and Hearty`
- `Stall Warts`
- `Seeing Red`
- `First Blood`
- `Berserk`
- `Glamour`
- `Changeling`
- `Whimsy`

## Implemented troop-class upgrades

- `Shield Drill`
- `Dreamwork`
- `Crippling Shots`
- `Barrage`
- `Sevenfold`
- `Witness`
- `Bloodhounds`
- `Thrill of the Hunt`
- `Anointed Executioner`
- `Honorable Duel`
- `Forest Friends`
- `True Form`
- `Ent's Visage`
- `Crackling Mitosis`
- `Living Circuit`
- `Dine in Hell`
- `Sentinel Runes`
- `R-selected`
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

Legacy removed upgrade names are intentionally omitted from current design docs.
