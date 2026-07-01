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
    "mechanic": "Passive: one random unit from each troop has rate set to 1 at the start of combat.",
    "gameplayTags": [
      "base-ability",
      "rate"
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
      "readiness",
      "healing",
      "summon",
      "corpse",
      "synergy"
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
      "damage",
      "healing"
    ]
  },
  {
    "id": "arc-conductor",
    "name": "Arc Conductor",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when an allied elemental dies, blast all enemies within 2 hexes of its occupied hexes for 8.",
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
    "id": "barrage",
    "name": "Barrage",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: while not engaged, ranged attacks hit every enemy in range, but deal 40% less damage.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "ranged",
      "melee"
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
      "readiness",
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
    "mechanic": "On attack: all enemies within 2 hexes of the target's occupied hexes take 5 damage.",
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
    "mechanic": "When a touching ally dies: set readiness to 100.",
    "gameplayTags": [
      "base-ability",
      "readiness",
      "corpse"
    ]
  },
  {
    "id": "bolstering-light",
    "name": "Bolstering Light",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: Priest heals that bring a target to full HP give the target and Priest +1 rate and +1 damage; other Priest heals give both 40 readiness.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "rate",
      "readiness",
      "healing"
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
      "damage",
      "armor",
      "readiness",
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
    "mechanic": "Passive: each shapeshift empowers this unit so its melee attacks reduce target rate by 2 for the battle.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "rate",
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
      "readiness",
      "summon",
      "corpse",
      "debuff",
      "movement",
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
      "readiness",
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
      "readiness",
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
      "damage",
      "readiness",
      "summon",
      "corpse",
      "ranged",
      "synergy"
    ]
  },
  {
    "id": "concussive-shots",
    "name": "Concussive Shots",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "On attack: set the target readiness to 0.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "readiness",
      "summon",
      "corpse",
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
    "mechanic": "When a nearby unit leaves a corpse, consume it to summon a skeleton there. Summoned skeletons heal allies touching them.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "readiness",
      "healing",
      "summon",
      "corpse",
      "synergy"
    ]
  },
  {
    "id": "crack-exploits",
    "name": "Crack Exploits",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when an enemy loses armor, each allied Elementalist makes a normal attack against them ignoring range.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "armor",
      "summon",
      "ranged",
      "debuff",
      "synergy",
      "defense"
    ]
  },
  {
    "id": "crippling-hex",
    "name": "Crippling Hex",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: enemies who kill this Militia gain Hex. Hex reduces enemy rate.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "rate",
      "debuff"
    ]
  },
  {
    "id": "diggy-hole",
    "name": "Diggy Hole",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: does not spawn at battle start. After 10 beats, spawns on the enemy side of the board with 100 readiness.",
    "gameplayTags": [
      "base-ability",
      "readiness",
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
    "id": "dreamwork",
    "name": "Dreamwork",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: once per beat, attack an adjacent enemy when that enemy is hit by another ally's normal attack.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "readiness",
      "corpse"
    ]
  },
  {
    "id": "early-riser",
    "name": "Early Riser",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: skeletons this unit summons spawn with +100 readiness.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "armor",
      "readiness",
      "summon",
      "corpse",
      "debuff",
      "movement",
      "defense"
    ]
  },
  {
    "id": "elemental-sunder-1",
    "name": "Elemental Sunder",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: allied elementals remove 1 armor on attack.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "armor",
      "summon",
      "ranged",
      "debuff",
      "synergy",
      "defense"
    ]
  },
  {
    "id": "enhance-1",
    "name": "Enhance 1",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "End of turn: a random allied non-caster within this unit's range gains +1 rate and +1 damage for the battle.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "rate",
      "readiness",
      "ranged",
      "synergy"
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
      "healing",
      "ranged",
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
    "id": "final-hex",
    "name": "Final Hex",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: attacks apply Hexed. Attacking an enemy with 5 Hexed stacks kills it.",
    "gameplayTags": [
      "base-ability",
      "damage"
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
    "id": "forest-friends",
    "name": "Forest Friends",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: end of turn, heal self and all units Bonded to this unit for 20; whenever this unit shapeshifts, summon 2 wolves.",
    "gameplayTags": [
      "base-ability",
      "readiness",
      "healing",
      "summon",
      "transformation"
    ]
  },
  {
    "id": "forsaken-80",
    "name": "Forsaken 80",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Start of battle: if this is the only troop on its side, gain 80% health, damage, and rate.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "rate",
      "healing"
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
      "damage",
      "healing",
      "corpse",
      "debuff",
      "defense"
    ]
  },
  {
    "id": "gargantuan-zeal",
    "name": "Gargantuan Zeal",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when a Troll is present, one random unit from each allied troop gains Zeal at battle start. Zeal grants damage based on size.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "synergy"
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
    "mechanic": "On death: strike a random touching enemy one extra time.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "readiness",
      "corpse",
      "debuff"
    ]
  },
  {
    "id": "grave-vigor",
    "name": "Grave Vigor",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: after this unit beneficially affects an ally, that ally ignores future beneficial effects and targeting from Grave Vigor units.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "summon",
      "corpse"
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
      "melee",
      "movement"
    ]
  },
  {
    "id": "hexing-shots",
    "name": "Hexing Shots",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: Archer attacks deal +1 damage per Hex stack on the target.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "ranged"
    ]
  },
  {
    "id": "hold-the-standard",
    "name": "Hold the Standard",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: whenever a non-Fading ally dies, heal each Human unit for 15.",
    "gameplayTags": [
      "base-ability",
      "healing",
      "corpse"
    ]
  },
  {
    "id": "holy-constructs",
    "name": "Holy Constructs",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: while a Priest is present, the first time each non-Fading ally is healed, summon an Elemental adjacent to them. Elementals heal adjacent allies on death.",
    "gameplayTags": [
      "base-ability",
      "healing",
      "summon",
      "corpse"
    ]
  },
  {
    "id": "honorable-duel",
    "name": "Honorable Duel",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: this Champion cannot be targeted by normal attacks from enemies it is not engaged with.",
    "gameplayTags": [
      "base-ability",
      "melee"
    ]
  },
  {
    "id": "horde-4",
    "name": "Horde 4",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Start of turn: gain +4 damage per other touching friendly unit until end of turn.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "readiness",
      "synergy"
    ]
  },
  {
    "id": "hunters-zeal",
    "name": "Hunter's Zeal",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: on kill, this Ranger and allies adjacent to the killed enemy gain Zeal. Zeal grants readiness at end of turn.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "readiness",
      "ranged"
    ]
  },
  {
    "id": "last-witness",
    "name": "Last Witness",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when a touching ally dies, strike their killer twice if still in contact.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "readiness",
      "corpse"
    ]
  },
  {
    "id": "lightning-rods",
    "name": "Lightning Rods",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: Blast deals +1 damage per allied elemental on the battlefield.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "summon",
      "ranged",
      "synergy"
    ]
  },
  {
    "id": "living-circuit",
    "name": "Living Circuit",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: end of turn, gain 15 readiness once if any allied elemental is in range, and all allied elementals in range gain 15 readiness.",
    "gameplayTags": [
      "base-ability",
      "readiness",
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
    "mechanic": "Passive: ranged and caster attacks gain +1 damage and +2 readiness per hex of distance.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "readiness",
      "ranged",
      "debuff"
    ]
  },
  {
    "id": "martyrs-zeal",
    "name": "Martyr's Zeal",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when this Soldier dies, all allies gain Zeal. Zeal heals at end of turn.",
    "gameplayTags": [
      "base-ability",
      "readiness",
      "healing",
      "corpse"
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
      "readiness",
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
    "mechanic": "Passive: the first time each battle an ally in this unit's range would die, it survives at 1 HP. Priest heals repeat on allies in range below 10% HP.",
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
    "id": "opening",
    "name": "Opening",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when this unit hits an enemy, allies touching the target also attack that enemy.",
    "gameplayTags": [
      "base-ability",
      "damage"
    ]
  },
  {
    "id": "overwhelm-hex",
    "name": "Overwhelm Hex",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when a Goblin is present, one random unit from each enemy troop gains Hex at battle start. Hex drains health at end of turn.",
    "gameplayTags": [
      "base-ability",
      "readiness",
      "healing",
      "debuff"
    ]
  },
  {
    "id": "pack-1",
    "name": "Pack 1",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Start of turn: gain +1 damage per other touching friendly unit until end of turn.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "readiness",
      "synergy"
    ]
  },
  {
    "id": "pinning-volley",
    "name": "Pinning Volley",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "On attack: reduce the target rate by 1 for the battle.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "armor",
      "rate",
      "ranged",
      "debuff",
      "defense"
    ]
  },
  {
    "id": "combined-arms-20",
    "name": "Power of Friendship",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Start of battle: gain +20% health, +20% damage, and +20% rate for each other friendly troop on this side.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "rate",
      "healing",
      "synergy"
    ]
  },
  {
    "id": "rabble-rush",
    "name": "R-selected",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Start of turn: gain +10 readiness per other touching Militia. Overworld: Militia troops may enter the same Rift together.",
    "gameplayTags": [
      "base-ability",
      "readiness"
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
      "readiness",
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
      "armor",
      "readiness",
      "melee",
      "defense"
    ]
  },
  {
    "id": "rowdy-regrowth",
    "name": "Rowdy Regrowth",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: whenever this unit is healed, gain 20 readiness and +1 damage.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "readiness",
      "healing"
    ]
  },
  {
    "id": "saintbane",
    "name": "Saintbane",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when an enemy heals or gains stats, raise adjacent corpses as Skeletons.",
    "gameplayTags": [
      "base-ability",
      "healing",
      "summon",
      "corpse",
      "synergy"
    ]
  },
  {
    "id": "scavengers-hunger-2",
    "name": "Scavenger's Hunger",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: the first 2 times this unit kills a non-Fading enemy, consume the corpse and summon 1 wolf there.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "readiness",
      "summon",
      "corpse",
      "ranged"
    ]
  },
  {
    "id": "seeing-red",
    "name": "Seeing Red",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "On kill: lose 1 armor for the battle and gain 75 readiness.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "armor",
      "readiness",
      "debuff",
      "defense"
    ]
  },
  {
    "id": "self-haste-2",
    "name": "Self Haste 2",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "End of turn: gain +2 rate for the battle.",
    "gameplayTags": [
      "base-ability",
      "rate",
      "readiness"
    ]
  },
  {
    "id": "sentinel-runes",
    "name": "Sentinel Runes",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: the first time an enemy moves out of contact with this unit, summon 2 elementals at its new position; if unused, trigger on death instead.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "summon",
      "corpse",
      "melee",
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
      "damage",
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
    "mechanic": "After 5 turns, once: gain +100 health, +5 rate, +20 damage, set range to 0, and become a frontline unit.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "rate",
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
    "mechanic": "After every 5 turns, twice: gain +100 health, +5 rate, +20 damage, set range to 0, and become a frontline unit.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "rate",
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
    "mechanic": "Passive: ranged attacks can deal at most 1 damage to this unit after all modifiers.",
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
      "rate",
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
    "mechanic": "Passive: ranged and caster attacks made from max range make the target lose 30 readiness.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "readiness",
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
      "damage",
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
    "mechanic": "Passive: on kill, all enemies lose 10 readiness.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "readiness",
      "corpse",
      "debuff"
    ]
  },
  {
    "id": "spell-echo",
    "name": "Spell Echo",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: each Blast echoes from every enemy hit by that Blast or its echoes, but each enemy can be hit only once per Blast chain.",
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
    "mechanic": "Passive: after being hit by normal attacks, gain +1 armor and lose 1 rate for the battle.",
    "gameplayTags": [
      "base-ability",
      "armor",
      "rate",
      "debuff",
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
      "readiness",
      "summon",
      "corpse"
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
      "damage",
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
    "mechanic": "Every 4 turns: a random enemy within this unit range is struck 2 extra times.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "readiness",
      "summon",
      "ranged",
      "synergy"
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
      "ranged",
      "synergy"
    ]
  },
  {
    "id": "summon-wolf-1",
    "name": "Summon Wolf 1",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Start of battle: summon 1 wolf on this unit or an adjacent hex.",
    "gameplayTags": [
      "base-ability",
      "summon"
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
    "id": "sunder",
    "name": "Sunder",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "On attack: remove 20 armor from the target.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "armor",
      "defense"
    ]
  },
  {
    "id": "taunt",
    "name": "Taunt",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "End of turn: engage unengaged enemies in footprint contact up to Capacity.",
    "gameplayTags": [
      "base-ability",
      "readiness",
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
      "rate",
      "melee",
      "transformation"
    ]
  },
  {
    "id": "thrill-of-the-hunt",
    "name": "Thrill of the Hunt",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: when this side's wolf kills, summon 1 Wolf and all allied units gain +1 damage for the battle.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "summon",
      "synergy"
    ]
  },
  {
    "id": "throwing-axes",
    "name": "Throwing Axes",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: attacks deal extra damage equal to 10% of the target's current health before damage.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "healing",
      "ranged"
    ]
  },
  {
    "id": "triumph",
    "name": "Triumphant Zeal",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: on kill, this unit and touching allies gain Zeal. Zeal grants +10% damage, +10% rate, and +10% max health.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "rate",
      "healing"
    ]
  },
  {
    "id": "tubthumping",
    "name": "Tubthumping",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: effects that would reduce this unit damage or rate instead increase it by 1.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "rate",
      "debuff"
    ]
  },
  {
    "id": "united",
    "name": "United",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Overworld: troops of this race may enter the same Rift together.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "rate",
      "debuff",
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
    "mechanic": "On kill: heal allies touching the fallen unit for 20.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "healing",
      "corpse"
    ]
  },
  {
    "id": "vengeance-3",
    "name": "Vengeance 3",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "When a touching ally dies, gain +3 rate and +3 damage for the battle.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "rate",
      "corpse"
    ]
  },
  {
    "id": "vulnerability-hex",
    "name": "Vulnerability Hex",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: if a Wizard is present, enemies damaged by Blast can gain Hex. Hex makes enemies take more Blast damage.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "ranged"
    ]
  },
  {
    "id": "wages-of-virtue",
    "name": "Wages of Virtue",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "Passive: redirect incoming attack damage to a touching ally if possible. When a touching ally is healed, this unit is also healed.",
    "gameplayTags": [
      "base-ability",
      "damage",
      "healing",
      "defense"
    ]
  },
  {
    "id": "war-drums",
    "name": "War Drums",
    "kind": "ability",
    "owner": null,
    "tier": null,
    "mechanic": "End of turn: pick a random allied non-caster in range; enhance it and all allies touching it.",
    "gameplayTags": [
      "base-ability",
      "readiness",
      "ranged",
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
  }
]
```

## race_upgrade/Dwarves

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "dwarf-diggy-hole",
    "name": "Diggy Hole",
    "kind": "race_upgrade",
    "owner": "Dwarves",
    "tier": 1,
    "mechanic": "Dwarven units do not spawn at battle start. After 10 beats, they spawn on the enemy side of the board with 100 readiness.",
    "gameplayTags": [
      "race-upgrade",
      "dwarves",
      "readiness",
      "movement"
    ]
  },
  {
    "id": "dwarf-ale-and-hearty",
    "name": "Ale and Hearty",
    "kind": "race_upgrade",
    "owner": "Dwarves",
    "tier": 2,
    "mechanic": "Dwarven troops gain +60% rate. One random unit from each Dwarven troop has its rate set to 1 at the start of combat.",
    "gameplayTags": [
      "race-upgrade",
      "dwarves",
      "rate"
    ]
  },
  {
    "id": "dwarf-stall-warts",
    "name": "Stall Warts",
    "kind": "race_upgrade",
    "owner": "Dwarves",
    "tier": 3,
    "mechanic": "Dwarven troops gain +1 armor and lose 1 rate for the rest of the battle after they are hit by normal attacks.",
    "gameplayTags": [
      "race-upgrade",
      "dwarves",
      "armor",
      "rate",
      "debuff",
      "defense"
    ]
  }
]
```

