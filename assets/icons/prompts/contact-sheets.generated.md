# Shiftmake Contact Sheet Prompts

## ability/general

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "ale-and-hearty",
    "name": "Ale and Hearty",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: one random unit from each troop has speed set to 1 at the start of combat.",
    "gameplayTags": [
      "base-ability",
      "speed"
    ]
  },
  {
    "id": "alternate-fuel-10",
    "name": "Alternate Fuel",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: corpse-consuming abilities may spend 10 HP instead of requiring or consuming a corpse, if that would not kill this unit.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "healing",
      "corpse"
    ]
  },
  {
    "id": "anointed",
    "name": "Anointed",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: healing and positive stat gains affecting this unit are doubled.",
    "gameplayTags": [
      "base-ability",
      "healing"
    ]
  },
  {
    "id": "arc-conductor",
    "name": "Arc Conductor",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when an allied elemental dies, blast its hex for 8.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "summon",
      "corpse",
      "ranged",
      "synergy"
    ]
  },
  {
    "id": "berserk",
    "name": "Berserk",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: the first time this unit would die from damage, it becomes immune to damage and dies at the end of its next turn.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "initiative",
      "corpse",
      "defense"
    ]
  },
  {
    "id": "blast-5",
    "name": "Blast 5",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "On attack: all enemies on the attacked hex take 5 damage.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "ranged"
    ]
  },
  {
    "id": "blood-oath",
    "name": "Blood Oath",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "When an ally dies on this hex: set initiative to 100.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "corpse"
    ]
  },
  {
    "id": "bonded",
    "name": "Bonded",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: dies when its summoner dies.",
    "gameplayTags": [
      "base-ability",
      "summon",
      "corpse"
    ]
  },
  {
    "id": "brace",
    "name": "Brace",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: start of turn, if engaged at full capacity, gain +5 armor until next turn.",
    "gameplayTags": [
      "base-ability",
      "armor",
      "initiative",
      "melee",
      "defense"
    ]
  },
  {
    "id": "bramble-snare",
    "name": "Bramble Snare",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: each shapeshift empowers this unit so its melee attacks reduce target speed by 2 for the battle.",
    "gameplayTags": [
      "base-ability",
      "speed",
      "melee",
      "debuff",
      "transformation"
    ]
  },
  {
    "id": "carrion-choir",
    "name": "Carrion Choir",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when this unit consumes a corpse, nearby enemies lose 1 armor and 1 damage for the battle.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "armor",
      "corpse",
      "debuff",
      "defense"
    ]
  },
  {
    "id": "challenge-accepted",
    "name": "Challenge Accepted",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: enemies redirected by this unit deal 4 less damage while engaged with it.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "melee",
      "defense"
    ]
  },
  {
    "id": "changeling",
    "name": "Changeling",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: after beat 12, one random enemy from each enemy troop changes sides.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "summon",
      "transformation"
    ]
  },
  {
    "id": "charge-4-summon-elemental",
    "name": "Charge 4 Summon Elemental",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Every 4 turns: summon 1 elemental on this unit or an adjacent hex.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "summon"
    ]
  },
  {
    "id": "charge-4-summon-elemental-mitosis",
    "name": "Charge 4 Summon Elemental",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Every 4 turns: summon 1 elemental on this unit or an adjacent hex. Each summoned elemental can do the same once.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "summon"
    ]
  },
  {
    "id": "concussive-shots",
    "name": "Concussive Shots",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "On attack: set the target initiative to 0.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "initiative",
      "ranged",
      "debuff"
    ]
  },
  {
    "id": "corpse-summon-skeleton",
    "name": "Corpse Summon Skeleton",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "When a nearby unit leaves a corpse, consume it to summon a skeleton there.",
    "gameplayTags": [
      "base-ability",
      "summon",
      "corpse"
    ]
  },
  {
    "id": "corpse-summon-skeleton-rising",
    "name": "Corpse Summon Skeleton",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "When a nearby unit leaves a corpse, consume it to summon a skeleton there. Summoned skeletons heal allies on their hex.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "healing",
      "summon",
      "corpse"
    ]
  },
  {
    "id": "crushing-sweep",
    "name": "Crushing Sweep",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: melee kills deal splash damage equal to 5 times this unit size to other enemies on that hex.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "melee"
    ]
  },
  {
    "id": "diggy-hole",
    "name": "Diggy Hole",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: does not spawn at battle start. After 10 beats, spawns on the enemy side of the board.",
    "gameplayTags": [
      "base-ability",
      "movement"
    ]
  },
  {
    "id": "dogpile",
    "name": "Dogpile",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: melee attacks against enemies engaged by at least 3 allies strike 1 extra time.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "melee"
    ]
  },
  {
    "id": "early-riser",
    "name": "Early Riser",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: skeletons this unit summons spawn with +100 initiative.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "summon",
      "movement"
    ]
  },
  {
    "id": "enhance-1",
    "name": "Enhance 1",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "End of turn: a random allied non-caster within this unit's range gains +1 speed and +1 damage for the battle.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "speed",
      "initiative",
      "ranged",
      "synergy"
    ]
  },
  {
    "id": "ensorcel",
    "name": "Ensorcel",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: at battle start, mark an enemy that loses abilities and becomes the preferred Fae target.",
    "gameplayTags": [
      "base-ability",
      "corpse",
      "ranged",
      "debuff"
    ]
  },
  {
    "id": "executioner",
    "name": "Executioner",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: prioritize the lowest-HP legal attack target.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "healing"
    ]
  },
  {
    "id": "fade-into-shadow",
    "name": "Fade Into Shadow",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: the first time this backline unit is engaged, it retreats 1 hex for free.",
    "gameplayTags": [
      "base-ability",
      "melee",
      "movement"
    ]
  },
  {
    "id": "fading",
    "name": "Fading",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: does not leave a corpse on death.",
    "gameplayTags": [
      "base-ability",
      "corpse"
    ]
  },
  {
    "id": "first-blood",
    "name": "First Blood",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: attack immediately when engaging an enemy, before the normal engagement attack.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "melee"
    ]
  },
  {
    "id": "forsaken-80",
    "name": "Forsaken 80",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Start of battle: if no other friendly troop types are present, gain 80% health, damage, and speed.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "speed",
      "healing",
      "synergy"
    ]
  },
  {
    "id": "frenzy-ramp-1",
    "name": "Frenzy: Ramp 1",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "After taking damage: gain +1 damage for the battle.",
    "gameplayTags": [
      "base-ability",
      "damage"
    ]
  },
  {
    "id": "glamour",
    "name": "Glamour",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: once per battle, redirect an incoming normal attack to a random enemy in range as if this unit made the attack.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "ranged",
      "defense"
    ]
  },
  {
    "id": "goblin-farewell",
    "name": "Goblin Farewell",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "On death: strike a random enemy on this hex one extra time.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "corpse"
    ]
  },
  {
    "id": "haste-1",
    "name": "Haste 1",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "End of turn: a random allied unit within this unit's range gains +1 speed for the battle.",
    "gameplayTags": [
      "base-ability",
      "speed",
      "initiative",
      "ranged",
      "synergy"
    ]
  },
  {
    "id": "heartseeker",
    "name": "Heartseeker",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: attacks against unengaged targets deal double damage.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "ranged",
      "melee"
    ]
  },
  {
    "id": "hold-the-standard",
    "name": "Hold the Standard",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: whenever a non-Fading ally dies on this hex, heal Human units on this hex for 15.",
    "gameplayTags": [
      "base-ability",
      "healing",
      "corpse"
    ]
  },
  {
    "id": "last-witness",
    "name": "Last Witness",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when an ally dies on this unit hex, strike the killer twice if it is still there.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "corpse"
    ]
  },
  {
    "id": "leyline-focus",
    "name": "Leyline Focus",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: start of turn, if no enemy is within 1 hex, gain 25 initiative.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "ranged"
    ]
  },
  {
    "id": "lightning-rods",
    "name": "Lightning Rods",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: Blast deals +1 damage per elemental on the target hex.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "summon",
      "ranged"
    ]
  },
  {
    "id": "living-circuit",
    "name": "Living Circuit",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: end of turn, gain 15 initiative once if any allied elemental is in range, and all allied elementals in range gain 15 initiative.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "summon",
      "ranged",
      "synergy"
    ]
  },
  {
    "id": "long-shot-doctrine",
    "name": "Long Shot Doctrine",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: ranged and caster attacks gain +1 damage and +2 initiative per hex of distance.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "initiative",
      "ranged"
    ]
  },
  {
    "id": "loot-frenzy",
    "name": "Loot Frenzy",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when this unit gets a kill, Goblins on that hex heal 5 and gain 35 initiative.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "initiative",
      "healing"
    ]
  },
  {
    "id": "mend-4",
    "name": "Mend 4",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "End of turn: heal allies within this unit's range for 4.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "healing",
      "ranged"
    ]
  },
  {
    "id": "mercy-before-dawn",
    "name": "Mercy Before Dawn",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: the first time each battle an ally in this unit's range would die, it survives at 1 HP.",
    "gameplayTags": [
      "base-ability",
      "healing",
      "corpse",
      "ranged",
      "synergy",
      "defense"
    ]
  },
  {
    "id": "mycelial-beards",
    "name": "Mycelial Beards",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: incoming damage is split equally among Dwarven units on this hex after normal mitigation.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "transformation",
      "defense"
    ]
  },
  {
    "id": "overflowing-grace",
    "name": "Overflowing Grace",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when this unit heals an ally to full HP, that ally gains 40 initiative.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "healing"
    ]
  },
  {
    "id": "pack-1",
    "name": "Pack 1",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Start of turn: gain +1 damage per other friendly unit on this hex until end of turn.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "initiative",
      "synergy"
    ]
  },
  {
    "id": "packmasters-whistle",
    "name": "Packmaster's Whistle",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "End of turn: if engaged, a wolf on this unit hex redirects an engaged enemy and heals 10.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "healing",
      "summon",
      "melee",
      "synergy",
      "defense"
    ]
  },
  {
    "id": "pinning-volley",
    "name": "Pinning Volley",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "On attack: reduce the target speed by 1 for the battle.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "speed",
      "ranged",
      "debuff"
    ]
  },
  {
    "id": "combined-arms-20",
    "name": "Power of Friendship",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Start of battle: gain +20% health, +20% damage, and +20% speed for each other friendly troop type in this battle.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "speed",
      "healing",
      "synergy"
    ]
  },
  {
    "id": "rabble-rush",
    "name": "Rabble Rush",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Start of turn: gain +1 initiative per other Militia on this hex.",
    "gameplayTags": [
      "base-ability",
      "initiative"
    ]
  },
  {
    "id": "ramp-1",
    "name": "Ramp 1",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "End of turn: gain +1 damage for the battle.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "initiative"
    ]
  },
  {
    "id": "regen-5",
    "name": "Regen 5",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "End of turn: heal self for 5.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "healing"
    ]
  },
  {
    "id": "regen-60",
    "name": "Regen 60",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "End of turn: heal self for 60.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "healing"
    ]
  },
  {
    "id": "retaliate",
    "name": "Retaliate",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when hit by a normal attack, make a normal attack back once.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "melee"
    ]
  },
  {
    "id": "rowdy-regrowth",
    "name": "Rowdy Regrowth",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: whenever this unit is healed, gain 15 initiative.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "healing"
    ]
  },
  {
    "id": "scavengers-hunger",
    "name": "Scavenger's Hunger",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: the first 3 times this unit kills a non-Fading enemy, consume the corpse and summon 1 wolf there.",
    "gameplayTags": [
      "base-ability",
      "summon",
      "corpse",
      "ranged"
    ]
  },
  {
    "id": "scurry",
    "name": "Scurry",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: does not count toward allied saturation limits.",
    "gameplayTags": [
      "base-ability",
      "synergy"
    ]
  },
  {
    "id": "seeing-red",
    "name": "Seeing Red",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "On kill: lose 1 armor for the battle and gain 75 initiative.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "armor",
      "initiative",
      "debuff",
      "defense"
    ]
  },
  {
    "id": "sentinel-runes",
    "name": "Sentinel Runes",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: the first time an enemy moves off this unit's hex, summon 2 elementals on its new hex; if unused, trigger on death instead.",
    "gameplayTags": [
      "base-ability",
      "summon",
      "corpse",
      "movement"
    ]
  },
  {
    "id": "serve-once-more",
    "name": "Serve Once More",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "When this unit applies a beneficial effect, the same target leaves no corpse on death and summons 1 skeleton on death.",
    "gameplayTags": [
      "base-ability",
      "summon",
      "corpse"
    ]
  },
  {
    "id": "shapeshift-bear",
    "name": "Shapeshift - Bear",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "After 5 turns, once: gain +100 health, +5 speed, +20 damage, set range to 0, and become a frontline unit.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "speed",
      "healing",
      "ranged",
      "transformation"
    ]
  },
  {
    "id": "shapeshift-bear-2",
    "name": "Shapeshift - Bear",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "After every 5 turns, twice: gain +100 health, +5 speed, +20 damage, set range to 0, and become a frontline unit.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "speed",
      "healing",
      "ranged",
      "transformation"
    ]
  },
  {
    "id": "shield-drill",
    "name": "Shield Drill",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: allies on this unit's hex take 1 less damage from ranged attacks and strikes.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "armor",
      "corpse",
      "ranged",
      "defense"
    ]
  },
  {
    "id": "shredding-arrows",
    "name": "Shredding Arrows",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "On attack: reduce the target armor by 1 for the battle.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "armor",
      "ranged",
      "debuff",
      "defense"
    ]
  },
  {
    "id": "silver-distance",
    "name": "Silver Distance",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: ranged and caster attacks made from max range make the target lose 30 initiative.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "ranged",
      "debuff"
    ]
  },
  {
    "id": "skirmishers-step",
    "name": "Skirmisher's Step",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: after attacking unengaged, move to the safest hex that still keeps an enemy in range.",
    "gameplayTags": [
      "base-ability",
      "ranged",
      "melee",
      "movement"
    ]
  },
  {
    "id": "snatch-the-moment",
    "name": "Snatch the Moment",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: on kill, enemies on that hex lose 20 initiative.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "initiative",
      "debuff"
    ]
  },
  {
    "id": "spell-echo",
    "name": "Spell Echo",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: Blast chains to adjacent hexes that have not been hit in this chain.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "ranged"
    ]
  },
  {
    "id": "stall-warts",
    "name": "Stall Warts",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: after being hit by normal attacks, gain +1 armor for the battle.",
    "gameplayTags": [
      "base-ability",
      "armor",
      "defense"
    ]
  },
  {
    "id": "static-charge",
    "name": "Static Charge",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when this unit applies Enhance, affected allies gain 1 extra strike on their next normal attack.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "initiative"
    ]
  },
  {
    "id": "stoneblood",
    "name": "Stoneblood",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: the first time this unit would die, it survives at 25 HP and loses Regen.",
    "gameplayTags": [
      "base-ability",
      "healing",
      "corpse",
      "debuff",
      "defense"
    ]
  },
  {
    "id": "charge-4-random-enemy-r-strike-4",
    "name": "Storm",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Every 4 turns: a random enemy within this unit range is struck 4 extra times.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "initiative",
      "ranged"
    ]
  },
  {
    "id": "summon-elemental-1",
    "name": "Summon Elemental 1",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Start of battle: summon 1 elemental on this unit or an adjacent hex.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "summon",
      "ranged"
    ]
  },
  {
    "id": "summon-wolf-2",
    "name": "Summon Wolf 2",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Start of battle: summon 2 wolves on this unit or adjacent hexes.",
    "gameplayTags": [
      "base-ability",
      "summon"
    ]
  },
  {
    "id": "summon-wolf-2-blood",
    "name": "Summon Wolf 2",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Start of battle: summon 2 wolves on this unit or adjacent hexes. Those wolves summon 1 more wolf on each kill, and new wolves inherit that effect.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "summon"
    ]
  },
  {
    "id": "taunt",
    "name": "Taunt",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "End of turn: engage unengaged enemies on this hex up to Capacity.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "melee",
      "defense"
    ]
  },
  {
    "id": "thornhide",
    "name": "Thornhide",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: after shapeshifting, normal attackers take 6 damage when they hit this unit.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "transformation"
    ]
  },
  {
    "id": "thrill-of-the-hunt",
    "name": "Thrill of the Hunt",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: end of turn, wolves on this unit hex gain 10 initiative; any wolf kill gives allies on that hex +2 damage for the battle.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "initiative",
      "summon"
    ]
  },
  {
    "id": "tubthumping",
    "name": "Tubthumping",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: effects that would reduce this unit damage or speed instead increase it by 1.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "speed",
      "debuff"
    ]
  },
  {
    "id": "united",
    "name": "United",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Overworld: troops of this faction may enter the same Rift together.",
    "gameplayTags": [
      "base-ability",
      "synergy"
    ]
  },
  {
    "id": "uses-7-corpse-summon-skeleton",
    "name": "Uses 7 Corpse Summon Skeleton",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "When a nearby unit leaves a corpse, consume it to summon a skeleton there up to 7 times.",
    "gameplayTags": [
      "base-ability",
      "summon",
      "corpse"
    ]
  },
  {
    "id": "valor-20",
    "name": "Valor 20",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "On kill: heal allies on this hex for 20.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "healing"
    ]
  },
  {
    "id": "vengeance-3",
    "name": "Vengeance 3",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "When an ally dies on this hex, gain +3 speed and +3 damage for the battle.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "speed",
      "corpse"
    ]
  },
  {
    "id": "war-drums",
    "name": "War Drums",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "End of turn: enhance all allies on a chosen allied hex instead of one target.",
    "gameplayTags": [
      "base-ability",
      "initiative",
      "synergy"
    ]
  },
  {
    "id": "warcry",
    "name": "Warcry",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when an enemy dies on this hex, all allies gain 1 damage for the battle.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "corpse",
      "synergy"
    ]
  },
  {
    "id": "whimsy",
    "name": "Whimsy",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: after taking damage, relocate to a random legal hex.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "movement"
    ]
  },
  {
    "id": "wild-call",
    "name": "Wild Call",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: whenever this unit shapeshifts, summon 2 wolves.",
    "gameplayTags": [
      "base-ability",
      "summon",
      "transformation"
    ]
  },
  {
    "id": "zeal-enhance-1",
    "name": "Zeal",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "When this unit heals a target, that same target also gains +1 speed and +1 damage for the battle.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "speed",
      "healing"
    ]
  }
]
```

## faction_upgrade/Dwarves

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "dwarf-diggy-hole",
    "name": "Diggy Hole",
    "kind": "faction_upgrade",
    "owner": "Dwarves",
    "tier": 1,
    "mechanic": "Dwarven units do not spawn at battle start. After 10 beats, they spawn on the enemy side of the board.",
    "gameplayTags": [
      "faction-upgrade",
      "dwarves",
      "movement"
    ]
  },
  {
    "id": "dwarf-ale-and-hearty",
    "name": "Ale and Hearty",
    "kind": "faction_upgrade",
    "owner": "Dwarves",
    "tier": 2,
    "mechanic": "Dwarven troops gain +40% speed. One random unit from each Dwarven troop has its speed set to 1 at the start of combat.",
    "gameplayTags": [
      "faction-upgrade",
      "dwarves",
      "speed"
    ]
  },
  {
    "id": "dwarf-mycelial-beards",
    "name": "Mycelial Beards",
    "kind": "faction_upgrade",
    "owner": "Dwarves",
    "tier": 2,
    "mechanic": "When a Dwarven unit would receive damage, split that damage equally among all Dwarven units on its hex after mitigation.",
    "gameplayTags": [
      "faction-upgrade",
      "dwarves",
      "damage",
      "transformation",
      "defense"
    ]
  },
  {
    "id": "dwarf-stall-warts",
    "name": "Stall Warts",
    "kind": "faction_upgrade",
    "owner": "Dwarves",
    "tier": 3,
    "mechanic": "Dwarven troops gain +1 armor for the rest of the battle after they are hit by normal attacks.",
    "gameplayTags": [
      "faction-upgrade",
      "dwarves",
      "armor",
      "defense"
    ]
  }
]
```

