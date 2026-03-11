# Battle details

Battles take place on a hex grid (a large hex made of smaller hexes).

Each hex has a saturation limit (usually 10). If the total allied Size on a hex is **greater than** saturation, that hex is invalid as a movement destination for allied units.

Default battle map: hex radius 3, consisting of 37 smaller hexes.

Spawn rules:

* The two sides start in opposite corners.
* Ranged units (Range > 0) start in the corner hex.
* Melee units (Range = 0) start one hex closer to the enemy.
* If a spawn group would overflow, it spreads across additional eligible hexes that are closest while staying equidistant relative to the enemy corner.
* Distribution should be as even as possible by **total Size per occupied hex**.
* If there are no valid additional equidistant hexes left, increase map radius by 1 and retry.
* Melee and ranged units from the same side should not share a spawn hex.

Battle flow:

* Battles advance in Beats.
* On each Beat, every alive unit gains initiative equal to its Speed.
* Initial initiative is random from 0 to 10 (inclusive).
* Units with initiative >= 100 act in random order; each spends 100 initiative when taking its turn.
* Implementation safety cap: if a battle reaches 1000 Beats, it immediately ends in a draw.

Turn flow:

* If the acting unit is Engaged: attack one random engaged enemy.
* Otherwise, resolve behavior using its Role (built from Directives).

Roles:

* Frontline: if any non-Engaged enemies are on current hex, Draw attention Any. Otherwise, Pursue Frontline/Chaff.
* Chaff: if no non-Engaged enemies are on current hex, Pursue Backline. Otherwise, Pile on.
* Backline: if any enemies are on current hex, Retreat. Otherwise, if any enemies are in range, Shoot Any. Otherwise, Careful Advance.

Directives:

* Draw attention [Role]: Engage as many non-Engaged enemies of [Role] on current hex as possible (Role = Any means no role filter). Then Fight.
* Overrun [Role]: if there are no non-Engaged enemies on current hex, Pursue [Role].
* Pile on: attack a random enemy on current hex, prioritizing enemies Engaged with allied units. If none are present, do nothing.
* Pursue [Role]:
  1. If enemy [Role] units are present on current hex, Draw attention [Role].
  2. Otherwise, move to an adjacent hex that is closest to enemy [Role] units, preferring hexes with fewer non-Engaged enemies.
  3. After moving, if enemy [Role] units are present, Draw attention [Role]; otherwise Draw attention Any.
* Retreat: move to a random adjacent hex with no enemies. If none exist, attack a random enemy on current hex.
* Shoot [Role]: attack a random enemy [Role] within range.
* Careful Advance: if there are adjacent hexes that move the unit closer to any enemy without stepping onto a hex containing any ally with shorter range, move to a random one. If none exist, do nothing.
* Fight: if Engaged with any enemies, attack one at random. If not Engaged, Pile on.