## race_upgrade/Elves

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "elf-feline-grace",
    "name": "Feline Grace",
    "kind": "race_upgrade",
    "owner": "Elves",
    "tier": 1,
    "mechanic": "All non-melee elven troops gain +2 range. The first time each battle an engaged elven backline unit retreats 1 hex for free.",
    "gameplayTags": [
      "race-upgrade",
      "elves",
      "ranged",
      "melee",
      "movement"
    ]
  },
  {
    "id": "elf-silvershot-doctrine",
    "name": "Silvershot Doctrine",
    "kind": "race_upgrade",
    "owner": "Elves",
    "tier": 2,
    "mechanic": "Elven ranged and caster attacks gain +1 damage and +2 readiness per hex of distance to the target. Attacks made from max range make the target lose 30 readiness.",
    "gameplayTags": [
      "race-upgrade",
      "elves",
      "damage",
      "readiness",
      "ranged",
      "debuff"
    ]
  },
  {
    "id": "elven-forsaken",
    "name": "Forsaken",
    "kind": "race_upgrade",
    "owner": "Elves",
    "tier": 3,
    "mechanic": "Start of battle: if an elven unit is the only troop on its side, it gains +80% health, +80% damage, and +80% rate.",
    "gameplayTags": [
      "race-upgrade",
      "elves",
      "damage",
      "rate",
      "healing"
    ]
  }
]
```

## race_upgrade/Fae

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "fae-glamour",
    "name": "Glamour",
    "kind": "race_upgrade",
    "owner": "Fae",
    "tier": 2,
    "mechanic": "Once per battle per Fae unit, redirect an incoming normal attack to a random enemy in range as if the Fae unit made that attack.",
    "gameplayTags": [
      "race-upgrade",
      "fae",
      "damage",
      "ranged",
      "defense"
    ]
  },
  {
    "id": "fae-changeling",
    "name": "Changeling",
    "kind": "race_upgrade",
    "owner": "Fae",
    "tier": 3,
    "mechanic": "If a Fae troop was brought to battle, after beat 12 a random enemy unit from each enemy troop changes sides.",
    "gameplayTags": [
      "race-upgrade",
      "fae",
      "readiness",
      "summon",
      "transformation"
    ]
  },
  {
    "id": "fae-whimsy",
    "name": "Whimsy",
    "kind": "race_upgrade",
    "owner": "Fae",
    "tier": 3,
    "mechanic": "Whenever a Fae unit takes damage, it is relocated to a random hex.",
    "gameplayTags": [
      "race-upgrade",
      "fae",
      "damage",
      "movement"
    ]
  }
]
```