## faction_upgrade/Elves

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "elven-eyes",
    "name": "Elven Eyes",
    "kind": "faction_upgrade",
    "owner": "Elves",
    "tier": 1,
    "mechanic": "All non-melee elven troops gain +1 range.",
    "gameplayTags": [
      "faction-upgrade",
      "elves",
      "ranged",
      "melee"
    ]
  },
  {
    "id": "elf-fade-into-shadow",
    "name": "Fade Into Shadow",
    "kind": "faction_upgrade",
    "owner": "Elves",
    "tier": 2,
    "mechanic": "The first time each battle an engaged elven backline unit retreats 1 hex for free.",
    "gameplayTags": [
      "faction-upgrade",
      "elves",
      "melee",
      "movement"
    ]
  },
  {
    "id": "elf-silver-distance",
    "name": "Silver Distance",
    "kind": "faction_upgrade",
    "owner": "Elves",
    "tier": 2,
    "mechanic": "Elven ranged and caster attacks made from max range make the target lose 30 initiative.",
    "gameplayTags": [
      "faction-upgrade",
      "elves",
      "initiative",
      "ranged",
      "debuff"
    ]
  },
  {
    "id": "elven-forsaken",
    "name": "Elven Forsaken",
    "kind": "faction_upgrade",
    "owner": "Elves",
    "tier": 3,
    "mechanic": "Start of battle: if an elven unit is fighting without any other friendly troop types, it gains +80% health, +80% damage, and +80% speed.",
    "gameplayTags": [
      "faction-upgrade",
      "elves",
      "damage",
      "speed",
      "healing",
      "synergy"
    ]
  },
  {
    "id": "elf-long-shot-doctrine",
    "name": "Long Shot Doctrine",
    "kind": "faction_upgrade",
    "owner": "Elves",
    "tier": 3,
    "mechanic": "Elven ranged and caster attacks gain +1 damage and +2 initiative per hex of distance to the target.",
    "gameplayTags": [
      "faction-upgrade",
      "elves",
      "damage",
      "initiative",
      "ranged"
    ]
  }
]
```

## faction_upgrade/Fae

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "fae-ensorcel",
    "name": "Ensorcel",
    "kind": "faction_upgrade",
    "owner": "Fae",
    "tier": 1,
    "mechanic": "At the start of combat, mark an enemy unit. It loses all abilities, and Fae units target it whenever it is in range. When it dies, another enemy is marked.",
    "gameplayTags": [
      "faction-upgrade",
      "fae",
      "corpse",
      "ranged",
      "debuff"
    ]
  },
  {
    "id": "fae-glamour",
    "name": "Glamour",
    "kind": "faction_upgrade",
    "owner": "Fae",
    "tier": 2,
    "mechanic": "Once per battle per Fae unit, redirect an incoming normal attack to a random enemy in range as if the Fae unit made that attack.",
    "gameplayTags": [
      "faction-upgrade",
      "fae",
      "damage",
      "ranged",
      "defense"
    ]
  },
  {
    "id": "fae-changeling",
    "name": "Changeling",
    "kind": "faction_upgrade",
    "owner": "Fae",
    "tier": 3,
    "mechanic": "If a Fae troop was brought to battle, after beat 12 a random enemy unit from each enemy troop changes sides.",
    "gameplayTags": [
      "faction-upgrade",
      "fae",
      "initiative",
      "summon",
      "transformation"
    ]
  },
  {
    "id": "fae-whimsy",
    "name": "Whimsy",
    "kind": "faction_upgrade",
    "owner": "Fae",
    "tier": 3,
    "mechanic": "Whenever a Fae unit takes damage, it is relocated to a random hex.",
    "gameplayTags": [
      "faction-upgrade",
      "fae",
      "damage",
      "movement"
    ]
  }
]
```

## faction_upgrade/Goblins

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "goblin-farewell-upgrade",
    "name": "Goblin Farewell",
    "kind": "faction_upgrade",
    "owner": "Goblins",
    "tier": 1,
    "mechanic": "On death: each goblin unit makes 1 extra strike against a random enemy on its hex.",
    "gameplayTags": [
      "faction-upgrade",
      "goblins",
      "damage",
      "corpse"
    ]
  },
  {
    "id": "goblin-pack",
    "name": "Goblin Pack",
    "kind": "faction_upgrade",
    "owner": "Goblins",
    "tier": 2,
    "mechanic": "Start of turn: each goblin unit gains +1 damage per other friendly unit on its hex until end of turn.",
    "gameplayTags": [
      "faction-upgrade",
      "goblins",
      "damage",
      "initiative",
      "synergy"
    ]
  },
  {
    "id": "goblin-loot-frenzy",
    "name": "Loot Frenzy",
    "kind": "faction_upgrade",
    "owner": "Goblins",
    "tier": 3,
    "mechanic": "When a Goblin gets a kill, Goblins on that hex heal 5 and gain 35 initiative.",
    "gameplayTags": [
      "faction-upgrade",
      "goblins",
      "damage",
      "initiative",
      "healing"
    ]
  },
  {
    "id": "goblin-snatch-the-moment",
    "name": "Snatch the Moment",
    "kind": "faction_upgrade",
    "owner": "Goblins",
    "tier": 3,
    "mechanic": "When a goblin gets a kill, all enemies on that hex lose 20 initiative.",
    "gameplayTags": [
      "faction-upgrade",
      "goblins",
      "damage",
      "initiative",
      "debuff"
    ]
  }
]
```

## faction_upgrade/Humans

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "human-united",
    "name": "Humans United",
    "kind": "faction_upgrade",
    "owner": "Humans",
    "tier": 1,
    "mechanic": "Overworld: human troops may enter the same Rift together.",
    "gameplayTags": [
      "faction-upgrade",
      "humans",
      "synergy"
    ]
  },
  {
    "id": "human-hold-the-standard",
    "name": "Hold the Standard",
    "kind": "faction_upgrade",
    "owner": "Humans",
    "tier": 2,
    "mechanic": "Whenever a non-Fading ally dies on a Human hex, Human units on that hex heal 15.",
    "gameplayTags": [
      "faction-upgrade",
      "humans",
      "healing",
      "corpse"
    ]
  },
  {
    "id": "human-combined-arms",
    "name": "Human Combined Arms",
    "kind": "faction_upgrade",
    "owner": "Humans",
    "tier": 2,
    "mechanic": "Start of battle: each human unit gains +20% health, +20% damage, and +20% speed for each other friendly troop type in that battle.",
    "gameplayTags": [
      "faction-upgrade",
      "humans",
      "damage",
      "speed",
      "healing",
      "synergy"
    ]
  },
  {
    "id": "human-tubthumping",
    "name": "Tubthumping",
    "kind": "faction_upgrade",
    "owner": "Humans",
    "tier": 3,
    "mechanic": "Effects that would reduce a Human unit speed or damage instead increase it by 1.",
    "gameplayTags": [
      "faction-upgrade",
      "humans",
      "damage",
      "speed",
      "debuff"
    ]
  }
]
```