## race_upgrade/Goblins

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "goblin-behavior",
    "name": "Gallowsworn",
    "kind": "race_upgrade",
    "owner": "Goblins",
    "tier": 1,
    "mechanic": "On death: each goblin unit makes 1 extra strike against a random enemy touching it. When a goblin gets a kill, all enemies lose 10 readiness.",
    "gameplayTags": [
      "race-upgrade",
      "goblins",
      "damage",
      "readiness",
      "corpse",
      "debuff"
    ]
  },
  {
    "id": "goblin-overwhelm-hex",
    "name": "Overwhelm Hex",
    "kind": "race_upgrade",
    "owner": "Goblins",
    "tier": 1,
    "mechanic": "When a Goblin is present, a random unit from each enemy troop gains 1 stack of Hex at the start of the battle. Enemies lose health equal to the number of your living Goblins per stack of Hex they have at the end of their turn.",
    "gameplayTags": [
      "race-upgrade",
      "goblins",
      "readiness",
      "healing",
      "debuff"
    ]
  },
  {
    "id": "goblin-pack",
    "name": "Horde",
    "kind": "race_upgrade",
    "owner": "Goblins",
    "tier": 2,
    "mechanic": "Start of turn: each goblin unit gains +4 damage per other friendly unit touching it until end of turn.",
    "gameplayTags": [
      "race-upgrade",
      "goblins",
      "damage",
      "readiness",
      "synergy"
    ]
  }
]
```

## race_upgrade/Humans

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "human-tubthumping",
    "name": "Tubthumping",
    "kind": "race_upgrade",
    "owner": "Humans",
    "tier": 1,
    "mechanic": "Overworld: human troops may enter the same Rift together. Effects that would reduce a Human unit rate or damage instead increase it by 1.",
    "gameplayTags": [
      "race-upgrade",
      "humans",
      "damage",
      "rate",
      "debuff",
      "synergy"
    ]
  },
  {
    "id": "human-combined-arms",
    "name": "Combined Arms",
    "kind": "race_upgrade",
    "owner": "Humans",
    "tier": 2,
    "mechanic": "Start of battle: each human unit gains +20% health, +20% damage, and +20% rate for each other friendly troop on its side.",
    "gameplayTags": [
      "race-upgrade",
      "humans",
      "damage",
      "rate",
      "healing",
      "synergy"
    ]
  },
  {
    "id": "human-hold-the-standard",
    "name": "Hold the Standard",
    "kind": "race_upgrade",
    "owner": "Humans",
    "tier": 2,
    "mechanic": "Whenever a non-Fading ally dies, each Human unit heals 15.",
    "gameplayTags": [
      "race-upgrade",
      "humans",
      "healing",
      "corpse"
    ]
  }
]
```