## faction_upgrade/Orcs

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "orc-seeing-red",
    "name": "Seeing Red",
    "kind": "faction_upgrade",
    "owner": "Orcs",
    "tier": 1,
    "mechanic": "Whenever an Orc unit kills an enemy unit, it loses 1 armor for the battle and gains 75 initiative.",
    "gameplayTags": [
      "faction-upgrade",
      "orcs",
      "damage",
      "armor",
      "initiative",
      "debuff",
      "defense"
    ]
  },
  {
    "id": "orc-first-blood",
    "name": "First Blood",
    "kind": "faction_upgrade",
    "owner": "Orcs",
    "tier": 2,
    "mechanic": "Orc units attack their target whenever they engage, in addition to the normal engagement attack.",
    "gameplayTags": [
      "faction-upgrade",
      "orcs",
      "damage",
      "melee"
    ]
  },
  {
    "id": "orc-berserk",
    "name": "Berserk",
    "kind": "faction_upgrade",
    "owner": "Orcs",
    "tier": 3,
    "mechanic": "When an Orc unit would die from damage, its initiative is set to 0, it stops taking damage, and it dies at the end of its next turn.",
    "gameplayTags": [
      "faction-upgrade",
      "orcs",
      "damage",
      "initiative",
      "corpse",
      "defense"
    ]
  },
  {
    "id": "orc-warcry",
    "name": "Warcry",
    "kind": "faction_upgrade",
    "owner": "Orcs",
    "tier": 3,
    "mechanic": "Whenever an enemy unit dies on a hex with an Orc unit, all allied units gain 1 damage for the battle. Multiple Orcs can trigger this from the same death.",
    "gameplayTags": [
      "faction-upgrade",
      "orcs",
      "damage",
      "corpse",
      "synergy"
    ]
  }
]
```

## faction_upgrade/Trolls

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "troll-momentum",
    "name": "Troll Momentum",
    "kind": "faction_upgrade",
    "owner": "Trolls",
    "tier": 1,
    "mechanic": "End of turn: each troll unit gains +1 damage for the rest of the battle.",
    "gameplayTags": [
      "faction-upgrade",
      "trolls",
      "damage",
      "initiative"
    ]
  },
  {
    "id": "troll-rowdy-regrowth",
    "name": "Rowdy Regrowth",
    "kind": "faction_upgrade",
    "owner": "Trolls",
    "tier": 2,
    "mechanic": "Whenever a Troll is healed, it gains 15 initiative.",
    "gameplayTags": [
      "faction-upgrade",
      "trolls",
      "initiative",
      "healing"
    ]
  },
  {
    "id": "troll-stoneblood",
    "name": "Stoneblood",
    "kind": "faction_upgrade",
    "owner": "Trolls",
    "tier": 2,
    "mechanic": "The first time each troll would die in a battle, it survives at 25 HP and loses Regen for the rest of that battle.",
    "gameplayTags": [
      "faction-upgrade",
      "trolls",
      "healing",
      "corpse",
      "debuff",
      "defense"
    ]
  },
  {
    "id": "troll-crushing-sweep",
    "name": "Crushing Sweep",
    "kind": "faction_upgrade",
    "owner": "Trolls",
    "tier": 3,
    "mechanic": "When a troll kills an enemy in melee, all other enemies on that hex take damage equal to 5 times that troll's size.",
    "gameplayTags": [
      "faction-upgrade",
      "trolls",
      "damage",
      "melee"
    ]
  },
  {
    "id": "troll-frenzy",
    "name": "Troll Frenzy",
    "kind": "faction_upgrade",
    "owner": "Trolls",
    "tier": 3,
    "mechanic": "After taking damage: each troll unit gains +1 damage for the rest of the battle.",
    "gameplayTags": [
      "faction-upgrade",
      "trolls",
      "damage"
    ]
  }
]
```