## race_upgrade/Orcs

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "orc-seeing-red",
    "name": "Seeing Red",
    "kind": "race_upgrade",
    "owner": "Orcs",
    "tier": 1,
    "mechanic": "Whenever an Orc unit kills an enemy unit, it loses 1 armor for the battle and gains 75 readiness.",
    "gameplayTags": [
      "race-upgrade",
      "orcs",
      "damage",
      "armor",
      "readiness",
      "debuff",
      "defense"
    ]
  },
  {
    "id": "orc-first-blood",
    "name": "First Blood",
    "kind": "race_upgrade",
    "owner": "Orcs",
    "tier": 2,
    "mechanic": "Orc units attack their target whenever they engage, in addition to the normal engagement attack.",
    "gameplayTags": [
      "race-upgrade",
      "orcs",
      "damage",
      "melee"
    ]
  },
  {
    "id": "orc-berserk",
    "name": "Berserk",
    "kind": "race_upgrade",
    "owner": "Orcs",
    "tier": 3,
    "mechanic": "When an Orc unit would die from damage, its readiness is set to 0, it stops taking damage, and it dies at the end of its next turn.",
    "gameplayTags": [
      "race-upgrade",
      "orcs",
      "damage",
      "readiness",
      "corpse",
      "defense"
    ]
  }
]
```

## race_upgrade/Trolls

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "troll-gargantuan-zeal",
    "name": "Gargantuan Zeal",
    "kind": "race_upgrade",
    "owner": "Trolls",
    "tier": 1,
    "mechanic": "When a Troll is present, a random unit from each allied troop gains 1 stack of Zeal at the start of the battle. Allies gain damage equal to 5x their size for each stack of Zeal they have.",
    "gameplayTags": [
      "race-upgrade",
      "trolls",
      "damage",
      "synergy"
    ]
  },
  {
    "id": "troll-mossblood",
    "name": "Mossblood",
    "kind": "race_upgrade",
    "owner": "Trolls",
    "tier": 2,
    "mechanic": "After taking damage, each troll unit gains +1 damage for the rest of the battle. The first time each troll would die in a battle, it survives at 25 HP and loses Regen for the rest of that battle.",
    "gameplayTags": [
      "race-upgrade",
      "trolls",
      "damage",
      "healing",
      "corpse",
      "debuff",
      "defense"
    ]
  },
  {
    "id": "troll-rowdy-regrowth",
    "name": "Rowdy Regrowth",
    "kind": "race_upgrade",
    "owner": "Trolls",
    "tier": 2,
    "mechanic": "Whenever a Troll regains health, it gains 20 readiness and +1 damage.",
    "gameplayTags": [
      "race-upgrade",
      "trolls",
      "damage",
      "readiness",
      "healing"
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
      "readiness",
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
    "mechanic": "All units lose 5 readiness every beat.",
    "gameplayTags": [
      "rift-mutator",
      "readiness",
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
    "mechanic": "All units gain +10 readiness every beat.",
    "gameplayTags": [
      "rift-mutator",
      "readiness"
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

## troop_class_upgrade/Archer

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "archer-barrage",
    "name": "Barrage",
    "kind": "troop_class_upgrade",
    "owner": "Archer",
    "tier": 3,
    "mechanic": "Archers shoot all enemies within their attack range when they aren't engaged in melee, but their attacks deal 40% less damage.",
    "gameplayTags": [
      "troop-class-upgrade",
      "archer",
      "damage",
      "ranged",
      "melee"
    ]
  },
  {
    "id": "archer-crippling-shots",
    "name": "Crippling Shots",
    "kind": "troop_class_upgrade",
    "owner": "Archer",
    "tier": 3,
    "mechanic": "On attack: each Archer reduces its target armor by 1 and rate by 1 for the rest of the battle.",
    "gameplayTags": [
      "troop-class-upgrade",
      "archer",
      "damage",
      "armor",
      "rate",
      "ranged",
      "debuff",
      "defense"
    ]
  },
  {
    "id": "archer-hexing-shots",
    "name": "Hexing Shots",
    "kind": "troop_class_upgrade",
    "owner": "Archer",
    "tier": 3,
    "mechanic": "Archer attacks deal +1 damage per Hex stack on the target.",
    "gameplayTags": [
      "troop-class-upgrade",
      "archer",
      "damage",
      "ranged"
    ]
  }
]
```