## rift_mutator/Rift

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "animated",
    "name": "Animated",
    "kind": "rift_mutator",
    "owner": "Rift",
    "tier": null,
    "mechanic": "All units lose Fading.",
    "gameplayTags": [
      "rift-mutator",
      "corpse",
      "debuff"
    ]
  },
  {
    "id": "corrosion",
    "name": "Corrosion",
    "kind": "rift_mutator",
    "owner": "Rift",
    "tier": null,
    "mechanic": "All units start with 0 armor and cannot have positive armor.",
    "gameplayTags": [
      "rift-mutator",
      "armor",
      "defense"
    ]
  },
  {
    "id": "decay",
    "name": "Decay",
    "kind": "rift_mutator",
    "owner": "Rift",
    "tier": null,
    "mechanic": "Every beat, each unit loses 1 HP ignoring armor.",
    "gameplayTags": [
      "rift-mutator",
      "armor",
      "initiative",
      "debuff",
      "defense"
    ]
  },
  {
    "id": "haze",
    "name": "Haze",
    "kind": "rift_mutator",
    "owner": "Rift",
    "tier": null,
    "mechanic": "All units lose 5 initiative every beat.",
    "gameplayTags": [
      "rift-mutator",
      "initiative",
      "debuff"
    ]
  },
  {
    "id": "heavy-air",
    "name": "Heavy Air",
    "kind": "rift_mutator",
    "owner": "Rift",
    "tier": null,
    "mechanic": "Ranged attack damage is reduced by 50%.",
    "gameplayTags": [
      "rift-mutator",
      "damage",
      "ranged",
      "debuff"
    ]
  },
  {
    "id": "momentum",
    "name": "Momentum",
    "kind": "rift_mutator",
    "owner": "Rift",
    "tier": null,
    "mechanic": "All units gain +10 initiative every beat.",
    "gameplayTags": [
      "rift-mutator",
      "initiative"
    ]
  },
  {
    "id": "quakes",
    "name": "Quakes",
    "kind": "rift_mutator",
    "owner": "Rift",
    "tier": null,
    "mechanic": "Every 10 beats, each unit is moved to a random adjacent hex if one fits.",
    "gameplayTags": [
      "rift-mutator",
      "movement"
    ]
  }
]
```

## troop_type_upgrade/Archer

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "archer-pinning-volley",
    "name": "Pinning Volley",
    "kind": "troop_type_upgrade",
    "owner": "Archer",
    "tier": 2,
    "mechanic": "Archer attacks reduce their target speed by 1 for the rest of the battle.",
    "gameplayTags": [
      "troop-type-upgrade",
      "archer",
      "damage",
      "speed",
      "ranged",
      "debuff"
    ]
  },
  {
    "id": "archer-shredding-arrows",
    "name": "Shredding Arrows",
    "kind": "troop_type_upgrade",
    "owner": "Archer",
    "tier": 2,
    "mechanic": "On attack: each Archer reduces its target armor by 1 for the rest of the battle.",
    "gameplayTags": [
      "troop-type-upgrade",
      "archer",
      "damage",
      "armor",
      "ranged",
      "debuff",
      "defense"
    ]
  }
]
```

## troop_type_upgrade/Avenger

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "avenger-blood-oath",
    "name": "Blood Oath",
    "kind": "troop_type_upgrade",
    "owner": "Avenger",
    "tier": 2,
    "mechanic": "When a nearby ally falls, set this Avenger initiative to 100.",
    "gameplayTags": [
      "troop-type-upgrade",
      "avenger",
      "initiative",
      "corpse"
    ]
  },
  {
    "id": "avenger-sevenfold",
    "name": "Sevenfold",
    "kind": "troop_type_upgrade",
    "owner": "Avenger",
    "tier": 2,
    "mechanic": "Whenever a nearby unit leaves a corpse, each Avenger may consume it to summon a skeleton there, up to 7 times per battle.",
    "gameplayTags": [
      "troop-type-upgrade",
      "avenger",
      "summon",
      "corpse"
    ]
  },
  {
    "id": "avenger-last-witness",
    "name": "Last Witness",
    "kind": "troop_type_upgrade",
    "owner": "Avenger",
    "tier": 3,
    "mechanic": "When an ally dies on this Avenger hex, it strikes the killer twice if the killer is still there.",
    "gameplayTags": [
      "troop-type-upgrade",
      "avenger",
      "damage",
      "corpse"
    ]
  }
]
```

## troop_type_upgrade/Beastmaster

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "beastmaster-blood-in-the-water",
    "name": "Blood in the Water",
    "kind": "troop_type_upgrade",
    "owner": "Beastmaster",
    "tier": 2,
    "mechanic": "Start-of-battle wolves summoned by Beastmasters also summon 1 wolf on each kill, and every new wolf inherits that effect.",
    "gameplayTags": [
      "troop-type-upgrade",
      "beastmaster",
      "damage",
      "summon"
    ]
  },
  {
    "id": "beastmaster-packmasters-whistle",
    "name": "Packmaster's Whistle",
    "kind": "troop_type_upgrade",
    "owner": "Beastmaster",
    "tier": 3,
    "mechanic": "End of turn: if the Beastmaster is engaged, one allied wolf on its hex redirects the engaged unit and is healed for 10.",
    "gameplayTags": [
      "troop-type-upgrade",
      "beastmaster",
      "initiative",
      "healing",
      "summon",
      "melee",
      "synergy",
      "defense"
    ]
  },
  {
    "id": "beastmaster-thrill-of-the-hunt",
    "name": "Thrill of the Hunt",
    "kind": "troop_type_upgrade",
    "owner": "Beastmaster",
    "tier": 3,
    "mechanic": "End of turn: wolves on this Beastmaster hex gain 10 initiative. Whenever any wolf gets a kill, allies on its hex gain +2 damage for the battle.",
    "gameplayTags": [
      "troop-type-upgrade",
      "beastmaster",
      "damage",
      "initiative",
      "summon"
    ]
  }
]
```

## troop_type_upgrade/Champion

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "champion-executioner",
    "name": "Executioner",
    "kind": "troop_type_upgrade",
    "owner": "Champion",
    "tier": 2,
    "mechanic": "Champions target the lowest-health enemy they are allowed to attack.",
    "gameplayTags": [
      "troop-type-upgrade",
      "champion",
      "damage",
      "healing"
    ]
  },
  {
    "id": "champion-anointed",
    "name": "Anointed",
    "kind": "troop_type_upgrade",
    "owner": "Champion",
    "tier": 3,
    "mechanic": "Whenever a Champion is healed or gains positive stats, it gains twice as much.",
    "gameplayTags": [
      "troop-type-upgrade",
      "champion",
      "healing"
    ]
  }
]
```

## troop_type_upgrade/Druid

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "druid-true-form",
    "name": "True Form",
    "kind": "troop_type_upgrade",
    "owner": "Druid",
    "tier": 2,
    "mechanic": "Druid's Shapeshift can now trigger an additional time.",
    "gameplayTags": [
      "troop-type-upgrade",
      "druid",
      "damage",
      "speed",
      "healing",
      "ranged",
      "transformation"
    ]
  },
  {
    "id": "druid-wild-growth",
    "name": "Wild Growth",
    "kind": "troop_type_upgrade",
    "owner": "Druid",
    "tier": 2,
    "mechanic": "End of turn: each Druid heals itself for 60.",
    "gameplayTags": [
      "troop-type-upgrade",
      "druid",
      "initiative",
      "healing"
    ]
  },
  {
    "id": "druid-bramble-snare",
    "name": "Bramble Snare",
    "kind": "troop_type_upgrade",
    "owner": "Druid",
    "tier": 3,
    "mechanic": "Each time a Druid shapeshifts, its melee attacks gain an additional battle-long -2 speed debuff on hit.",
    "gameplayTags": [
      "troop-type-upgrade",
      "druid",
      "speed",
      "melee",
      "debuff",
      "transformation"
    ]
  },
  {
    "id": "druid-thornhide",
    "name": "Thornhide",
    "kind": "troop_type_upgrade",
    "owner": "Druid",
    "tier": 3,
    "mechanic": "After shapeshifting, attackers take 6 damage whenever they hit the Druid with a normal attack.",
    "gameplayTags": [
      "troop-type-upgrade",
      "druid",
      "damage",
      "transformation"
    ]
  },
  {
    "id": "druid-wild-call",
    "name": "Wild Call",
    "kind": "troop_type_upgrade",
    "owner": "Druid",
    "tier": 3,
    "mechanic": "Whenever a Druid shapeshifts, it summons 2 wolves.",
    "gameplayTags": [
      "troop-type-upgrade",
      "druid",
      "summon",
      "transformation"
    ]
  }
]
```