## troop_class_upgrade/Avenger

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "avenger-sevenfold",
    "name": "Sevenfold",
    "kind": "troop_class_upgrade",
    "owner": "Avenger",
    "tier": 2,
    "mechanic": "Whenever a nearby unit leaves a corpse, each Avenger may consume it to summon a skeleton there, up to 7 times per battle.",
    "gameplayTags": [
      "troop-class-upgrade",
      "avenger",
      "summon",
      "corpse"
    ]
  },
  {
    "id": "avenger-wages-of-virtue",
    "name": "Wages of Virtue",
    "kind": "troop_class_upgrade",
    "owner": "Avenger",
    "tier": 3,
    "mechanic": "Avengers redirect damage taken to a random adjacent ally if possible. Whenever an ally adjacent to an Avenger is healed, that Avenger is also healed.",
    "gameplayTags": [
      "troop-class-upgrade",
      "avenger",
      "damage",
      "healing",
      "defense"
    ]
  },
  {
    "id": "avenger-witness",
    "name": "Witness",
    "kind": "troop_class_upgrade",
    "owner": "Avenger",
    "tier": 3,
    "mechanic": "When a nearby ally falls, set this Avenger readiness to 100. When a touching ally dies, it strikes the killer if still in contact.",
    "gameplayTags": [
      "troop-class-upgrade",
      "avenger",
      "readiness",
      "corpse"
    ]
  }
]
```

## troop_class_upgrade/Beastmaster

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "beastmaster-opening",
    "name": "Opening",
    "kind": "troop_class_upgrade",
    "owner": "Beastmaster",
    "tier": 3,
    "mechanic": "When a Beastmaster hits an enemy, all allies adjacent to the target also attack that enemy.",
    "gameplayTags": [
      "troop-class-upgrade",
      "beastmaster",
      "damage"
    ]
  },
  {
    "id": "beastmaster-thrill-of-the-hunt",
    "name": "Thrill of the Hunt",
    "kind": "troop_class_upgrade",
    "owner": "Beastmaster",
    "tier": 3,
    "mechanic": "Wolves summon 1 Wolf on each kill. Whenever any wolf gets a kill, all allies gain +1 damage for the battle.",
    "gameplayTags": [
      "troop-class-upgrade",
      "beastmaster",
      "damage",
      "summon",
      "synergy"
    ]
  },
  {
    "id": "beastmaster-throwing-axes",
    "name": "Throwing Axes",
    "kind": "troop_class_upgrade",
    "owner": "Beastmaster",
    "tier": 3,
    "mechanic": "Beastmasters gain 4 range. Their attacks deal additional damage equal to 10% of the enemy's current health.",
    "gameplayTags": [
      "troop-class-upgrade",
      "beastmaster",
      "damage",
      "healing",
      "ranged"
    ]
  }
]
```