## troop_type_upgrade/Elementalist

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "elementalist-arc-conductor",
    "name": "Arc Conductor",
    "kind": "troop_type_upgrade",
    "owner": "Elementalist",
    "tier": 2,
    "mechanic": "When an allied elemental dies, blast its hex for 8.",
    "gameplayTags": [
      "troop-type-upgrade",
      "elementalist",
      "damage",
      "summon",
      "corpse",
      "ranged",
      "synergy"
    ]
  },
  {
    "id": "elementalist-living-circuit",
    "name": "Living Circuit",
    "kind": "troop_type_upgrade",
    "owner": "Elementalist",
    "tier": 3,
    "mechanic": "End of turn: if any allied elemental is in range, this Elementalist gains 15 initiative once and all allied elementals in range gain 15 initiative.",
    "gameplayTags": [
      "troop-type-upgrade",
      "elementalist",
      "initiative",
      "summon",
      "ranged",
      "synergy"
    ]
  },
  {
    "id": "elementalist-mitosis",
    "name": "Mitosis",
    "kind": "troop_type_upgrade",
    "owner": "Elementalist",
    "tier": 3,
    "mechanic": "Every 4 turns, each Elementalist summons 1 elemental. Each summoned elemental can repeat that summon once after 4 turns.",
    "gameplayTags": [
      "troop-type-upgrade",
      "elementalist",
      "initiative",
      "summon"
    ]
  }
]
```

## troop_type_upgrade/Knight

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "knight-brace",
    "name": "Brace",
    "kind": "troop_type_upgrade",
    "owner": "Knight",
    "tier": 2,
    "mechanic": "Start of turn: if a Knight is engaged at full capacity, it gains +5 armor until next turn.",
    "gameplayTags": [
      "troop-type-upgrade",
      "knight",
      "armor",
      "initiative",
      "melee",
      "defense"
    ]
  },
  {
    "id": "knight-retaliate",
    "name": "Retaliate",
    "kind": "troop_type_upgrade",
    "owner": "Knight",
    "tier": 2,
    "mechanic": "Whenever a Knight is hit by a normal attack, it makes 1 normal attack back.",
    "gameplayTags": [
      "troop-type-upgrade",
      "knight",
      "damage",
      "melee"
    ]
  },
  {
    "id": "knight-challenge-accepted",
    "name": "Challenge Accepted",
    "kind": "troop_type_upgrade",
    "owner": "Knight",
    "tier": 3,
    "mechanic": "Enemies redirected by this unit deal 4 less damage while engaged with it.",
    "gameplayTags": [
      "troop-type-upgrade",
      "knight",
      "damage",
      "melee",
      "defense"
    ]
  },
  {
    "id": "knight-sentinel-runes",
    "name": "Sentinel Runes",
    "kind": "troop_type_upgrade",
    "owner": "Knight",
    "tier": 3,
    "mechanic": "The first time an enemy moves off a Knight's hex, summon 2 elementals on that unit's new hex. If unused, this also triggers when the Knight dies.",
    "gameplayTags": [
      "troop-type-upgrade",
      "knight",
      "summon",
      "corpse",
      "movement"
    ]
  }
]
```

## troop_type_upgrade/Militia

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "militia-rabble-rush",
    "name": "Rabble Rush",
    "kind": "troop_type_upgrade",
    "owner": "Militia",
    "tier": 2,
    "mechanic": "Start of turn: Militia gain +1 initiative for each other Militia on their hex.",
    "gameplayTags": [
      "troop-type-upgrade",
      "militia",
      "initiative"
    ]
  },
  {
    "id": "militia-dogpile",
    "name": "Dogpile",
    "kind": "troop_type_upgrade",
    "owner": "Militia",
    "tier": 3,
    "mechanic": "When Militia attack an enemy engaged by at least 3 allies, they strike 1 extra time.",
    "gameplayTags": [
      "troop-type-upgrade",
      "militia",
      "damage",
      "melee"
    ]
  },
  {
    "id": "militia-scurry",
    "name": "Scurry",
    "kind": "troop_type_upgrade",
    "owner": "Militia",
    "tier": 3,
    "mechanic": "Militia do not count toward allied saturation limits.",
    "gameplayTags": [
      "troop-type-upgrade",
      "militia",
      "synergy"
    ]
  }
]
```

## troop_type_upgrade/Necromancer

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "necromancer-alternate-fuel",
    "name": "Alternate Fuel",
    "kind": "troop_type_upgrade",
    "owner": "Necromancer",
    "tier": 2,
    "mechanic": "Necromancers may spend 10 health instead of requiring or consuming a corpse for corpse-consuming abilities, as long as that would not kill them.",
    "gameplayTags": [
      "troop-type-upgrade",
      "necromancer",
      "damage",
      "healing",
      "corpse"
    ]
  },
  {
    "id": "necromancer-early-riser",
    "name": "Early Riser",
    "kind": "troop_type_upgrade",
    "owner": "Necromancer",
    "tier": 2,
    "mechanic": "Skeletons summoned by Necromancers spawn with +100 initiative.",
    "gameplayTags": [
      "troop-type-upgrade",
      "necromancer",
      "initiative",
      "summon",
      "movement"
    ]
  },
  {
    "id": "necromancer-carrion-choir",
    "name": "Carrion Choir",
    "kind": "troop_type_upgrade",
    "owner": "Necromancer",
    "tier": 3,
    "mechanic": "Whenever this Necromancer consumes a corpse, enemies adjacent to that corpse lose 1 armor and 1 damage for the battle.",
    "gameplayTags": [
      "troop-type-upgrade",
      "necromancer",
      "damage",
      "armor",
      "corpse",
      "debuff",
      "defense"
    ]
  },
  {
    "id": "necromancer-rising-tide",
    "name": "Rising Tide",
    "kind": "troop_type_upgrade",
    "owner": "Necromancer",
    "tier": 3,
    "mechanic": "Skeletons summoned by Necromancers heal allies on their own hex for 7 at the end of each turn.",
    "gameplayTags": [
      "troop-type-upgrade",
      "necromancer",
      "initiative",
      "healing",
      "summon",
      "corpse"
    ]
  }
]
```