## troop_class_upgrade/Champion

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "champion-anointed-executioner",
    "name": "Anointed Executioner",
    "kind": "troop_class_upgrade",
    "owner": "Champion",
    "tier": 3,
    "mechanic": "Champions target the lowest-health enemy they are allowed to attack. Whenever a Champion is healed or gains positive stats, it gains twice as much.",
    "gameplayTags": [
      "troop-class-upgrade",
      "champion",
      "damage",
      "healing"
    ]
  },
  {
    "id": "champion-honorable-duel",
    "name": "Honorable Duel",
    "kind": "troop_class_upgrade",
    "owner": "Champion",
    "tier": 3,
    "mechanic": "Champions cannot be targeted with normal attacks by enemies they aren't engaged with.",
    "gameplayTags": [
      "troop-class-upgrade",
      "champion",
      "melee"
    ]
  },
  {
    "id": "champion-triumph",
    "name": "Triumphant Zeal",
    "kind": "troop_class_upgrade",
    "owner": "Champion",
    "tier": 3,
    "mechanic": "On kill, Champions and touching allies gain a stack of Zeal. Allies gain +10% damage, +10% rate, and +10% max health for each stack of Zeal they have.",
    "gameplayTags": [
      "troop-class-upgrade",
      "champion",
      "damage",
      "rate",
      "healing"
    ]
  }
]
```

## troop_class_upgrade/Druid

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "druid-true-form",
    "name": "True Form",
    "kind": "troop_class_upgrade",
    "owner": "Druid",
    "tier": 2,
    "mechanic": "Druid's Shapeshift can now trigger an additional time.",
    "gameplayTags": [
      "troop-class-upgrade",
      "druid",
      "damage",
      "rate",
      "healing",
      "ranged",
      "transformation"
    ]
  },
  {
    "id": "druid-ents-visage",
    "name": "Ent's Visage",
    "kind": "troop_class_upgrade",
    "owner": "Druid",
    "tier": 3,
    "mechanic": "After shapeshifting, attackers take 6 damage whenever they hit the Druid with a normal attack. Each time a Druid shapeshifts, its melee attacks gain an additional battle-long -2 rate debuff on hit.",
    "gameplayTags": [
      "troop-class-upgrade",
      "druid",
      "damage",
      "rate",
      "melee",
      "transformation"
    ]
  },
  {
    "id": "druid-forest-friends",
    "name": "Forest Friends",
    "kind": "troop_class_upgrade",
    "owner": "Druid",
    "tier": 3,
    "mechanic": "End of turn: each Druid heals itself and all units Bonded to that specific Druid for 20. Whenever a Druid shapeshifts, it summons 2 wolves.",
    "gameplayTags": [
      "troop-class-upgrade",
      "druid",
      "readiness",
      "healing",
      "summon",
      "transformation"
    ]
  }
]
```

## troop_class_upgrade/Elementalist

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "elementalist-crack-exploits",
    "name": "Crack Exploits",
    "kind": "troop_class_upgrade",
    "owner": "Elementalist",
    "tier": 3,
    "mechanic": "Elementalists lose 5 damage. Whenever an enemy loses armor, each Elementalist makes a normal attack against them ignoring range. Allied elementals remove 1 armor on attack.",
    "gameplayTags": [
      "troop-class-upgrade",
      "elementalist",
      "damage",
      "armor",
      "summon",
      "ranged",
      "debuff",
      "synergy",
      "defense"
    ]
  },
  {
    "id": "elementalist-crackling-mitosis",
    "name": "Crackling Mitosis",
    "kind": "troop_class_upgrade",
    "owner": "Elementalist",
    "tier": 3,
    "mechanic": "When an allied elemental dies, blast enemies within 2 hexes of its occupied hexes for 8. Elementals summoned by Elementalists can repeat that summon once after 4 turns.",
    "gameplayTags": [
      "troop-class-upgrade",
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
    "kind": "troop_class_upgrade",
    "owner": "Elementalist",
    "tier": 3,
    "mechanic": "End of turn: if any allied elemental is in range, this Elementalist gains 15 readiness once and all allied elementals in range gain 15 readiness.",
    "gameplayTags": [
      "troop-class-upgrade",
      "elementalist",
      "readiness",
      "summon",
      "ranged",
      "synergy"
    ]
  }
]
```

## troop_class_upgrade/Knight

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "knight-dine-in-hell",
    "name": "Dine in Hell",
    "kind": "troop_class_upgrade",
    "owner": "Knight",
    "tier": 3,
    "mechanic": "Start of turn: if a Knight is engaged at full capacity, it gains +5 armor until next turn. Whenever a Knight is hit by a normal attack while engaged at full capacity, it makes 1 normal attack back.",
    "gameplayTags": [
      "troop-class-upgrade",
      "knight",
      "damage",
      "armor",
      "readiness",
      "melee",
      "defense"
    ]
  },
  {
    "id": "knight-sentinel-runes",
    "name": "Sentinel Runes",
    "kind": "troop_class_upgrade",
    "owner": "Knight",
    "tier": 3,
    "mechanic": "The first time an enemy moves out of contact with a Knight, summon 2 elementals at that unit's new position; they immediately engage and attack that unit. If unused, this also triggers on death against the killer.",
    "gameplayTags": [
      "troop-class-upgrade",
      "knight",
      "damage",
      "summon",
      "corpse",
      "melee",
      "movement"
    ]
  },
  {
    "id": "knight-sunder",
    "name": "Sunder",
    "kind": "troop_class_upgrade",
    "owner": "Knight",
    "tier": 3,
    "mechanic": "Knights remove 20 armor on attack.",
    "gameplayTags": [
      "troop-class-upgrade",
      "knight",
      "damage",
      "armor",
      "defense"
    ]
  }
]
```

## troop_class_upgrade/Militia

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "militia-crippling-hex",
    "name": "Crippling Hex",
    "kind": "troop_class_upgrade",
    "owner": "Militia",
    "tier": 3,
    "mechanic": "Enemies who kill Militia gain 1 stack of Hex. Enemies get -30% rate for each stack of Hex.",
    "gameplayTags": [
      "troop-class-upgrade",
      "militia",
      "damage",
      "rate",
      "debuff"
    ]
  },
  {
    "id": "militia-dogpile",
    "name": "Dogpile",
    "kind": "troop_class_upgrade",
    "owner": "Militia",
    "tier": 3,
    "mechanic": "When Militia attack an enemy engaged by at least 3 allies, they strike 1 extra time.",
    "gameplayTags": [
      "troop-class-upgrade",
      "militia",
      "damage",
      "melee"
    ]
  },
  {
    "id": "militia-rat-behavior",
    "name": "R-selected",
    "kind": "troop_class_upgrade",
    "owner": "Militia",
    "tier": 3,
    "mechanic": "Start of turn: Militia gain +10 readiness for each other Militia touching them. Overworld: multiple Militia troops may enter the same Rift together.",
    "gameplayTags": [
      "troop-class-upgrade",
      "militia",
      "readiness"
    ]
  }
]
```

## troop_class_upgrade/Necromancer

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "necromancer-explosion-corpse",
    "name": "Explosion Corpse",
    "kind": "troop_class_upgrade",
    "owner": "Necromancer",
    "tier": 3,
    "mechanic": "Skeletons summoned by Necromancers spawn with +100 readiness. Whenever this Necromancer consumes a corpse, enemies adjacent to that corpse lose 1 armor and 1 damage for the battle.",
    "gameplayTags": [
      "troop-class-upgrade",
      "necromancer",
      "damage",
      "armor",
      "readiness",
      "summon",
      "corpse",
      "debuff",
      "movement",
      "defense"
    ]
  },
  {
    "id": "necromancer-hemomancy",
    "name": "Hemomancy",
    "kind": "troop_class_upgrade",
    "owner": "Necromancer",
    "tier": 3,
    "mechanic": "Necromancers may spend 10 health instead of requiring or consuming a corpse for corpse-consuming abilities, as long as that would not kill them. Allied summoned Skeletons heal allies on their own hex for 7 at the end of each turn.",
    "gameplayTags": [
      "troop-class-upgrade",
      "necromancer",
      "damage",
      "readiness",
      "healing",
      "summon",
      "corpse",
      "synergy"
    ]
  },
  {
    "id": "necromancer-saintbane",
    "name": "Saintbane",
    "kind": "troop_class_upgrade",
    "owner": "Necromancer",
    "tier": 3,
    "mechanic": "Whenever an enemy gains stats or heals, all corpses adjacent to them are raised as Skeletons as though an allied Necromancer had summoned them.",
    "gameplayTags": [
      "troop-class-upgrade",
      "necromancer",
      "healing",
      "summon",
      "corpse",
      "synergy"
    ]
  }
]
```

## troop_class_upgrade/Priest

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "priest-bolstering-light",
    "name": "Bolstering Light",
    "kind": "troop_class_upgrade",
    "owner": "Priest",
    "tier": 3,
    "mechanic": "When a Priest heal brings its target to full HP, that target and the Priest gain +1 rate and +1 damage for the battle. Otherwise, that target and the Priest gain 40 readiness.",
    "gameplayTags": [
      "troop-class-upgrade",
      "priest",
      "damage",
      "rate",
      "readiness",
      "healing"
    ]
  },
  {
    "id": "priest-holy-constructs",
    "name": "Holy Constructs",
    "kind": "troop_class_upgrade",
    "owner": "Priest",
    "tier": 3,
    "mechanic": "While a Priest is present in a battle: the first time each non-Fading ally is healed, an Elemental is summoned adjacent to them. Elementals now heal adjacent allies by 20 on death.",
    "gameplayTags": [
      "troop-class-upgrade",
      "priest",
      "healing",
      "summon",
      "corpse"
    ]
  },
  {
    "id": "priest-mercy-before-dawn",
    "name": "Mercy Before Dawn",
    "kind": "troop_class_upgrade",
    "owner": "Priest",
    "tier": 3,
    "mechanic": "The first time each battle each allied unit within this Priest's range would die, it survives at 1 HP. Whenever a Priest heals an ally, the heal repeats on all allies in range under 10% health.",
    "gameplayTags": [
      "troop-class-upgrade",
      "priest",
      "healing",
      "corpse",
      "ranged",
      "synergy",
      "defense"
    ]
  }
]
```

## troop_class_upgrade/Ranger

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "ranger-hunters-zeal",
    "name": "Hunter's Zeal",
    "kind": "troop_class_upgrade",
    "owner": "Ranger",
    "tier": 3,
    "mechanic": "On kill, Rangers and allies adjacent to the killed enemy gain a stack of Zeal. Allies gain 5 readiness for each stack of Zeal they have at the end of their turns.",
    "gameplayTags": [
      "troop-class-upgrade",
      "ranger",
      "damage",
      "readiness",
      "ranged"
    ]
  },
  {
    "id": "ranger-on-the-hunt",
    "name": "On the Hunt",
    "kind": "troop_class_upgrade",
    "owner": "Ranger",
    "tier": 3,
    "mechanic": "On attack: each Ranger sets its target readiness to 0. The first 2 times a Ranger kills a non-Fading enemy, consume the corpse and summon 1 wolf there.",
    "gameplayTags": [
      "troop-class-upgrade",
      "ranger",
      "damage",
      "readiness",
      "summon",
      "corpse",
      "ranged",
      "debuff"
    ]
  },
  {
    "id": "ranger-shadows-embrace",
    "name": "Shadow's Embrace",
    "kind": "troop_class_upgrade",
    "owner": "Ranger",
    "tier": 3,
    "mechanic": "After attacking, Rangers move to the safest hex that still keeps an enemy in range. Ranger attacks against unengaged targets deal double damage.",
    "gameplayTags": [
      "troop-class-upgrade",
      "ranger",
      "damage",
      "ranged",
      "melee",
      "movement"
    ]
  }
]
```