## troop_type_upgrade/Priest

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "priest-overflowing-grace",
    "name": "Overflowing Grace",
    "kind": "troop_type_upgrade",
    "owner": "Priest",
    "tier": 2,
    "mechanic": "When a Priest heal brings an ally to full HP, that ally gains 40 initiative.",
    "gameplayTags": [
      "troop-type-upgrade",
      "priest",
      "initiative",
      "healing"
    ]
  },
  {
    "id": "priest-mercy-before-dawn",
    "name": "Mercy Before Dawn",
    "kind": "troop_type_upgrade",
    "owner": "Priest",
    "tier": 3,
    "mechanic": "The first time each battle each allied unit within this Priest's range would die, it survives at 1 HP.",
    "gameplayTags": [
      "troop-type-upgrade",
      "priest",
      "healing",
      "corpse",
      "ranged",
      "synergy",
      "defense"
    ]
  },
  {
    "id": "priest-zeal",
    "name": "Zeal",
    "kind": "troop_type_upgrade",
    "owner": "Priest",
    "tier": 3,
    "mechanic": "Whenever a Priest heals a target, that same target also gains +1 speed and +1 damage for the battle.",
    "gameplayTags": [
      "troop-type-upgrade",
      "priest",
      "damage",
      "speed",
      "healing"
    ]
  }
]
```

## troop_type_upgrade/Ranger

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "ranger-concussive-shots",
    "name": "Concussive Shots",
    "kind": "troop_type_upgrade",
    "owner": "Ranger",
    "tier": 2,
    "mechanic": "On attack: each Ranger sets its target initiative to 0.",
    "gameplayTags": [
      "troop-type-upgrade",
      "ranger",
      "damage",
      "initiative",
      "ranged",
      "debuff"
    ]
  },
  {
    "id": "ranger-skirmishers-step",
    "name": "Skirmisher's Step",
    "kind": "troop_type_upgrade",
    "owner": "Ranger",
    "tier": 2,
    "mechanic": "After attacking, Rangers move to the safest hex that still keeps an enemy in range.",
    "gameplayTags": [
      "troop-type-upgrade",
      "ranger",
      "ranged",
      "melee",
      "movement"
    ]
  },
  {
    "id": "ranger-heartseeker",
    "name": "Heartseeker",
    "kind": "troop_type_upgrade",
    "owner": "Ranger",
    "tier": 3,
    "mechanic": "Ranger attacks against unengaged targets deal double damage.",
    "gameplayTags": [
      "troop-type-upgrade",
      "ranger",
      "damage",
      "ranged",
      "melee"
    ]
  },
  {
    "id": "ranger-scavengers-hunger",
    "name": "Scavenger's Hunger",
    "kind": "troop_type_upgrade",
    "owner": "Ranger",
    "tier": 3,
    "mechanic": "The first 3 times a Ranger kills a non-Fading enemy, consume the corpse and summon 1 wolf there.",
    "gameplayTags": [
      "troop-type-upgrade",
      "ranger",
      "summon",
      "corpse",
      "ranged"
    ]
  }
]
```

## troop_type_upgrade/Shaman

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "shaman-war-drums",
    "name": "War Drums",
    "kind": "troop_type_upgrade",
    "owner": "Shaman",
    "tier": 2,
    "mechanic": "Enhance 1 affects all allies on the chosen ally hex instead of one random ally.",
    "gameplayTags": [
      "troop-type-upgrade",
      "shaman",
      "initiative",
      "synergy"
    ]
  },
  {
    "id": "shaman-serve-once-more",
    "name": "Serve Once More",
    "kind": "troop_type_upgrade",
    "owner": "Shaman",
    "tier": 3,
    "mechanic": "Whenever a Shaman applies a beneficial effect, that target leaves no corpse on death and summons 1 skeleton on death.",
    "gameplayTags": [
      "troop-type-upgrade",
      "shaman",
      "summon",
      "corpse"
    ]
  },
  {
    "id": "shaman-static-charge",
    "name": "Static Charge",
    "kind": "troop_type_upgrade",
    "owner": "Shaman",
    "tier": 3,
    "mechanic": "When a Shaman applies Enhance, affected allies gain 1 extra strike on their next normal attack.",
    "gameplayTags": [
      "troop-type-upgrade",
      "shaman",
      "damage",
      "initiative"
    ]
  }
]
```

## troop_type_upgrade/Soldier

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "soldier-shield-drill",
    "name": "Shield Drill",
    "kind": "troop_type_upgrade",
    "owner": "Soldier",
    "tier": 2,
    "mechanic": "Allies on a Soldier's hex take 1 less damage from ranged attacks and strikes.",
    "gameplayTags": [
      "troop-type-upgrade",
      "soldier",
      "damage",
      "armor",
      "corpse",
      "ranged",
      "defense"
    ]
  }
]
```

## troop_type_upgrade/Wizard

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "wizard-leyline-focus",
    "name": "Leyline Focus",
    "kind": "troop_type_upgrade",
    "owner": "Wizard",
    "tier": 2,
    "mechanic": "Start of turn: if no enemy is within 1 hex, the Wizard gains 25 initiative.",
    "gameplayTags": [
      "troop-type-upgrade",
      "wizard",
      "initiative",
      "ranged"
    ]
  },
  {
    "id": "wizard-spell-echo",
    "name": "Spell Echo",
    "kind": "troop_type_upgrade",
    "owner": "Wizard",
    "tier": 2,
    "mechanic": "Each time this Wizard's Blast deals damage with Blast, repeat that Blast on an adjacent hex that hasn't been hit by any Blast in this chain.",
    "gameplayTags": [
      "troop-type-upgrade",
      "wizard",
      "damage",
      "ranged"
    ]
  },
  {
    "id": "wizard-storm",
    "name": "Storm",
    "kind": "troop_type_upgrade",
    "owner": "Wizard",
    "tier": 2,
    "mechanic": "Every 4 turns, each Wizard makes 4 extra strikes against a random enemy within its range.",
    "gameplayTags": [
      "troop-type-upgrade",
      "wizard",
      "damage",
      "initiative",
      "ranged"
    ]
  },
  {
    "id": "wizard-lightning-rods",
    "name": "Lightning Rods",
    "kind": "troop_type_upgrade",
    "owner": "Wizard",
    "tier": 3,
    "mechanic": "Wizard Blasts deal +1 damage per elemental on the target hex, and Wizards summon 1 elemental at the start of battle.",
    "gameplayTags": [
      "troop-type-upgrade",
      "wizard",
      "damage",
      "summon",
      "ranged"
    ]
  }
]
```