## troop_class_upgrade/Shaman

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "shaman-war-drums",
    "name": "War Drums",
    "kind": "troop_class_upgrade",
    "owner": "Shaman",
    "tier": 2,
    "mechanic": "Enhance 1 affects all allies on the chosen ally hex instead of one random ally.",
    "gameplayTags": [
      "troop-class-upgrade",
      "shaman",
      "readiness",
      "ranged",
      "synergy"
    ]
  },
  {
    "id": "shaman-final-hex",
    "name": "Final Hex",
    "kind": "troop_class_upgrade",
    "owner": "Shaman",
    "tier": 3,
    "mechanic": "Shamans apply 1 stack of Hexed to enemies they attack. When attacking an enemy with 5 stacks of Hexed, Shamans kill that enemy.",
    "gameplayTags": [
      "troop-class-upgrade",
      "shaman",
      "damage"
    ]
  },
  {
    "id": "shaman-grave-vigor",
    "name": "Grave Vigor",
    "kind": "troop_class_upgrade",
    "owner": "Shaman",
    "tier": 3,
    "mechanic": "Whenever a Shaman applies a beneficial effect, that target leaves no corpse on death and summons 1 skeleton on death, gains 1 extra strike on its next normal attack if the effect was Enhance, and then ignores future beneficial effects and targeting from units with Grave Vigor.",
    "gameplayTags": [
      "troop-class-upgrade",
      "shaman",
      "damage",
      "summon",
      "corpse"
    ]
  }
]
```

## troop_class_upgrade/Soldier

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "soldier-dreamwork",
    "name": "Dreamwork",
    "kind": "troop_class_upgrade",
    "owner": "Soldier",
    "tier": 3,
    "mechanic": "Whenever an enemy adjacent to a Soldier is hit by another ally's normal attack, that Soldier makes a normal attack against it. Each Soldier can trigger at most once per beat.",
    "gameplayTags": [
      "troop-class-upgrade",
      "soldier",
      "damage",
      "readiness",
      "corpse"
    ]
  },
  {
    "id": "soldier-martyrs-zeal",
    "name": "Martyr's Zeal",
    "kind": "troop_class_upgrade",
    "owner": "Soldier",
    "tier": 3,
    "mechanic": "When a Soldier dies, all allies gain a stack of Zeal. Allies heal 5 health for each stack of Zeal they have at the end of their turns.",
    "gameplayTags": [
      "troop-class-upgrade",
      "soldier",
      "readiness",
      "healing",
      "corpse"
    ]
  },
  {
    "id": "soldier-shield-drill",
    "name": "Shield Drill",
    "kind": "troop_class_upgrade",
    "owner": "Soldier",
    "tier": 3,
    "mechanic": "Soldiers have -4 armor, but each ranged attack can deal at most 1 damage to a Soldier after all modifiers.",
    "gameplayTags": [
      "troop-class-upgrade",
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

## troop_class_upgrade/Wizard

Generate a contact sheet of separate square icons for the following Shiftmake mechanics. Use the shared style bible. Do not put text, labels, letters, or numbers inside the icons.

Strict layout: make a simple grid of equal square cells, one icon per cell. Each cell should contain only a centered, simple 32x32-readable symbol. Do not draw ornate card frames, full characters, banners, scenes, or rectangular panels.

```json
[
  {
    "id": "wizard-spell-echo",
    "name": "Spell Echo",
    "kind": "troop_class_upgrade",
    "owner": "Wizard",
    "tier": 2,
    "mechanic": "Each time this Wizard's Blast hits enemies, repeat that Blast from every enemy hit by that Blast or its echoes, but no enemy can be hit more than once per Blast chain.",
    "gameplayTags": [
      "troop-class-upgrade",
      "wizard",
      "damage",
      "ranged"
    ]
  },
  {
    "id": "wizard-storm-rods",
    "name": "Storm Rods",
    "kind": "troop_class_upgrade",
    "owner": "Wizard",
    "tier": 3,
    "mechanic": "Every 4 turns, each Wizard makes 2 extra strikes against a random enemy within its range. Wizard Blasts deal +1 damage per allied elemental on the battlefield, and Wizards summon 1 elemental at the start of battle.",
    "gameplayTags": [
      "troop-class-upgrade",
      "wizard",
      "damage",
      "readiness",
      "summon",
      "ranged",
      "synergy"
    ]
  },
  {
    "id": "wizard-vulnerability-hex",
    "name": "Vulnerability Hex",
    "kind": "troop_class_upgrade",
    "owner": "Wizard",
    "tier": 3,
    "mechanic": "If a Wizard is present in a battle, enemies damaged by Blast have a 20% chance of gaining a stack of Hex. Each enemy takes an additional 100% damage from Blast for each stack of Hex they have.",
    "gameplayTags": [
      "troop-class-upgrade",
      "wizard",
      "damage",
      "ranged"
    ]
  }
]
```
