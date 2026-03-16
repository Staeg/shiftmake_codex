// scripts/reportPermutationsCommon.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";

// src/engine/hex.ts
var NEIGHBOR_DIRS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 }
];
function hexKey(coord) {
  return `${coord.q},${coord.r}`;
}
function addHex(a, b) {
  return { q: a.q + b.q, r: a.r + b.r };
}
function equalsHex(a, b) {
  return a.q === b.q && a.r === b.r;
}
function hexDistance(a, b) {
  const aq = a.q;
  const ar = a.r;
  const as = -aq - ar;
  const bq = b.q;
  const br = b.r;
  const bs = -bq - br;
  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}
function neighbors(coord) {
  return NEIGHBOR_DIRS.map((dir) => addHex(coord, dir));
}
function inRadius(coord, radius) {
  return hexDistance(coord, { q: 0, r: 0 }) <= radius;
}

// src/engine/fixed.ts
var FIXED_PRECISION = 100;
function fixed(value) {
  return Math.round((value + Number.EPSILON) * FIXED_PRECISION) / FIXED_PRECISION;
}
function fixedAdd(a, b) {
  return fixed(a + b);
}
function fixedSub(a, b) {
  return fixed(a - b);
}
function fixedMul(a, b) {
  return fixed(a * b);
}
function fixedClamp(value, min, max) {
  return Math.max(min, Math.min(max, fixed(value)));
}
function fixedMax(value, min) {
  return Math.max(min, fixed(value));
}
function fixedSum(values) {
  return values.reduce((sum, value) => fixedAdd(sum, value), 0);
}
function formatFixed(value) {
  const rounded = fixed(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

// src/engine/rng.ts
function createRng(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = 1664525 * state + 1013904223 >>> 0;
    return state / 4294967296;
  };
  return {
    next,
    int(maxExclusive) {
      if (maxExclusive <= 0) {
        throw new Error("maxExclusive must be positive");
      }
      return Math.floor(next() * maxExclusive);
    },
    pick(items) {
      if (items.length === 0) {
        throw new Error("Cannot pick from empty array");
      }
      return items[this.int(items.length)];
    },
    shuffle(items) {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = this.int(i + 1);
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    }
  };
}

// src/engine/unitCatalog.ts
var STAT_KEYS = ["health", "damage", "speed", "range", "armor", "size", "capacity"];
function makeAbility(definition) {
  return definition;
}
function instantDuration() {
  return { kind: "instant" };
}
function battleDuration() {
  return { kind: "battle" };
}
function turnsDuration(turns) {
  return { kind: "turns", turns };
}
function selfTarget() {
  return { mode: "self" };
}
function randomTarget(allegiance, radius, filters) {
  return radius === "selfRange" ? { mode: "random", allegiance, radiusSource: "selfRange", filters } : { mode: "random", allegiance, radius, filters };
}
function aoeTarget(allegiance, radius, filters) {
  return radius === "selfRange" ? { mode: "aoe", allegiance, radiusSource: "selfRange", filters } : { mode: "aoe", allegiance, radius, filters };
}
function statEffect(kind, amount, mode) {
  return { kind, amount, mode };
}
function roleset(role) {
  return { kind: "roleset", role };
}
function redirectEffect() {
  return { kind: "redirect" };
}
function summonEffect(unitTypeId, count, consumeFallenUnitCorpse = false) {
  return { kind: "summon", unitTypeId, count, consumeFallenUnitCorpse };
}
function makeSelfStatAbility(id, label, timing, effects, shortText, duration = battleDuration(), triggerOpts) {
  return makeAbility({ id, label, trigger: { timing, ...triggerOpts }, duration, target: selfTarget(), effects, shortText });
}
function makeTripleStatAbility(id, label, amount, shortText, triggerOpts) {
  return makeSelfStatAbility(
    id,
    label,
    "startOfBattle",
    [statEffect("bolster", amount, "percent"), statEffect("haste", amount, "percent"), statEffect("ramp", amount, "percent")],
    shortText,
    battleDuration(),
    triggerOpts
  );
}
var ABILITIES = {
  "blast-5": makeAbility({
    id: "blast-5",
    label: "Blast 5",
    trigger: { timing: "onAttack" },
    duration: instantDuration(),
    effects: [{ kind: "blast", amount: 5 }],
    shortText: "On attack: all enemies on the attacked hex take 5 damage."
  }),
  "regen-5": makeSelfStatAbility("regen-5", "Regen 5", "endOfTurn", [statEffect("heal", 5, "flat")], "End of turn: heal self for 5.", instantDuration()),
  "valor-20": makeAbility({
    id: "valor-20",
    label: "Valor 20",
    trigger: { timing: "onKill" },
    duration: instantDuration(),
    target: aoeTarget("ally", 0),
    effects: [statEffect("heal", 20, "flat")],
    shortText: "On kill: heal allies on this hex for 20."
  }),
  united: makeAbility({
    id: "united",
    label: "United",
    trigger: { timing: "passive" },
    duration: instantDuration(),
    effects: [],
    overworldEffectId: "united",
    shortText: "Overworld: troops of this faction may enter the same Rift together."
  }),
  "combined-arms-20": makeTripleStatAbility(
    "combined-arms-20",
    "Power of Friendship",
    20,
    "Start of battle: gain 20% health, damage, and speed for each other friendly troop type.",
    { repeatPerDistinctFriendlyTroopType: true }
  ),
  "forsaken-80": makeTripleStatAbility(
    "forsaken-80",
    "Forsaken 80",
    80,
    "Start of battle: if no other friendly troop types are present, gain 80% health, damage, and speed.",
    { condition: "forsaken" }
  ),
  "goblin-farewell": makeAbility({
    id: "goblin-farewell",
    label: "Goblin Farewell",
    trigger: { timing: "onDeath" },
    duration: instantDuration(),
    target: randomTarget("enemy", 0),
    effects: [{ kind: "strike", amount: 1 }],
    shortText: "On death: strike a random enemy on this hex one extra time."
  }),
  "pack-1": makeSelfStatAbility(
    "pack-1",
    "Pack 1",
    "startOfTurn",
    [statEffect("ramp", 1, "flat")],
    "Start of turn: gain +1 damage per other friendly unit on this hex until end of turn.",
    turnsDuration(1),
    { repeatPerOtherFriendlyUnitOnHex: true }
  ),
  "mend-4": makeAbility({
    id: "mend-4",
    label: "Mend 4",
    trigger: { timing: "endOfTurn" },
    duration: instantDuration(),
    target: aoeTarget("ally", "selfRange"),
    effects: [statEffect("heal", 4, "flat")],
    shortText: "End of turn: heal allies within this unit's range for 4."
  }),
  "haste-1": makeAbility({
    id: "haste-1",
    label: "Haste 1",
    trigger: { timing: "endOfTurn" },
    duration: battleDuration(),
    target: randomTarget("ally", "selfRange"),
    effects: [statEffect("haste", 1, "flat")],
    shortText: "End of turn: a random allied unit within this unit's range gains +1 speed for the battle."
  }),
  "ramp-1": makeSelfStatAbility("ramp-1", "Ramp 1", "endOfTurn", [statEffect("ramp", 1, "flat")], "End of turn: gain +1 damage for the battle."),
  "frenzy-ramp-1": makeSelfStatAbility("frenzy-ramp-1", "Frenzy: Ramp 1", "onDamaged", [statEffect("ramp", 1, "flat")], "After taking damage: gain +1 damage for the battle."),
  taunt: makeAbility({
    id: "taunt",
    label: "Taunt",
    trigger: { timing: "endOfTurn" },
    duration: instantDuration(),
    target: aoeTarget("enemy", 0, { unengaged: true }),
    effects: [redirectEffect()],
    shortText: "End of turn: engage unengaged enemies on this hex up to Capacity."
  }),
  "vengeance-1": makeAbility({
    id: "vengeance-1",
    label: "Vengeance 1",
    trigger: { timing: "onFallen", fallen: { allegiance: "ally", radius: 0 } },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [statEffect("haste", 1, "flat"), statEffect("ramp", 1, "flat")],
    shortText: "When an ally dies on this hex, gain +1 speed and +1 damage for the battle."
  }),
  "enhance-1": makeAbility({
    id: "enhance-1",
    label: "Enhance 1",
    trigger: { timing: "endOfTurn" },
    duration: battleDuration(),
    target: randomTarget("ally", "selfRange", { notTypes: ["caster"] }),
    effects: [statEffect("haste", 1, "flat"), statEffect("ramp", 1, "flat")],
    shortText: "End of turn: a random allied non-caster within this unit's range gains +1 speed and +1 damage for the battle."
  }),
  "shapeshift-bear": makeAbility({
    id: "shapeshift-bear",
    label: "Shapeshift - Bear",
    trigger: { timing: "endOfTurn", chargeEvery: 5, maxUses: 1 },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [
      statEffect("bolster", 100, "flat"),
      statEffect("haste", 5, "flat"),
      statEffect("ramp", 20, "flat"),
      { kind: "rangeset", value: 0 },
      roleset("frontline")
    ],
    shortText: "After 5 turns, transform once: gain health, speed, and damage, then become a frontline melee unit."
  }),
  bonded: makeAbility({
    id: "bonded",
    label: "Bonded",
    trigger: { timing: "passive" },
    duration: instantDuration(),
    effects: [],
    shortText: "Passive: dies when its summoner dies."
  }),
  fading: makeAbility({
    id: "fading",
    label: "Fading",
    trigger: { timing: "passive" },
    duration: instantDuration(),
    effects: [],
    shortText: "Passive: does not leave a corpse on death."
  }),
  "summon-wolf-2": makeAbility({
    id: "summon-wolf-2",
    label: "Summon Wolf 2",
    trigger: { timing: "startOfBattle" },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [summonEffect("wolf", 2)],
    shortText: "Start of battle: summon 2 wolves on this unit or adjacent hexes."
  }),
  "charge-4-summon-elemental": makeAbility({
    id: "charge-4-summon-elemental",
    label: "Charge 4 Summon Elemental",
    trigger: { timing: "endOfTurn", chargeEvery: 4 },
    duration: battleDuration(),
    target: selfTarget(),
    effects: [summonEffect("elemental", 1)],
    shortText: "Every 4 turns: summon 1 elemental on this unit or an adjacent hex."
  }),
  "corpse-summon-skeleton": makeAbility({
    id: "corpse-summon-skeleton",
    label: "Corpse Summon Skeleton",
    trigger: { timing: "onFallen", fallen: { allegiance: "all", radius: 0, radiusSource: "selfRange" } },
    duration: battleDuration(),
    effects: [summonEffect("skeleton", 1, true)],
    shortText: "When a nearby unit leaves a corpse, consume it to summon a skeleton there."
  })
};
var UNIT_TYPES = {
  soldier: {
    id: "soldier",
    label: "Soldier",
    role: "frontline",
    type: "soldier",
    attributes: ["melee"],
    stats: { health: 100, damage: 10, speed: 10, range: 0, armor: 2, size: 1, capacity: 2 },
    quantity: 1,
    cost: 24,
    abilityIds: []
  },
  champion: {
    id: "champion",
    label: "Champion",
    role: "frontline",
    type: "champion",
    attributes: ["melee"],
    stats: { health: 130, damage: 20, speed: 17, range: 0, armor: 0, size: 2, capacity: 1 },
    quantity: 1,
    cost: 60,
    abilityIds: ["valor-20"]
  },
  avenger: {
    id: "avenger",
    label: "Avenger",
    role: "frontline",
    type: "avenger",
    attributes: ["melee"],
    stats: { health: 200, damage: 10, speed: 10, range: 0, armor: 0, size: 2, capacity: 1 },
    quantity: 1,
    cost: 40,
    abilityIds: ["vengeance-1"]
  },
  beastmaster: {
    id: "beastmaster",
    label: "Beastmaster",
    role: "frontline",
    type: "beastmaster",
    attributes: ["melee", "summoner"],
    stats: { health: 100, damage: 8, speed: 8, range: 0, armor: 0, size: 2, capacity: 1 },
    quantity: 1,
    cost: 60,
    abilityIds: ["summon-wolf-2"]
  },
  druid: {
    id: "druid",
    label: "Druid",
    role: "backline",
    type: "druid",
    attributes: ["caster"],
    stats: { health: 25, damage: 11, speed: 8, range: 2, armor: 0, size: 1, capacity: 0 },
    quantity: 1,
    cost: 30,
    abilityIds: ["shapeshift-bear"]
  },
  elemental: {
    id: "elemental",
    label: "Elemental",
    role: "frontline",
    type: "elemental",
    attributes: ["melee", "summoned"],
    stats: { health: 60, damage: 13, speed: 7, range: 2, armor: 4, size: 1, capacity: 3 },
    quantity: 1,
    cost: 20,
    abilityIds: []
  },
  elementalist: {
    id: "elementalist",
    label: "Elementalist",
    role: "backline",
    type: "elementalist",
    attributes: ["caster", "summoner"],
    stats: { health: 25, damage: 10, speed: 8, range: 2, armor: 0, size: 1, capacity: 0 },
    quantity: 1,
    cost: 30,
    abilityIds: ["charge-4-summon-elemental"]
  },
  knight: {
    id: "knight",
    label: "Knight",
    role: "frontline",
    type: "knight",
    attributes: ["melee"],
    stats: { health: 200, damage: 16, speed: 7, range: 0, armor: 10, size: 2, capacity: 5 },
    quantity: 1,
    cost: 60,
    abilityIds: ["taunt"]
  },
  militia: {
    id: "militia",
    label: "Militia",
    role: "chaff",
    type: "militia",
    attributes: ["melee", "expendable"],
    stats: { health: 40, damage: 8, speed: 11, range: 0, armor: 0, size: 1, capacity: 1 },
    quantity: 1,
    cost: 10,
    abilityIds: []
  },
  archer: {
    id: "archer",
    label: "Archer",
    role: "backline",
    type: "archer",
    attributes: ["ranged"],
    stats: { health: 30, damage: 10, speed: 11, range: 2, armor: 0, size: 1, capacity: 0 },
    quantity: 1,
    cost: 20,
    abilityIds: []
  },
  wizard: {
    id: "wizard",
    label: "Wizard",
    role: "backline",
    type: "wizard",
    attributes: ["caster"],
    stats: { health: 20, damage: 9, speed: 8, range: 2, armor: 0, size: 1, capacity: 0 },
    quantity: 1,
    cost: 20,
    abilityIds: ["blast-5"]
  },
  priest: {
    id: "priest",
    label: "Priest",
    role: "backline",
    type: "priest",
    attributes: ["caster"],
    stats: { health: 25, damage: 7, speed: 8, range: 2, armor: 0, size: 1, capacity: 0 },
    quantity: 1,
    cost: 20,
    abilityIds: ["mend-4"]
  },
  ranger: {
    id: "ranger",
    label: "Ranger",
    role: "backline",
    type: "ranger",
    attributes: ["ranged"],
    stats: { health: 50, damage: 15, speed: 12, range: 3, armor: 0, size: 1, capacity: 0 },
    quantity: 1,
    cost: 60,
    abilityIds: ["haste-1"]
  },
  necromancer: {
    id: "necromancer",
    label: "Necromancer",
    role: "backline",
    type: "necromancer",
    attributes: ["caster", "summoner"],
    stats: { health: 40, damage: 16, speed: 8, range: 2, armor: 0, size: 1, capacity: 0 },
    quantity: 1,
    cost: 40,
    abilityIds: ["corpse-summon-skeleton"]
  },
  skeleton: {
    id: "skeleton",
    label: "Skeleton",
    role: "chaff",
    type: "skeleton",
    attributes: ["melee", "summoned"],
    stats: { health: 40, damage: 13, speed: 7, range: 2, armor: 0, size: 1, capacity: 1 },
    quantity: 1,
    cost: 20,
    abilityIds: ["bonded", "fading"]
  },
  shaman: {
    id: "shaman",
    label: "Shaman",
    role: "backline",
    type: "shaman",
    attributes: ["caster"],
    stats: { health: 20, damage: 11, speed: 8, range: 2, armor: 0, size: 1, capacity: 0 },
    quantity: 1,
    cost: 20,
    abilityIds: ["enhance-1"]
  },
  wolf: {
    id: "wolf",
    label: "Wolf",
    role: "chaff",
    type: "wolf",
    attributes: ["melee", "summoned"],
    stats: { health: 60, damage: 5, speed: 12, range: 2, armor: 0, size: 1, capacity: 1 },
    quantity: 1,
    cost: 20,
    abilityIds: ["bonded", "pack-1"]
  }
};
var FACTIONS = {
  human: {
    id: "human",
    label: "Humans",
    singularLabel: "Human",
    description: "Slightly better at pretty much everything. Boring but solid.",
    addedAttributes: ["human"],
    defaultUnitTypeIds: ["soldier", "archer", "knight", "priest"],
    blueprintUnitTypeIds: ["avenger", "militia"],
    statAdjustments: {
      health: { multiplier: 1.1 },
      damage: { multiplier: 1.1 },
      speed: { multiplier: 1.1 },
      armor: { flat: 1 },
      capacity: { flat: 1 },
      cost: { multiplier: 0.9 }
    },
    abilityIds: []
  },
  elf: {
    id: "elf",
    label: "Elves",
    singularLabel: "Elven",
    description: "Feared from afar. Less so up close.",
    addedAttributes: ["elf"],
    defaultUnitTypeIds: ["archer", "druid", "soldier", "wizard"],
    blueprintUnitTypeIds: ["elementalist", "ranger"],
    statAdjustments: {
      health: { multiplier: 0.9 },
      damage: { multiplier: 1.2 },
      speed: { multiplier: 1.2 },
      range: { flat: 1 },
      cost: { multiplier: 1.1 }
    },
    abilityIds: []
  },
  goblin: {
    id: "goblin",
    label: "Goblins",
    singularLabel: "Goblin",
    description: "The one good thing you can say about goblins is that there's more than one of them.",
    addedAttributes: ["goblin", "expendable"],
    defaultUnitTypeIds: ["militia", "shaman", "soldier", "wizard"],
    blueprintUnitTypeIds: ["beastmaster", "druid"],
    statAdjustments: {
      health: { multiplier: 0.7 },
      damage: { multiplier: 0.8 },
      range: { flat: -1 },
      armor: { flat: -2 },
      size: { flat: -1 },
      capacity: { flat: -2 },
      cost: { multiplier: 0.4 }
    },
    abilityIds: []
  },
  troll: {
    id: "troll",
    label: "Trolls",
    singularLabel: "Troll",
    description: "Never down for the count, never down for counting.",
    addedAttributes: ["troll"],
    defaultUnitTypeIds: ["avenger", "champion", "shaman", "soldier"],
    blueprintUnitTypeIds: ["necromancer", "knight"],
    statAdjustments: {
      health: { multiplier: 1.3 },
      damage: { multiplier: 1.2 },
      speed: { multiplier: 0.8 },
      size: { flat: 1 },
      capacity: { flat: 1 },
      cost: { multiplier: 1.3 }
    },
    abilityIds: ["regen-5"]
  }
};
var MUTATORS = {
  momentum: {
    id: "momentum",
    label: "Momentum",
    description: "All units gain +10 initiative every beat.",
    enemyBudgetMultiplier: 1,
    rewardMultiplier: 1,
    initiativeBonusPerBeat: 10
  },
  "heavy-air": {
    id: "heavy-air",
    label: "Heavy Air",
    description: "Ranged attack damage is reduced by 50%.",
    enemyBudgetMultiplier: 1,
    rewardMultiplier: 1,
    rangedDamageMultiplier: 0.5
  },
  rich: {
    id: "rich",
    label: "Rich",
    description: "Enemy budget increased by 50%. Rewards doubled.",
    enemyBudgetMultiplier: 1.5,
    rewardMultiplier: 2
  },
  outpost: {
    id: "outpost",
    label: "Outpost",
    description: "Enemy budget decreased by 20%.",
    enemyBudgetMultiplier: 0.8,
    rewardMultiplier: 1
  },
  quagmire: {
    id: "quagmire",
    label: "Quagmire",
    description: "Enemy budget decreased by 50%. Recovery time is doubled.",
    enemyBudgetMultiplier: 0.5,
    rewardMultiplier: 1,
    recoveryMultiplier: 2
  }
};
function getAbility(id) {
  const ability = ABILITIES[id];
  if (!ability) {
    throw new Error(`Unknown ability ${id}`);
  }
  return ability;
}
function getFaction(id) {
  const faction = FACTIONS[id];
  if (!faction) {
    throw new Error(`Unknown faction ${id}`);
  }
  return faction;
}
function getUnitType(id) {
  const unitType = UNIT_TYPES[id];
  if (!unitType) {
    throw new Error(`Unknown unit type ${id}`);
  }
  return unitType;
}
function getMutator(id) {
  const mutator = MUTATORS[id];
  if (!mutator) {
    throw new Error(`Unknown mutator ${id}`);
  }
  return mutator;
}
function applyAdjustment(value, adjustment) {
  const multiplier = adjustment?.multiplier ?? 1;
  const flat = adjustment?.flat ?? 0;
  return fixed(value * multiplier + flat);
}
function canReceiveRangeAdjustment(attributes) {
  return !attributes.includes("melee");
}
function clampStat(key, value) {
  if (key === "damage") return fixedMax(value, 0);
  if (key === "speed") return fixedClamp(value, 1, 100);
  if (key === "range") return fixedMax(value, 0);
  if (key === "size") return fixedMax(value, 1);
  if (key === "capacity") return fixedMax(value, 0);
  if (key === "health") return fixedMax(value, 1);
  return fixed(value);
}
function composeBaseTroopDefinition(factionId, unitTypeId) {
  const faction = getFaction(factionId);
  const unitType = getUnitType(unitTypeId);
  const attributes = [.../* @__PURE__ */ new Set([...unitType.attributes, ...faction.addedAttributes])];
  const stats = STAT_KEYS.reduce(
    (result, key) => {
      if (key === "range" && !canReceiveRangeAdjustment(attributes)) {
        result[key] = clampStat(key, unitType.stats[key]);
        return result;
      }
      result[key] = clampStat(key, applyAdjustment(unitType.stats[key], faction.statAdjustments[key]));
      return result;
    },
    { health: 0, damage: 0, speed: 0, range: 0, armor: 0, size: 0, capacity: 0 }
  );
  const abilities = [...unitType.abilityIds, ...faction.abilityIds].map(getAbility);
  return {
    id: `${factionId}/${unitTypeId}`,
    factionId,
    unitTypeId,
    label: `${faction.singularLabel} ${unitType.label}`,
    role: unitType.role,
    type: unitType.type,
    attributes,
    stats,
    quantity: unitType.quantity,
    cost: fixedMax(applyAdjustment(unitType.cost, faction.statAdjustments.cost), 1),
    abilities
  };
}
function composeSummonedTroopDefinition(factionId, unitTypeId) {
  if (factionId in FACTIONS) {
    return composeBaseTroopDefinition(factionId, unitTypeId);
  }
  const unitType = getUnitType(unitTypeId);
  return {
    id: `${factionId}/${unitTypeId}`,
    factionId,
    unitTypeId,
    label: unitType.label,
    role: unitType.role,
    type: unitType.type,
    attributes: [...unitType.attributes],
    stats: { ...unitType.stats },
    quantity: unitType.quantity,
    cost: unitType.cost,
    abilities: unitType.abilityIds.map(getAbility)
  };
}
var TROOP_CATALOG = Object.values(FACTIONS).reduce((acc, faction) => {
  Object.keys(UNIT_TYPES).forEach((unitTypeId) => {
    acc[`${faction.id}/${unitTypeId}`] = composeBaseTroopDefinition(faction.id, unitTypeId);
  });
  return acc;
}, {});
var TROOP_TYPE_IDS = Object.keys(TROOP_CATALOG);

// src/engine/battle.ts
var BASE_MAP_RADIUS = 3;
var DEFAULT_SATURATION = 10;
var MAX_BEATS = 1e3;
function randomSeed() {
  return (Date.now() ^ Math.random() * 4294967295) >>> 0;
}
function makeReplayId(seed, riftId) {
  return `${riftId ?? "debug"}-${seed}`;
}
function buildEffects(mutatorIds) {
  return mutatorIds.reduce(
    (effects, mutatorId) => {
      const definition = getMutator(mutatorId);
      return {
        initiativeBonusPerBeat: effects.initiativeBonusPerBeat + (definition.initiativeBonusPerBeat ?? 0),
        rangedDamageMultiplier: effects.rangedDamageMultiplier * (definition.rangedDamageMultiplier ?? 1)
      };
    },
    { initiativeBonusPerBeat: 0, rangedDamageMultiplier: 1 }
  );
}
function cloneSnapshot(units) {
  return {
    units: [...units.values()].map((unit) => ({
      id: unit.id,
      troopInstanceId: unit.troopInstanceId,
      troopId: `${unit.factionId}/${unit.unitTypeId}`,
      troopLabel: unit.troopLabel,
      unitTypeId: unit.unitTypeId,
      factionId: unit.factionId,
      side: unit.side,
      role: unit.role,
      type: unit.type,
      attributes: [...unit.attributes],
      position: { ...unit.position },
      stats: { ...unit.resolvedStats },
      hp: fixed(unit.hp),
      maxHp: fixed(unit.maxHp),
      initiative: fixed(unit.initiative),
      alive: unit.alive,
      engagedWithIds: [...unit.engagedWith]
    }))
  };
}
function createAliveCount(snapshot) {
  const byTroopLabel = {};
  let player = 0;
  let enemy = 0;
  snapshot.units.forEach((unit) => {
    if (!unit.alive) {
      return;
    }
    if (unit.side === "player") {
      player += 1;
    } else {
      enemy += 1;
    }
    byTroopLabel[unit.troopLabel] = (byTroopLabel[unit.troopLabel] ?? 0) + 1;
  });
  return { player, enemy, byTroopLabel };
}
function cloneAbilityDefinition(ability) {
  return {
    ...ability,
    trigger: { ...ability.trigger, fallen: ability.trigger.fallen ? { ...ability.trigger.fallen } : void 0 },
    duration: { ...ability.duration },
    target: ability.target ? {
      ...ability.target,
      filters: ability.target.filters ? {
        notTypes: ability.target.filters.notTypes ? [...ability.target.filters.notTypes] : void 0,
        onlyTypes: ability.target.filters.onlyTypes ? [...ability.target.filters.onlyTypes] : void 0,
        prioritizeTypes: ability.target.filters.prioritizeTypes ? [...ability.target.filters.prioritizeTypes] : void 0,
        unengaged: ability.target.filters.unengaged
      } : void 0
    } : void 0,
    effects: ability.effects.map((effect) => ({ ...effect }))
  };
}
function createRuntimeAbilityState(ability) {
  return {
    definition: cloneAbilityDefinition(ability),
    triggerCount: 0,
    usesRemaining: ability.trigger.maxUses ?? null
  };
}
function buildTroopProfiles(input, summonedProfiles) {
  const seen = /* @__PURE__ */ new Set();
  const profiles = [];
  [...input.playerCombatants, ...input.enemyCombatants].forEach((combatant) => {
    const key = `${combatant.side}:${combatant.label}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    profiles.push({
      side: combatant.side,
      troopLabel: combatant.label,
      unitTypeId: combatant.unitTypeId,
      factionId: combatant.factionId,
      role: combatant.role,
      type: combatant.type,
      attributes: [...combatant.attributes],
      stats: { ...combatant.stats },
      abilities: combatant.abilities.map(cloneAbilityDefinition),
      statBreakdowns: combatant.statBreakdowns ?? {
        health: { stat: "health", finalValue: combatant.stats.health, lines: [{ label: "Resolved", value: combatant.stats.health, kind: "base" }] },
        damage: { stat: "damage", finalValue: combatant.stats.damage, lines: [{ label: "Resolved", value: combatant.stats.damage, kind: "base" }] },
        speed: { stat: "speed", finalValue: combatant.stats.speed, lines: [{ label: "Resolved", value: combatant.stats.speed, kind: "base" }] },
        armor: { stat: "armor", finalValue: combatant.stats.armor, lines: [{ label: "Resolved", value: combatant.stats.armor, kind: "base" }] },
        range: { stat: "range", finalValue: combatant.stats.range, lines: [{ label: "Resolved", value: combatant.stats.range, kind: "base" }] },
        capacity: { stat: "capacity", finalValue: combatant.stats.capacity, lines: [{ label: "Resolved", value: combatant.stats.capacity, kind: "base" }] },
        size: { stat: "size", finalValue: combatant.stats.size, lines: [{ label: "Resolved", value: combatant.stats.size, kind: "base" }] }
      }
    });
  });
  summonedProfiles.forEach((profile, key) => {
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    profiles.push(profile);
  });
  return profiles;
}
function buildStep(state, kind, actorIds, targetIds, message, metadata) {
  state.steps.push({
    index: state.steps.length,
    kind,
    actorIds,
    targetIds,
    message,
    metadata,
    snapshot: cloneSnapshot(state.units)
  });
}
function startingCorner(side, radius) {
  return side === "player" ? { q: -radius, r: 0 } : { q: radius, r: 0 };
}
function meleeStart(side, radius) {
  return side === "player" ? { q: -radius + 1, r: 0 } : { q: radius - 1, r: 0 };
}
function expandSpawnCells(side, origin, radius, activeCells, forbidden) {
  const enemyCorner = startingCorner(side === "player" ? "enemy" : "player", radius);
  const originEnemyDistance = hexDistance(origin, enemyCorner);
  const frontier = /* @__PURE__ */ new Map();
  const baseCells = activeCells.length > 0 ? activeCells : [origin];
  baseCells.forEach((cell) => {
    neighbors(cell).filter((neighbor) => inRadius(neighbor, radius)).forEach((neighbor) => {
      const key = hexKey(neighbor);
      if (forbidden.has(key) || activeCells.some((active) => equalsHex(active, neighbor))) {
        return;
      }
      frontier.set(key, neighbor);
    });
  });
  if (frontier.size === 0) {
    return false;
  }
  const candidates = [...frontier.values()];
  const bestDelta = Math.min(...candidates.map((cell) => Math.abs(hexDistance(cell, enemyCorner) - originEnemyDistance)));
  const nextCells = candidates.filter((cell) => Math.abs(hexDistance(cell, enemyCorner) - originEnemyDistance) === bestDelta);
  nextCells.forEach((cell) => {
    if (!activeCells.some((active) => equalsHex(active, cell))) {
      activeCells.push(cell);
    }
  });
  return nextCells.length > 0;
}
function placeUnitWithExpandableCells(combatant, side, origin, radius, activeCells, context, forbidden, occupancy) {
  const size = combatant.stats.size;
  if (size > context.saturation) {
    return null;
  }
  while (true) {
    const candidates = activeCells.map((cell) => {
      const key = hexKey(cell);
      if (forbidden.has(key)) {
        return null;
      }
      const used = occupancy.get(key) ?? 0;
      if (fixedAdd(used, size) > context.saturation) {
        return null;
      }
      return { cell, used, utilization: fixed(used / context.saturation) };
    }).filter((item) => item !== null);
    if (candidates.length > 0) {
      const minUtilization = Math.min(...candidates.map((item) => item.utilization));
      const finalists = candidates.filter((item) => item.utilization === minUtilization);
      const minUsed = Math.min(...finalists.map((item) => item.used));
      const selected = context.rng.pick(finalists.filter((item) => item.used === minUsed)).cell;
      const key = hexKey(selected);
      occupancy.set(key, fixedAdd(occupancy.get(key) ?? 0, size));
      return selected;
    }
    if (!expandSpawnCells(side, origin, radius, activeCells, forbidden)) {
      return null;
    }
  }
}
function spawnGroup(side, combatants, origin, radius, context, forbidden) {
  if (combatants.length === 0) {
    return /* @__PURE__ */ new Set();
  }
  const totalGroupSize = fixedSum(combatants.map((combatant) => combatant.stats.size));
  const targetCellCount = Math.max(1, Math.ceil(totalGroupSize / context.saturation));
  const activeCells = forbidden.has(hexKey(origin)) ? [] : [origin];
  const occupancy = /* @__PURE__ */ new Map();
  const usedHexes = /* @__PURE__ */ new Set();
  while (activeCells.length < targetCellCount) {
    if (!expandSpawnCells(side, origin, radius, activeCells, forbidden)) {
      break;
    }
  }
  combatants.forEach((combatant, index) => {
    const slot = placeUnitWithExpandableCells(combatant, side, origin, radius, activeCells, context, forbidden, occupancy);
    if (!slot) {
      throw new Error("Failed to spawn combatant");
    }
    const unitId = `${side}_${combatant.combatantId}_${index}`;
    usedHexes.add(hexKey(slot));
    context.units.set(unitId, {
      id: unitId,
      troopInstanceId: combatant.troopInstanceId,
      troopLabel: combatant.label,
      unitTypeId: combatant.unitTypeId,
      factionId: combatant.factionId,
      side,
      summonerUnitId: null,
      role: combatant.role,
      type: combatant.type,
      attributes: [...combatant.attributes],
      position: { ...slot },
      hp: combatant.stats.health,
      maxHp: combatant.stats.health,
      initiative: fixed(context.rng.int(11)),
      alive: true,
      engagedWith: /* @__PURE__ */ new Set(),
      resolvedStats: { ...combatant.stats },
      resolvedAbilities: combatant.abilities.map(createRuntimeAbilityState),
      activeTimedEffects: []
    });
  });
  return usedHexes;
}
function expandCombatants(combatants) {
  return combatants.flatMap(
    (combatant) => Array.from({ length: combatant.quantity }, (_, index) => ({
      ...combatant,
      quantity: 1,
      combatantId: `${combatant.combatantId}-${index + 1}`
    }))
  );
}
function spawnUnitsForSide(side, combatants, radius, context) {
  const ranged = combatants.filter((combatant) => combatant.stats.range > 0);
  const melee = combatants.filter((combatant) => combatant.stats.range === 0);
  const meleeForbidden = /* @__PURE__ */ new Set();
  const rangedHexes = spawnGroup(side, ranged, startingCorner(side, radius), radius, context, /* @__PURE__ */ new Set());
  if (!rangedHexes) {
    return false;
  }
  rangedHexes.forEach((key) => meleeForbidden.add(key));
  const meleeHexes = spawnGroup(side, melee, meleeStart(side, radius), radius, context, meleeForbidden);
  return meleeHexes !== null;
}
function initializeUnits(input, rng) {
  let radius = BASE_MAP_RADIUS;
  const playerUnits = expandCombatants(input.playerCombatants);
  const enemyUnits = expandCombatants(input.enemyCombatants);
  const saturation = input.saturation ?? DEFAULT_SATURATION;
  while (true) {
    const units = /* @__PURE__ */ new Map();
    const context = { units, rng, saturation };
    const playerOk = spawnUnitsForSide("player", playerUnits, radius, context);
    const enemyOk = playerOk && spawnUnitsForSide("enemy", enemyUnits, radius, context);
    if (playerOk && enemyOk) {
      return { units, mapRadius: radius };
    }
    radius += 1;
  }
}
function getAliveUnits(state, side) {
  return [...state.units.values()].filter((unit) => unit.alive && (!side || unit.side === side));
}
function resolveBattleOutcome(state) {
  const playerAlive = getAliveUnits(state, "player").length > 0;
  const enemyAlive = getAliveUnits(state, "enemy").length > 0;
  if (playerAlive && !enemyAlive) return "victory";
  if (!playerAlive && enemyAlive) return "defeat";
  return "draw";
}
function clearStaleEngagements(state) {
  state.units.forEach((unit) => {
    unit.engagedWith.forEach((enemyId) => {
      const enemy = state.units.get(enemyId);
      if (!enemy?.alive || !equalsHex(enemy.position, unit.position)) {
        unit.engagedWith.delete(enemyId);
      }
    });
  });
}
function availableCapacity(state, unit) {
  const used = fixedSum(
    [...unit.engagedWith].map((enemyId) => state.units.get(enemyId)).filter((enemy) => Boolean(enemy)).map((enemy) => enemy.resolvedStats.size)
  );
  return fixedMax(fixedSub(unit.resolvedStats.capacity, used), 0);
}
function enemyUnitsOnHex(state, unit) {
  return getAliveUnits(state).filter((other) => other.side !== unit.side && equalsHex(other.position, unit.position));
}
function nonEngagedEnemiesOnHex(state, unit) {
  return enemyUnitsOnHex(state, unit).filter((enemy) => enemy.engagedWith.size === 0);
}
function removeAllEngagements(state, unit) {
  [...unit.engagedWith].forEach((enemyId) => {
    const enemy = state.units.get(enemyId);
    if (enemy) {
      enemy.engagedWith.delete(unit.id);
    }
    unit.engagedWith.delete(enemyId);
  });
}
function createEngagement(state, actor, target) {
  actor.engagedWith.add(target.id);
  target.engagedWith.add(actor.id);
}
function engageEnemiesOnHex(state, actor, roles = [], includeAlreadyEngaged = false) {
  let remainingCapacity = availableCapacity(state, actor);
  const engagedTargets = [];
  const candidates = enemyUnitsOnHex(state, actor).filter((enemy) => matchesRoleFilter(enemy, roles)).filter((enemy) => !actor.engagedWith.has(enemy.id)).filter((enemy) => includeAlreadyEngaged || enemy.engagedWith.size === 0);
  const candidatesByPriority = [
    ...state.rng.shuffle(candidates.filter((enemy) => enemy.engagedWith.size === 0)),
    ...state.rng.shuffle(candidates.filter((enemy) => enemy.engagedWith.size > 0))
  ];
  if (remainingCapacity <= 0 || candidatesByPriority.length === 0) {
    return engagedTargets;
  }
  candidatesByPriority.forEach((enemy) => {
    if (enemy.resolvedStats.size <= remainingCapacity && enemy.alive && !actor.engagedWith.has(enemy.id)) {
      createEngagement(state, actor, enemy);
      remainingCapacity = fixedSub(remainingCapacity, enemy.resolvedStats.size);
      engagedTargets.push(enemy);
    }
  });
  return engagedTargets;
}
function matchesRoleFilter(unit, roles) {
  return roles.length === 0 || roles.includes(unit.role);
}
function getDistinctFriendlyUnitTypes(state, unit) {
  return [...new Set(getAliveUnits(state, unit.side).map((entry) => entry.type))];
}
function formatSigned(value) {
  return value >= 0 ? `+${formatFixed(value)}` : formatFixed(value);
}
function hasAbility(unit, abilityId) {
  return unit.resolvedAbilities.some((runtime) => runtime.definition.id === abilityId);
}
function hasMatchingIdentityTag(unit, tags) {
  return tags.some((tag) => unit.type === tag || unit.attributes.includes(tag));
}
function evaluateScaledAmount(base, amount, mode) {
  return mode === "percent" ? fixedMul(base, amount / 100) : amount;
}
function applyBolster(state, actor, target, runtime, effect) {
  const maxIncrease = evaluateScaledAmount(target.maxHp, effect.amount, effect.mode);
  const currentIncrease = evaluateScaledAmount(target.hp, effect.amount, effect.mode);
  if (maxIncrease <= 0 && currentIncrease <= 0) {
    return false;
  }
  target.maxHp = fixedAdd(target.maxHp, maxIncrease);
  target.hp = fixedClamp(fixedAdd(target.hp, currentIncrease), 0, target.maxHp);
  target.resolvedStats.health = target.maxHp;
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(maxIncrease)} health.`, {
    amount: maxIncrease,
    effect: "bolster",
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  return true;
}
function applyRamp(state, actor, target, runtime, effect) {
  const increase = evaluateScaledAmount(target.resolvedStats.damage, effect.amount, effect.mode);
  if (increase <= 0) {
    return false;
  }
  target.resolvedStats.damage = fixedAdd(target.resolvedStats.damage, increase);
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(increase)} damage.`, {
    amount: increase,
    effect: "ramp",
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  return true;
}
function applyHaste(state, actor, target, runtime, effect) {
  const increase = evaluateScaledAmount(target.resolvedStats.speed, effect.amount, effect.mode);
  if (increase <= 0) {
    return false;
  }
  target.resolvedStats.speed = fixedClamp(fixedAdd(target.resolvedStats.speed, increase), 1, 100);
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(increase)} speed.`, {
    amount: increase,
    effect: "haste",
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  return true;
}
function healUnit(state, actor, target, effect) {
  if (!target.alive || target.hp >= target.maxHp) {
    return false;
  }
  const missing = fixedSub(target.maxHp, target.hp);
  const amount = effect.mode === "percent" ? fixedMul(missing, effect.amount / 100) : effect.amount;
  const nextHp = fixedClamp(fixedAdd(target.hp, amount), 0, target.maxHp);
  const actual = fixedSub(nextHp, target.hp);
  if (actual <= 0) {
    return false;
  }
  target.hp = nextHp;
  buildStep(state, "heal", [actor.id], [target.id], `${actor.troopLabel} heals ${target.troopLabel} for ${formatFixed(actual)}.`, {
    amount: actual,
    effect: "heal"
  });
  return true;
}
function applyRangeSet(state, actor, target, runtime, effect) {
  if (target.resolvedStats.range === effect.value) {
    return false;
  }
  target.resolvedStats.range = fixedMax(effect.value, 0);
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} sets range to ${formatFixed(target.resolvedStats.range)}.`, {
    value: target.resolvedStats.range,
    effect: "rangeset",
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  return true;
}
function applyRoleSet(state, actor, target, runtime, effect) {
  if (target.role === effect.role) {
    return false;
  }
  target.role = effect.role;
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} becomes ${effect.role}.`, {
    effect: "roleset",
    role: effect.role,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  return true;
}
function applyTemporaryEffect(state, actor, target, runtime, effect) {
  const turns = runtime.definition.duration.kind === "turns" ? runtime.definition.duration.turns : 0;
  if (turns <= 0) {
    return false;
  }
  if (effect.kind === "bolster") {
    const maxApplied = evaluateScaledAmount(target.maxHp, effect.amount, effect.mode);
    const hpApplied = evaluateScaledAmount(target.hp, effect.amount, effect.mode);
    if (maxApplied <= 0 && hpApplied <= 0) {
      return false;
    }
    target.maxHp = fixedAdd(target.maxHp, maxApplied);
    target.hp = fixedClamp(fixedAdd(target.hp, hpApplied), 0, target.maxHp);
    target.resolvedStats.health = target.maxHp;
    target.activeTimedEffects.push({
      effectKind: "bolster",
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      maxApplied,
      hpApplied
    });
    buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(maxApplied)} health until end of turn.`, {
      amount: maxApplied,
      effect: "bolster",
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true
    });
    return true;
  }
  if (effect.kind === "haste") {
    const amountApplied = evaluateScaledAmount(target.resolvedStats.speed, effect.amount, effect.mode);
    if (amountApplied <= 0) {
      return false;
    }
    target.resolvedStats.speed = fixedClamp(fixedAdd(target.resolvedStats.speed, amountApplied), 1, 100);
    target.activeTimedEffects.push({
      effectKind: "haste",
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      amountApplied
    });
    buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(amountApplied)} speed until end of turn.`, {
      amount: amountApplied,
      effect: "haste",
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true
    });
    return true;
  }
  if (effect.kind === "ramp") {
    const amountApplied = evaluateScaledAmount(target.resolvedStats.damage, effect.amount, effect.mode);
    if (amountApplied <= 0) {
      return false;
    }
    target.resolvedStats.damage = fixedAdd(target.resolvedStats.damage, amountApplied);
    target.activeTimedEffects.push({
      effectKind: "ramp",
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      amountApplied
    });
    buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(amountApplied)} damage until end of turn.`, {
      amount: amountApplied,
      effect: "ramp",
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true
    });
    return true;
  }
  if (effect.kind === "rangeset") {
    if (target.resolvedStats.range === effect.value) {
      return false;
    }
    const previousValue = target.resolvedStats.range;
    target.resolvedStats.range = fixedMax(effect.value, 0);
    target.activeTimedEffects.push({
      effectKind: "rangeset",
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      previousValue
    });
    buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} sets range to ${formatFixed(target.resolvedStats.range)} until end of turn.`, {
      value: target.resolvedStats.range,
      effect: "rangeset",
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true
    });
    return true;
  }
  if (target.role === effect.role) {
    return false;
  }
  const previousRole = target.role;
  target.role = effect.role;
  target.activeTimedEffects.push({
    effectKind: "roleset",
    sourceAbilityId: runtime.definition.id,
    sourceUnitId: actor.id,
    remainingTurns: turns,
    previousRole
  });
  buildStep(state, "buff", [actor.id], [target.id], `${target.troopLabel} becomes ${effect.role} until end of turn.`, {
    effect: "roleset",
    role: effect.role,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
    temporary: true
  });
  return true;
}
function expireTimedEffects(state, unit) {
  const remaining = [];
  unit.activeTimedEffects.forEach((effect) => {
    const nextTurns = effect.remainingTurns - 1;
    if (nextTurns > 0) {
      remaining.push({ ...effect, remainingTurns: nextTurns });
      return;
    }
    if (effect.effectKind === "bolster") {
      unit.maxHp = fixedMax(fixedSub(unit.maxHp, effect.maxApplied), 1);
      unit.hp = fixedClamp(fixedSub(unit.hp, effect.hpApplied), 0, unit.maxHp);
      unit.resolvedStats.health = unit.maxHp;
      buildStep(state, "buff", [effect.sourceUnitId], [unit.id], `${unit.troopLabel} loses ${formatSigned(effect.maxApplied)} health.`, {
        amount: effect.maxApplied,
        effect: "bolster",
        sourceAbilityId: effect.sourceAbilityId,
        expired: true
      });
      return;
    }
    if (effect.effectKind === "haste") {
      unit.resolvedStats.speed = fixedClamp(fixedSub(unit.resolvedStats.speed, effect.amountApplied), 1, 100);
      buildStep(state, "buff", [effect.sourceUnitId], [unit.id], `${unit.troopLabel} loses ${formatSigned(effect.amountApplied)} speed.`, {
        amount: effect.amountApplied,
        effect: "haste",
        sourceAbilityId: effect.sourceAbilityId,
        expired: true
      });
      return;
    }
    if (effect.effectKind === "ramp") {
      unit.resolvedStats.damage = fixedMax(fixedSub(unit.resolvedStats.damage, effect.amountApplied), 0);
      buildStep(state, "buff", [effect.sourceUnitId], [unit.id], `${unit.troopLabel} loses ${formatSigned(effect.amountApplied)} damage.`, {
        amount: effect.amountApplied,
        effect: "ramp",
        sourceAbilityId: effect.sourceAbilityId,
        expired: true
      });
      return;
    }
    if (effect.effectKind === "rangeset") {
      unit.resolvedStats.range = fixedMax(effect.previousValue, 0);
      buildStep(state, "buff", [effect.sourceUnitId], [unit.id], `${unit.troopLabel} resets range to ${formatFixed(unit.resolvedStats.range)}.`, {
        value: unit.resolvedStats.range,
        effect: "rangeset",
        sourceAbilityId: effect.sourceAbilityId,
        expired: true
      });
      return;
    }
    unit.role = effect.previousRole;
    buildStep(state, "buff", [effect.sourceUnitId], [unit.id], `${unit.troopLabel} returns to ${effect.previousRole}.`, {
      role: effect.previousRole,
      effect: "roleset",
      sourceAbilityId: effect.sourceAbilityId,
      expired: true
    });
  });
  unit.activeTimedEffects = remaining;
}
function matchesFallenTrigger(unit, fallenUnit, allegiance) {
  if (unit.id === fallenUnit.id) {
    return false;
  }
  if (allegiance === "all") {
    return true;
  }
  return allegiance === "ally" ? unit.side === fallenUnit.side : unit.side !== fallenUnit.side;
}
function filterTargetCandidates(candidates, filters) {
  if (!filters) {
    return candidates;
  }
  return candidates.filter((candidate) => {
    if (filters.onlyTypes && !hasMatchingIdentityTag(candidate, filters.onlyTypes)) {
      return false;
    }
    if (filters.notTypes && hasMatchingIdentityTag(candidate, filters.notTypes)) {
      return false;
    }
    if (filters.unengaged && candidate.engagedWith.size > 0) {
      return false;
    }
    return true;
  });
}
function prioritizeCandidates(candidates, filters) {
  if (!filters?.prioritizeTypes?.length) {
    return candidates;
  }
  const prioritized = candidates.filter((candidate) => hasMatchingIdentityTag(candidate, filters.prioritizeTypes ?? []));
  return prioritized.length > 0 ? prioritized : candidates;
}
function getBlastDefaultTargets(state, actor, event) {
  if (!event.attackTarget) {
    return [];
  }
  return getAliveUnits(state).filter((unit) => unit.side !== actor.side && equalsHex(unit.position, event.attackTarget.position));
}
function getStrikeDefaultTarget(event) {
  return event.attackTarget?.alive ? [event.attackTarget] : [];
}
function getHealDefaultTargets(state, actor, target) {
  const candidates = getAliveUnits(state, actor.side).filter((unit) => hexDistance(actor.position, unit.position) <= actor.resolvedStats.range).filter((unit) => unit.hp < unit.maxHp);
  const filtered = prioritizeCandidates(filterTargetCandidates(candidates, target?.filters), target?.filters);
  if (filtered.length === 0) {
    return [];
  }
  const mostMissing = Math.max(...filtered.map((unit) => fixedSub(unit.maxHp, unit.hp)));
  return filtered.filter((unit) => fixedSub(unit.maxHp, unit.hp) === mostMissing);
}
function resolveAbilityTargetRadius(actor, target) {
  if (!target) {
    return 0;
  }
  if (target.radiusSource === "selfRange") {
    return actor.resolvedStats.range;
  }
  return target.radius ?? 0;
}
function resolveFallenTriggerRadius(actor, trigger) {
  if (!trigger.fallen) {
    return 0;
  }
  if (trigger.fallen.radiusSource === "selfRange") {
    return actor.resolvedStats.range;
  }
  return trigger.fallen.radius;
}
function getTargetCandidates(state, actor, ability, effect, event) {
  const target = ability.target;
  if (target?.mode === "self") {
    return [actor];
  }
  if (target?.mode === "random" || target?.mode === "aoe") {
    const radius = resolveAbilityTargetRadius(actor, target);
    const allegiance = target.allegiance ?? "ally";
    const candidates = getAliveUnits(state).filter((unit) => {
      if (allegiance === "ally" && unit.side !== actor.side) return false;
      if (allegiance === "enemy" && unit.side === actor.side) return false;
      return hexDistance(actor.position, unit.position) <= radius;
    });
    return prioritizeCandidates(filterTargetCandidates(candidates, target.filters), target.filters);
  }
  if (effect.kind === "blast") return getBlastDefaultTargets(state, actor, event);
  if (effect.kind === "strike") return getStrikeDefaultTarget(event);
  if (effect.kind === "heal") return getHealDefaultTargets(state, actor, target);
  return [actor];
}
function resolveTargets(state, actor, ability, effect, event) {
  const candidates = getTargetCandidates(state, actor, ability, effect, event).filter((candidate) => candidate.alive);
  if (candidates.length === 0) {
    return [];
  }
  if (ability.target?.mode === "random") {
    return [state.rng.pick(candidates)];
  }
  if (effect.kind === "heal" && ability.target?.mode !== "aoe") {
    return [state.rng.pick(candidates)];
  }
  return candidates;
}
function canTriggerAbility(state, actor, runtime, event) {
  const trigger = runtime.definition.trigger;
  if (trigger.timing !== event.timing) {
    return false;
  }
  if (runtime.usesRemaining !== null && runtime.usesRemaining <= 0) {
    return false;
  }
  if (trigger.condition === "forsaken" && getDistinctFriendlyUnitTypes(state, actor).length > 1) {
    return false;
  }
  if (trigger.fallen && event.fallenUnit) {
    if (!matchesFallenTrigger(actor, event.fallenUnit, trigger.fallen.allegiance)) {
      return false;
    }
    if (hexDistance(actor.position, event.fallenUnit.position) > resolveFallenTriggerRadius(actor, trigger)) {
      return false;
    }
  }
  return true;
}
function getAbilityRepeatCount(state, actor, runtime) {
  if (runtime.definition.trigger.repeatPerDistinctFriendlyTroopType) {
    return Math.max(0, getDistinctFriendlyUnitTypes(state, actor).filter((type) => type !== actor.type).length);
  }
  if (runtime.definition.trigger.repeatPerOtherFriendlyUnitOnHex) {
    return getAliveUnits(state, actor.side).filter((ally) => ally.id !== actor.id && equalsHex(ally.position, actor.position)).length;
  }
  return 1;
}
function recordSummonedProfile(state, unit) {
  const key = `${unit.side}:${unit.troopLabel}`;
  if (state.summonedProfiles.has(key)) {
    return;
  }
  state.summonedProfiles.set(key, {
    side: unit.side,
    troopLabel: unit.troopLabel,
    unitTypeId: unit.unitTypeId,
    factionId: unit.factionId,
    role: unit.role,
    type: unit.type,
    attributes: [...unit.attributes],
    stats: { ...unit.resolvedStats },
    abilities: unit.resolvedAbilities.map((runtime) => cloneAbilityDefinition(runtime.definition)),
    statBreakdowns: {
      health: { stat: "health", finalValue: unit.resolvedStats.health, lines: [{ label: "Summoned", value: unit.resolvedStats.health, kind: "base" }] },
      damage: { stat: "damage", finalValue: unit.resolvedStats.damage, lines: [{ label: "Summoned", value: unit.resolvedStats.damage, kind: "base" }] },
      speed: { stat: "speed", finalValue: unit.resolvedStats.speed, lines: [{ label: "Summoned", value: unit.resolvedStats.speed, kind: "base" }] },
      armor: { stat: "armor", finalValue: unit.resolvedStats.armor, lines: [{ label: "Summoned", value: unit.resolvedStats.armor, kind: "base" }] },
      range: { stat: "range", finalValue: unit.resolvedStats.range, lines: [{ label: "Summoned", value: unit.resolvedStats.range, kind: "base" }] },
      capacity: { stat: "capacity", finalValue: unit.resolvedStats.capacity, lines: [{ label: "Summoned", value: unit.resolvedStats.capacity, kind: "base" }] },
      size: { stat: "size", finalValue: unit.resolvedStats.size, lines: [{ label: "Summoned", value: unit.resolvedStats.size, kind: "base" }] }
    }
  });
}
function tryFindSummonHex(state, actor, origin, size) {
  const candidatePool = [origin, ...state.rng.shuffle(neighbors(origin).filter((coord) => inRadius(coord, state.mapRadius)))];
  const valid = candidatePool.filter(
    (coord) => fixedAdd(allySizeOnHex(state, actor.side, coord), size) <= state.saturation
  );
  if (valid.length === 0) {
    return null;
  }
  return valid[0] ?? null;
}
function summonUnit(state, actor, runtime, effect, origin) {
  const troop = composeSummonedTroopDefinition(actor.factionId, effect.unitTypeId);
  const summonHex = tryFindSummonHex(state, actor, origin, troop.stats.size);
  if (!summonHex) {
    return false;
  }
  const summonIndex = [...state.units.values()].filter((unit) => unit.side === actor.side && unit.troopLabel === troop.label).length + 1;
  const unitId = `${actor.id}-summon-${effect.unitTypeId}-${summonIndex}`;
  const summonedUnit = {
    id: unitId,
    troopInstanceId: null,
    troopLabel: troop.label,
    unitTypeId: troop.unitTypeId,
    factionId: troop.factionId,
    side: actor.side,
    summonerUnitId: actor.id,
    role: troop.role,
    type: troop.type,
    attributes: [...troop.attributes],
    position: { ...summonHex },
    hp: troop.stats.health,
    maxHp: troop.stats.health,
    initiative: 0,
    alive: true,
    engagedWith: /* @__PURE__ */ new Set(),
    resolvedStats: { ...troop.stats },
    resolvedAbilities: troop.abilities.map(createRuntimeAbilityState),
    activeTimedEffects: []
  };
  state.units.set(unitId, summonedUnit);
  recordSummonedProfile(state, summonedUnit);
  buildStep(state, "buff", [actor.id], [unitId], `${actor.troopLabel} summons ${troop.label}.`, {
    effect: "summon",
    unitTypeId: troop.unitTypeId,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label
  });
  return true;
}
var PER_TARGET_EFFECT_HANDLERS = {
  blast: (state, actor, runtime, target, effect) => {
    const e = effect;
    const damage = fixedMax(e.amount, 0);
    target.hp = fixedSub(target.hp, damage);
    buildStep(state, "attack", [actor.id], [target.id], `${actor.troopLabel} splashes ${formatFixed(damage)} blast damage.`, {
      damage,
      mode: "blast",
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label
    });
    if (target.hp <= 0 && target.alive) {
      handleDeath(state, actor, target);
    } else if (target.alive) {
      triggerUnitAbilities(state, target, { timing: "onDamaged" });
    }
    return true;
  },
  bolster: (state, actor, runtime, target, effect) => applyBolster(state, actor, target, runtime, effect),
  haste: (state, actor, runtime, target, effect) => applyHaste(state, actor, target, runtime, effect),
  heal: (state, actor, _runtime, target, effect) => healUnit(state, actor, target, effect),
  ramp: (state, actor, runtime, target, effect) => applyRamp(state, actor, target, runtime, effect),
  rangeset: (state, actor, runtime, target, effect) => applyRangeSet(state, actor, target, runtime, effect),
  roleset: (state, actor, runtime, target, effect) => applyRoleSet(state, actor, target, runtime, effect),
  summon: (state, actor, runtime, _target, effect, event) => {
    const summon = effect;
    const origin = summon.consumeFallenUnitCorpse ? event.fallenUnit?.position : actor.position;
    if (!origin) {
      return false;
    }
    if (summon.consumeFallenUnitCorpse && event.fallenUnit) {
      if (!state.corpses.has(event.fallenUnit.id)) {
        return false;
      }
    }
    let summonedAny = false;
    for (let index = 0; index < summon.count; index += 1) {
      summonedAny = summonUnit(state, actor, runtime, summon, origin) || summonedAny;
    }
    if (summonedAny && summon.consumeFallenUnitCorpse && event.fallenUnit) {
      state.corpses.delete(event.fallenUnit.id);
    }
    return summonedAny;
  },
  strike: (state, actor, _runtime, target, effect) => {
    const e = effect;
    const strikeCount = Math.max(0, Math.floor(e.amount));
    if (strikeCount > 0 && target.alive) {
      for (let i = 0; i < strikeCount; i += 1) {
        attack(state, actor, target, actor.resolvedStats.range > 0 ? "ranged" : "melee", false, 0);
        if (!target.alive) {
          break;
        }
      }
      return true;
    }
    return false;
  },
  redirect: (state, actor, runtime, target) => {
    if (!target.alive || target.engagedWith.size > 0 || actor.engagedWith.has(target.id)) {
      return false;
    }
    if (target.resolvedStats.size > availableCapacity(state, actor)) {
      return false;
    }
    createEngagement(state, actor, target);
    buildStep(state, "engage", [actor.id], [target.id], `${actor.troopLabel} redirects ${target.troopLabel}.`, {
      effect: "redirect",
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label
    });
    return true;
  }
};
function executeAbilityEffect(state, actor, runtime, effect, event) {
  const handler = PER_TARGET_EFFECT_HANDLERS[effect.kind];
  if (!handler) {
    return false;
  }
  const targets = resolveTargets(state, actor, runtime.definition, effect, event);
  if (targets.length === 0) {
    return false;
  }
  let applied = false;
  targets.forEach((target) => {
    if (!target.alive && effect.kind !== "strike") {
      return;
    }
    if (runtime.definition.duration.kind === "turns" && (effect.kind === "bolster" || effect.kind === "haste" || effect.kind === "ramp" || effect.kind === "rangeset" || effect.kind === "roleset")) {
      applied = applyTemporaryEffect(state, actor, target, runtime, effect) || applied;
      return;
    }
    applied = handler(state, actor, runtime, target, effect, event) || applied;
  });
  return applied;
}
function triggerUnitAbilities(state, actor, event) {
  actor.resolvedAbilities.forEach((runtime) => {
    if (!canTriggerAbility(state, actor, runtime, event)) {
      return;
    }
    runtime.triggerCount += 1;
    if (runtime.definition.trigger.chargeEvery && runtime.triggerCount % runtime.definition.trigger.chargeEvery !== 0) {
      return;
    }
    const repeats = getAbilityRepeatCount(state, actor, runtime);
    if (repeats <= 0) {
      return;
    }
    let applied = false;
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      runtime.definition.effects.forEach((effect) => {
        applied = executeAbilityEffect(state, actor, runtime, effect, event) || applied;
      });
    }
    if (applied && runtime.usesRemaining !== null) {
      runtime.usesRemaining -= 1;
    }
  });
}
function executeStartOfBattleAbilities(state) {
  getAliveUnits(state).forEach((unit) => {
    triggerUnitAbilities(state, unit, { timing: "startOfBattle" });
  });
}
function executeEndOfTurnAbilities(state, actor) {
  triggerUnitAbilities(state, actor, { timing: "endOfTurn" });
}
function executeStartOfTurnAbilities(state, actor) {
  triggerUnitAbilities(state, actor, { timing: "startOfTurn" });
}
function handleDeath(state, actor, target) {
  if (!target.alive) {
    return;
  }
  target.alive = false;
  target.hp = 0;
  removeAllEngagements(state, target);
  if (!hasAbility(target, "fading")) {
    state.corpses.set(target.id, { ...target.position });
  }
  buildStep(state, "death", [actor.id], [target.id], `${target.troopLabel} is killed.`);
  const bondedDependents = getAliveUnits(state, target.side).filter(
    (unit) => unit.summonerUnitId === target.id && hasAbility(unit, "bonded")
  );
  triggerUnitAbilities(state, actor, { timing: "onKill", fallenUnit: target });
  triggerUnitAbilities(state, target, { timing: "onDeath", fallenUnit: target });
  getAliveUnits(state).forEach((unit) => {
    if (unit.id !== target.id) {
      triggerUnitAbilities(state, unit, { timing: "onFallen", fallenUnit: target });
    }
  });
  bondedDependents.forEach((unit) => handleDeath(state, target, unit));
}
function attack(state, actor, target, mode, allowOnAttackAbilities = true, strikeCount = 0) {
  const baseDamage = fixedSub(actor.resolvedStats.damage, target.resolvedStats.armor);
  const modifiedDamage = mode === "ranged" ? fixedMul(baseDamage, state.effects.rangedDamageMultiplier) : baseDamage;
  const damage = fixedMax(modifiedDamage, 0);
  target.hp = fixedSub(target.hp, damage);
  buildStep(state, "attack", [actor.id], [target.id], `${actor.troopLabel} hits ${target.troopLabel} for ${formatFixed(damage)}.`, {
    damage,
    mode
  });
  if (allowOnAttackAbilities) {
    triggerUnitAbilities(state, actor, { timing: "onAttack", attackTarget: target });
  }
  if (target.hp <= 0 && target.alive) {
    handleDeath(state, actor, target);
  } else {
    triggerUnitAbilities(state, target, { timing: "onDamaged" });
  }
  if (strikeCount > 0 && target.alive) {
    for (let i = 0; i < strikeCount; i += 1) {
      attack(state, actor, target, mode, false, 0);
      if (!target.alive) {
        break;
      }
    }
  }
}
function pileOn(state, actor) {
  const candidates = enemyUnitsOnHex(state, actor);
  if (candidates.length === 0) {
    return false;
  }
  const prioritized = candidates.filter(
    (enemy) => getAliveUnits(state, actor.side).filter((ally) => ally.id !== actor.id && equalsHex(ally.position, actor.position)).some((ally) => ally.engagedWith.has(enemy.id))
  );
  attack(state, actor, state.rng.pick(prioritized.length > 0 ? prioritized : candidates), "melee");
  return true;
}
function fight(state, actor) {
  const engagedEnemies = [...actor.engagedWith].map((enemyId) => state.units.get(enemyId)).filter((enemy) => Boolean(enemy?.alive));
  if (engagedEnemies.length > 0) {
    attack(state, actor, state.rng.pick(engagedEnemies), "melee");
    return true;
  }
  return pileOn(state, actor);
}
function drawAttention(state, actor, roles = []) {
  const engagedTargets = engageEnemiesOnHex(state, actor, roles);
  if (engagedTargets.length > 0) {
    buildStep(state, "engage", [actor.id], engagedTargets.map((target) => target.id), `${actor.troopLabel} engages enemies.`);
  }
  return fight(state, actor) || engagedTargets.length > 0;
}
function allySizeOnHex(state, side, coord, exceptId) {
  return fixedSum(
    getAliveUnits(state, side).filter((unit) => equalsHex(unit.position, coord) && unit.id !== exceptId).map((unit) => unit.resolvedStats.size)
  );
}
function validMovementHexes(state, actor) {
  return neighbors(actor.position).filter((coord) => inRadius(coord, state.mapRadius)).filter((coord) => fixedAdd(allySizeOnHex(state, actor.side, coord, actor.id), actor.resolvedStats.size) <= state.saturation);
}
function findClosestEnemy(state, actor, preferredRoles, nonEngagedOnly) {
  const enemies = getAliveUnits(state).filter(
    (unit) => unit.side !== actor.side && (preferredRoles.length === 0 || preferredRoles.includes(unit.role)) && (!nonEngagedOnly || unit.engagedWith.size === 0)
  );
  if (enemies.length === 0) {
    return null;
  }
  return enemies.sort((a, b) => hexDistance(actor.position, a.position) - hexDistance(actor.position, b.position))[0] ?? null;
}
function moveToward(state, actor, target) {
  const options = validMovementHexes(state, actor);
  if (options.length === 0) {
    return false;
  }
  const currentDistance = hexDistance(actor.position, target.position);
  const scored = options.map((coord) => {
    const enemiesHere = getAliveUnits(state).filter((unit) => unit.side !== actor.side && equalsHex(unit.position, coord));
    return {
      coord,
      distance: hexDistance(coord, target.position),
      nonEngagedEnemies: enemiesHere.filter((unit) => unit.engagedWith.size === 0).length
    };
  });
  const progressMoves = scored.filter((entry) => entry.distance < currentDistance);
  const pool = progressMoves.length > 0 ? progressMoves : scored;
  const minDistance = Math.min(...pool.map((entry) => entry.distance));
  const byDistance = pool.filter((entry) => entry.distance === minDistance);
  const minEnemies = Math.min(...byDistance.map((entry) => entry.nonEngagedEnemies));
  const selected = state.rng.pick(byDistance.filter((entry) => entry.nonEngagedEnemies === minEnemies));
  if (equalsHex(selected.coord, actor.position)) {
    return false;
  }
  removeAllEngagements(state, actor);
  actor.position = { ...selected.coord };
  buildStep(state, "move", [actor.id], [], `${actor.troopLabel} moves.`, { toQ: actor.position.q, toR: actor.position.r });
  return true;
}
function enemiesInRange(state, actor) {
  return getAliveUnits(state).filter((enemy) => enemy.side !== actor.side && hexDistance(actor.position, enemy.position) <= actor.resolvedStats.range);
}
function pursue(state, actor, preferredRoles) {
  if (enemyUnitsOnHex(state, actor).some((enemy) => matchesRoleFilter(enemy, preferredRoles))) {
    return drawAttention(state, actor, preferredRoles);
  }
  const target = findClosestEnemy(state, actor, preferredRoles, false) ?? findClosestEnemy(state, actor, [], false);
  if (!target) {
    return false;
  }
  const moved = moveToward(state, actor, target);
  const enemiesOnCell = enemyUnitsOnHex(state, actor);
  if (enemiesOnCell.length === 0) {
    return moved;
  }
  if (enemiesOnCell.some((enemy) => matchesRoleFilter(enemy, preferredRoles))) {
    return drawAttention(state, actor, preferredRoles) || moved;
  }
  return drawAttention(state, actor) || moved;
}
function retreat(state, actor) {
  const options = validMovementHexes(state, actor).filter(
    (coord) => getAliveUnits(state).filter((unit) => unit.side !== actor.side && equalsHex(unit.position, coord)).length === 0
  );
  if (options.length > 0) {
    removeAllEngagements(state, actor);
    actor.position = { ...state.rng.pick(options) };
    buildStep(state, "move", [actor.id], [], `${actor.troopLabel} retreats.`, { toQ: actor.position.q, toR: actor.position.r });
    return true;
  }
  const sameHexEnemies = enemyUnitsOnHex(state, actor);
  if (sameHexEnemies.length > 0) {
    attack(state, actor, state.rng.pick(sameHexEnemies), "melee");
    return true;
  }
  return false;
}
function carefulAdvance(state, actor) {
  const target = findClosestEnemy(state, actor, [], false);
  if (!target) {
    return false;
  }
  const options = validMovementHexes(state, actor).filter((coord) => {
    const becomesCloser = hexDistance(coord, target.position) < hexDistance(actor.position, target.position);
    if (!becomesCloser) {
      return false;
    }
    const alliesOnTarget = getAliveUnits(state, actor.side).filter((ally) => equalsHex(ally.position, coord));
    return alliesOnTarget.every((ally) => ally.resolvedStats.range >= actor.resolvedStats.range);
  });
  if (options.length === 0) {
    return false;
  }
  removeAllEngagements(state, actor);
  actor.position = { ...state.rng.pick(options) };
  buildStep(state, "move", [actor.id], [], `${actor.troopLabel} advances carefully.`, { toQ: actor.position.q, toR: actor.position.r });
  return true;
}
function executeTurnActions(state, actor) {
  clearStaleEngagements(state);
  const engagedEnemies = [...actor.engagedWith].map((enemyId) => state.units.get(enemyId)).filter((enemy) => Boolean(enemy?.alive));
  if (engagedEnemies.length > 0) {
    attack(state, actor, state.rng.pick(engagedEnemies), "melee");
    return;
  }
  if (actor.role === "frontline") {
    if (nonEngagedEnemiesOnHex(state, actor).length > 0) {
      drawAttention(state, actor);
      return;
    }
    pursue(state, actor, ["frontline", "chaff"]);
    return;
  }
  if (actor.role === "chaff") {
    if (nonEngagedEnemiesOnHex(state, actor).length === 0) {
      pursue(state, actor, ["backline"]);
      return;
    }
    pileOn(state, actor);
    return;
  }
  if (enemyUnitsOnHex(state, actor).length > 0) {
    retreat(state, actor);
    return;
  }
  const inRange = enemiesInRange(state, actor);
  if (inRange.length > 0) {
    attack(state, actor, state.rng.pick(inRange), "ranged");
    return;
  }
  carefulAdvance(state, actor);
}
function executeTurn(state, actor) {
  if (!actor.alive) {
    return;
  }
  executeStartOfTurnAbilities(state, actor);
  if (!actor.alive) {
    return;
  }
  executeTurnActions(state, actor);
  executeEndOfTurnAbilities(state, actor);
  expireTimedEffects(state, actor);
}
function isBattleOver(state) {
  return getAliveUnits(state, "player").length === 0 || getAliveUnits(state, "enemy").length === 0;
}
function resolveBattle(input) {
  const seed = input.seed ?? randomSeed();
  const rng = createRng(seed);
  const init = initializeUnits(input, rng);
  const saturation = input.saturation ?? DEFAULT_SATURATION;
  const state = {
    units: init.units,
    corpses: /* @__PURE__ */ new Map(),
    summonedProfiles: /* @__PURE__ */ new Map(),
    steps: [],
    mapRadius: init.mapRadius,
    saturation,
    rng,
    beatCount: 0,
    effects: buildEffects(input.mutatorIds),
    replayId: makeReplayId(seed, input.riftId),
    input
  };
  const troopLabels = Object.fromEntries(
    [...input.playerCombatants, ...input.enemyCombatants].map((combatant) => [combatant.combatantId, combatant.label])
  );
  const initial = cloneSnapshot(state.units);
  executeStartOfBattleAbilities(state);
  while (!isBattleOver(state) && state.beatCount < MAX_BEATS) {
    state.beatCount += 1;
    getAliveUnits(state).forEach((unit) => {
      unit.initiative = fixedAdd(unit.initiative, fixedAdd(unit.resolvedStats.speed, state.effects.initiativeBonusPerBeat));
    });
    buildStep(state, "beat", [], [], `Beat ${state.beatCount}: initiative increases for all units.`, {
      beat: state.beatCount,
      initiativeBonus: state.effects.initiativeBonusPerBeat
    });
    const ready = getAliveUnits(state).filter((unit) => unit.initiative >= 100).map((unit) => unit.id);
    state.rng.shuffle(ready).forEach((unitId) => {
      const unit = state.units.get(unitId);
      if (!unit?.alive) {
        return;
      }
      unit.initiative = fixedSub(unit.initiative, 100);
      executeTurn(state, unit);
    });
  }
  const snapshots = [initial, ...state.steps.map((step) => step.snapshot)];
  const finalCounts = createAliveCount(snapshots[snapshots.length - 1] ?? initial);
  return {
    id: state.replayId,
    seed,
    riftId: input.riftId,
    tier: input.tier,
    mutatorIds: [...input.mutatorIds],
    mapRadius: state.mapRadius,
    saturation: state.saturation,
    initial,
    steps: state.steps,
    outcome: resolveBattleOutcome(state),
    troopLabels,
    troopProfiles: buildTroopProfiles(input, state.summonedProfiles),
    aliveCounts: snapshots.map(createAliveCount),
    summary: {
      playerTroops: input.playerCombatants.map((combatant) => combatant.label),
      enemyTroops: input.enemyCombatants.map((combatant) => combatant.label),
      finalPlayerAlive: finalCounts.player,
      finalEnemyAlive: finalCounts.enemy
    }
  };
}

// src/engine/balanceHarness.ts
function cloneStats(stats) {
  return {
    health: clampStat("health", stats.health),
    damage: clampStat("damage", stats.damage),
    speed: clampStat("speed", stats.speed),
    range: clampStat("range", stats.range),
    armor: clampStat("armor", stats.armor),
    size: clampStat("size", stats.size),
    capacity: clampStat("capacity", stats.capacity)
  };
}
function emptyImpact() {
  return {
    damageDealt: 0,
    hpHealed: 0,
    unitsSummoned: 0,
    buffsApplied: 0,
    redirects: 0
  };
}
function percentile(sortedValues, value) {
  const exactIndex = (sortedValues.length - 1) * value;
  const lower = Math.floor(exactIndex);
  const upper = Math.ceil(exactIndex);
  if (lower === upper) {
    return sortedValues[lower] ?? 0;
  }
  const lowerValue = sortedValues[lower] ?? 0;
  const upperValue = sortedValues[upper] ?? 0;
  const weight = exactIndex - lower;
  return fixed(lowerValue + (upperValue - lowerValue) * weight);
}
function buildPercentiles(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p10: percentile(sorted, 0.1),
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9)
  };
}
function average(values) {
  if (values.length === 0) {
    return 0;
  }
  return fixed(values.reduce((sum, value) => sum + value, 0) / values.length);
}
function averageNullable(values) {
  const present = values.filter((value) => value !== null);
  if (present.length === 0) {
    return null;
  }
  return average(present);
}
function buildNullablePercentiles(values) {
  const present = values.filter((value) => value !== null);
  if (present.length === 0) {
    return null;
  }
  return buildPercentiles(present);
}
function getSnapshotUnit(snapshot, unitId) {
  return snapshot.units.find((unit) => unit.id === unitId);
}
function stepBeat(step, fallbackBeat) {
  if (step.kind === "beat" && typeof step.metadata?.beat === "number") {
    return step.metadata.beat;
  }
  return fallbackBeat;
}
function countFutureTurns(clusterStartsByActor, actorId, stepIndex) {
  const starts = clusterStartsByActor.get(actorId) ?? [];
  let count = 0;
  starts.forEach((start) => {
    if (start > stepIndex) {
      count += 1;
    }
  });
  return count;
}
function isSummonStep(step) {
  return step.kind === "buff" && step.metadata?.effect === "summon";
}
function createSyntheticCombatant(options) {
  return {
    combatantId: options.combatantId,
    factionId: options.factionId ?? "balance",
    unitTypeId: options.unitTypeId ?? options.type,
    troopInstanceId: options.troopInstanceId ?? null,
    label: options.label,
    role: options.role,
    type: options.type,
    attributes: [...options.attributes ?? []],
    stats: cloneStats(options.stats),
    abilities: [...options.abilities ?? []],
    quantity: options.quantity ?? 1,
    cost: options.cost ?? 0,
    side: options.side
  };
}
function createUnitTypeCombatant(unitTypeId, options) {
  const unitType = getUnitType(unitTypeId);
  const abilities = options.abilities ?? (options.includeBaseAbilities === false ? [] : unitType.abilityIds.map((abilityId) => getAbility(abilityId)));
  return createSyntheticCombatant({
    combatantId: options.combatantId ?? `${options.side}-${unitTypeId}`,
    factionId: options.factionId ?? "balance",
    unitTypeId,
    label: options.label ?? unitType.label,
    side: options.side,
    role: unitType.role,
    type: unitType.type,
    attributes: options.attributes ?? [...unitType.attributes],
    stats: { ...unitType.stats, ...options.stats },
    abilities,
    quantity: options.quantity ?? unitType.quantity,
    cost: unitType.cost
  });
}
function buildBalanceBattleInput(seed, playerCombatants, enemyCombatants, saturation, mutatorIds = []) {
  return {
    seed,
    riftId: null,
    tier: null,
    mutatorIds,
    saturation,
    playerCombatants,
    enemyCombatants
  };
}
function createSeedRange(count, start = 0) {
  return Array.from({ length: count }, (_, index) => start + index);
}
function extractBalanceMetrics(replay) {
  const unitSide = /* @__PURE__ */ new Map();
  const unitRole = /* @__PURE__ */ new Map();
  const initialUnitIds = new Set(replay.initial.units.map((unit) => unit.id));
  const clusterStartsByActor = /* @__PURE__ */ new Map();
  const summonSpawnBeat = /* @__PURE__ */ new Map();
  const summonDeathBeat = /* @__PURE__ */ new Map();
  const summonedUnitIds = /* @__PURE__ */ new Set();
  const abilitySuccessfulApplications = {};
  const abilityNetImpact = {};
  let currentBeat = 0;
  let firstContactBeat = null;
  let firstBacklineThreatBeat = null;
  let preventedByArmor = 0;
  let totalDamage = 0;
  let summonDamageDealt = 0;
  let summonDamageAbsorbed = 0;
  let summonEngagementsCreated = 0;
  let scalingValueRealized = 0;
  const rememberSnapshot = (snapshot) => {
    snapshot.units.forEach((unit) => {
      unitSide.set(unit.id, unit.side);
      unitRole.set(unit.id, unit.role);
    });
  };
  rememberSnapshot(replay.initial);
  let lastClusterActor = null;
  replay.steps.forEach((step, index) => {
    currentBeat = stepBeat(step, currentBeat);
    rememberSnapshot(step.snapshot);
    const actorId = step.actorIds[0] ?? null;
    if (step.kind === "beat" || !actorId) {
      lastClusterActor = null;
    } else if (actorId !== lastClusterActor) {
      const starts = clusterStartsByActor.get(actorId) ?? [];
      starts.push(index);
      clusterStartsByActor.set(actorId, starts);
      lastClusterActor = actorId;
    }
  });
  currentBeat = 0;
  replay.steps.forEach((step, index) => {
    currentBeat = stepBeat(step, currentBeat);
    const actorId = step.actorIds[0] ?? null;
    if (firstBacklineThreatBeat === null) {
      const aliveBackline = step.snapshot.units.filter((unit) => unit.alive && unit.role === "backline");
      const breached = aliveBackline.some(
        (backline) => step.snapshot.units.some(
          (other) => other.alive && other.side !== backline.side && other.position.q === backline.position.q && other.position.r === backline.position.r
        )
      );
      if (breached) {
        firstBacklineThreatBeat = currentBeat;
      }
    }
    const sourceAbilityId = typeof step.metadata?.sourceAbilityId === "string" ? step.metadata.sourceAbilityId : null;
    if (sourceAbilityId) {
      abilitySuccessfulApplications[sourceAbilityId] = (abilitySuccessfulApplications[sourceAbilityId] ?? 0) + 1;
      if (!abilityNetImpact[sourceAbilityId]) {
        abilityNetImpact[sourceAbilityId] = emptyImpact();
      }
    }
    if (isSummonStep(step)) {
      step.targetIds.forEach((unitId) => {
        summonedUnitIds.add(unitId);
        summonSpawnBeat.set(unitId, currentBeat);
      });
      if (sourceAbilityId) {
        abilityNetImpact[sourceAbilityId].unitsSummoned += step.targetIds.length;
      }
    }
    if (step.kind === "death") {
      step.targetIds.forEach((unitId) => {
        if (summonedUnitIds.has(unitId)) {
          summonDeathBeat.set(unitId, currentBeat);
        }
      });
    }
    if (step.kind === "engage") {
      if (actorId && summonedUnitIds.has(actorId)) {
        summonEngagementsCreated += step.targetIds.length;
      }
      if (sourceAbilityId && step.metadata?.effect === "redirect") {
        abilityNetImpact[sourceAbilityId].redirects += step.targetIds.length;
      }
    }
    if (step.kind === "heal") {
      const amount = typeof step.metadata?.amount === "number" ? step.metadata.amount : 0;
      if (sourceAbilityId) {
        abilityNetImpact[sourceAbilityId].hpHealed = fixedAdd(abilityNetImpact[sourceAbilityId].hpHealed, amount);
      }
      return;
    }
    if (step.kind === "buff") {
      const amount = typeof step.metadata?.amount === "number" ? step.metadata.amount : 0;
      const effect = typeof step.metadata?.effect === "string" ? step.metadata.effect : null;
      if (sourceAbilityId && effect && !step.metadata?.expired) {
        abilityNetImpact[sourceAbilityId].buffsApplied += 1;
      }
      if (sourceAbilityId && amount > 0 && effect && (effect === "ramp" || effect === "haste" || effect === "bolster")) {
        const targetId2 = step.targetIds[0];
        if (targetId2) {
          scalingValueRealized = fixedAdd(
            scalingValueRealized,
            fixed(amount * countFutureTurns(clusterStartsByActor, targetId2, index))
          );
        }
      }
      return;
    }
    if (step.kind !== "attack") {
      return;
    }
    const damage = typeof step.metadata?.damage === "number" ? step.metadata.damage : 0;
    const mode = typeof step.metadata?.mode === "string" ? step.metadata.mode : "melee";
    totalDamage = fixedAdd(totalDamage, damage);
    const targetId = step.targetIds[0];
    const actorUnit = actorId ? getSnapshotUnit(step.snapshot, actorId) : void 0;
    const targetUnit = targetId ? getSnapshotUnit(step.snapshot, targetId) : void 0;
    if (mode === "melee" && damage > 0 && firstContactBeat === null) {
      firstContactBeat = currentBeat;
    }
    if (actorId && summonedUnitIds.has(actorId)) {
      summonDamageDealt = fixedAdd(summonDamageDealt, damage);
    }
    if (targetId && summonedUnitIds.has(targetId)) {
      summonDamageAbsorbed = fixedAdd(summonDamageAbsorbed, damage);
    }
    if (sourceAbilityId) {
      abilityNetImpact[sourceAbilityId].damageDealt = fixedAdd(abilityNetImpact[sourceAbilityId].damageDealt, damage);
    }
    if ((mode === "melee" || mode === "ranged") && actorUnit && targetUnit) {
      const mitigated = Math.max(Math.min(actorUnit.stats.damage, targetUnit.stats.armor), 0);
      preventedByArmor = fixedAdd(preventedByArmor, mitigated);
    }
  });
  const summonUptimes = [...summonedUnitIds].map((unitId) => {
    const spawnBeat = summonSpawnBeat.get(unitId) ?? replay.steps.length;
    const deathBeat = summonDeathBeat.get(unitId) ?? currentBeat;
    return Math.max(0, deathBeat - spawnBeat);
  });
  const summonRealizedValue = fixed(summonDamageDealt + summonDamageAbsorbed + summonEngagementsCreated);
  const beatsToEnd = replay.steps.filter((step) => step.kind === "beat").length;
  const initialUnitCount = Math.max(replay.initial.units.length, 1);
  const totalTurnsTaken = [...clusterStartsByActor.values()].reduce((sum, starts) => sum + starts.length, 0);
  const finalAlive = replay.aliveCounts[replay.aliveCounts.length - 1] ?? { player: 0, enemy: 0 };
  return {
    outcome: replay.outcome,
    beatsToEnd,
    firstContactBeat,
    firstBacklineThreatBeat,
    backlineBreachRate: firstBacklineThreatBeat === null ? 0 : 1,
    ownTurnsTakenPerUnit: fixed(totalTurnsTaken / initialUnitCount),
    playerSurvivors: finalAlive.player,
    enemySurvivors: finalAlive.enemy,
    damagePer100Beats: beatsToEnd === 0 ? 0 : fixed(totalDamage * 100 / beatsToEnd),
    effectiveHpPreserved: preventedByArmor,
    summonUptimeBeats: average(summonUptimes),
    summonRealizedValue,
    scalingValueRealized,
    drawRate: replay.outcome === "draw" ? 1 : 0,
    abilitySuccessfulApplications,
    abilityNetImpact
  };
}
function runBattleWithMetrics(input) {
  const replay = resolveBattle(input);
  return {
    replay,
    metrics: extractBalanceMetrics(replay)
  };
}
function sweepBattleSeeds(makeInput, seeds) {
  const entries = seeds.map((seed) => {
    const { replay, metrics } = runBattleWithMetrics(makeInput(seed));
    return {
      seed,
      replayId: replay.id,
      metrics
    };
  });
  const wins = entries.filter((entry) => entry.metrics.outcome === "victory").length;
  const losses = entries.filter((entry) => entry.metrics.outcome === "defeat").length;
  const draws = entries.filter((entry) => entry.metrics.outcome === "draw").length;
  return {
    entries,
    summary: {
      battles: entries.length,
      wins,
      losses,
      draws,
      winRate: entries.length === 0 ? 0 : fixed(wins / entries.length),
      drawRate: entries.length === 0 ? 0 : fixed(draws / entries.length),
      average: {
        beatsToEnd: average(entries.map((entry) => entry.metrics.beatsToEnd)),
        firstContactBeat: averageNullable(entries.map((entry) => entry.metrics.firstContactBeat)),
        firstBacklineThreatBeat: averageNullable(entries.map((entry) => entry.metrics.firstBacklineThreatBeat)),
        ownTurnsTakenPerUnit: average(entries.map((entry) => entry.metrics.ownTurnsTakenPerUnit)),
        summonUptimeBeats: average(entries.map((entry) => entry.metrics.summonUptimeBeats)),
        summonRealizedValue: average(entries.map((entry) => entry.metrics.summonRealizedValue)),
        scalingValueRealized: average(entries.map((entry) => entry.metrics.scalingValueRealized)),
        damagePer100Beats: average(entries.map((entry) => entry.metrics.damagePer100Beats)),
        effectiveHpPreserved: average(entries.map((entry) => entry.metrics.effectiveHpPreserved))
      },
      percentiles: {
        beatsToEnd: buildPercentiles(entries.map((entry) => entry.metrics.beatsToEnd)),
        firstContactBeat: buildNullablePercentiles(entries.map((entry) => entry.metrics.firstContactBeat)),
        firstBacklineThreatBeat: buildNullablePercentiles(entries.map((entry) => entry.metrics.firstBacklineThreatBeat))
      }
    }
  };
}

// src/engine/permutationReport.ts
function compareTroopIds(left, right) {
  return left.localeCompare(right);
}
function choose(items, size, start = 0, prefix = [], result = []) {
  if (prefix.length === size) {
    result.push([...prefix]);
    return result;
  }
  for (let index = start; index <= items.length - (size - prefix.length); index += 1) {
    prefix.push(items[index]);
    choose(items, size, index + 1, prefix, result);
    prefix.pop();
  }
  return result;
}
function emptyRecord() {
  return {
    wins: 0,
    losses: 0,
    draws: 0,
    samples: 0
  };
}
function cloneRecord(record) {
  return {
    wins: record?.wins ?? 0,
    losses: record?.losses ?? 0,
    draws: record?.draws ?? 0,
    samples: record?.samples ?? 0
  };
}
function getEligiblePermutationUnitTypeIds() {
  return filterEligiblePermutationUnitTypeIds(Object.values(UNIT_TYPES).map((unitType) => unitType.id));
}
function filterEligiblePermutationUnitTypeIds(unitTypeIds) {
  return Object.values(UNIT_TYPES).filter((unitType) => unitTypeIds.includes(unitType.id)).filter((unitType) => !unitType.attributes.includes("summoned")).map((unitType) => unitType.id).sort(compareTroopIds);
}
function resolvePermutationQuantity(unitTypeId) {
  return Math.max(1, Math.round(120 / getUnitType(unitTypeId).cost));
}
function generatePermutationTeams(teamSize, unitTypeIds) {
  return choose([...unitTypeIds].sort(compareTroopIds), teamSize).map((troopIds) => ({
    troopIds,
    key: troopIds.join("+"),
    label: troopIds.map((troopId) => getUnitType(troopId).label).join(" + ")
  }));
}
function generatePermutationMatchups(teams) {
  const ordered = [...teams].sort((left, right) => left.key.localeCompare(right.key));
  const matchups = [];
  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const left = ordered[leftIndex];
      const right = ordered[rightIndex];
      matchups.push({
        key: `${left.key}__vs__${right.key}`,
        left,
        right,
        index: matchups.length
      });
    }
  }
  return matchups;
}
function createPermutationSeeds(teamSize, matchupIndex, runCount) {
  return createSeedRange(runCount, teamSize * 1e6 + matchupIndex * runCount);
}
function createEmptyPermutationAggregate(unitTypeIds) {
  const troopIds = [...unitTypeIds].sort(compareTroopIds);
  const quantities = Object.fromEntries(troopIds.map((troopId) => [troopId, resolvePermutationQuantity(troopId)]));
  const labels = Object.fromEntries(troopIds.map((troopId) => [troopId, getUnitType(troopId).label]));
  const overall = Object.fromEntries(troopIds.map((troopId) => [troopId, emptyRecord()]));
  const matrix = Object.fromEntries(
    troopIds.map((troopId) => [
      troopId,
      Object.fromEntries(troopIds.filter((otherTroopId) => otherTroopId !== troopId).map((otherTroopId) => [otherTroopId, emptyRecord()]))
    ])
  );
  return {
    troopIds,
    quantities,
    labels,
    overall,
    against: matrix,
    alongside: Object.fromEntries(
      troopIds.map((troopId) => [
        troopId,
        Object.fromEntries(troopIds.filter((otherTroopId) => otherTroopId !== troopId).map((otherTroopId) => [otherTroopId, emptyRecord()]))
      ])
    )
  };
}
function applyOutcomeToSide(record, outcome, side) {
  record.samples += 1;
  if (outcome === "draw") {
    record.draws += 1;
    return;
  }
  if (side === "winner") {
    record.wins += 1;
    return;
  }
  record.losses += 1;
}
function applyPermutationOutcome(aggregate, leftTroopIds, rightTroopIds, outcome) {
  const leftWon = outcome === "victory";
  const rightWon = outcome === "defeat";
  leftTroopIds.forEach((troopId) => {
    const record = aggregate.overall[troopId];
    applyOutcomeToSide(record, outcome, leftWon ? "winner" : rightWon ? "loser" : "draw");
  });
  rightTroopIds.forEach((troopId) => {
    const record = aggregate.overall[troopId];
    applyOutcomeToSide(record, outcome, rightWon ? "winner" : leftWon ? "loser" : "draw");
  });
  leftTroopIds.forEach((troopId) => {
    rightTroopIds.forEach((otherTroopId) => {
      const record = aggregate.against[troopId]?.[otherTroopId];
      if (record) {
        applyOutcomeToSide(record, outcome, leftWon ? "winner" : rightWon ? "loser" : "draw");
      }
    });
  });
  rightTroopIds.forEach((troopId) => {
    leftTroopIds.forEach((otherTroopId) => {
      const record = aggregate.against[troopId]?.[otherTroopId];
      if (record) {
        applyOutcomeToSide(record, outcome, rightWon ? "winner" : leftWon ? "loser" : "draw");
      }
    });
  });
  leftTroopIds.forEach((troopId) => {
    leftTroopIds.forEach((teammateTroopId) => {
      if (troopId === teammateTroopId) {
        return;
      }
      const record = aggregate.alongside[troopId]?.[teammateTroopId];
      if (record) {
        applyOutcomeToSide(record, outcome, leftWon ? "winner" : rightWon ? "loser" : "draw");
      }
    });
  });
  rightTroopIds.forEach((troopId) => {
    rightTroopIds.forEach((teammateTroopId) => {
      if (troopId === teammateTroopId) {
        return;
      }
      const record = aggregate.alongside[troopId]?.[teammateTroopId];
      if (record) {
        applyOutcomeToSide(record, outcome, rightWon ? "winner" : leftWon ? "loser" : "draw");
      }
    });
  });
}
function mergePermutationAggregates(base, incoming) {
  base.troopIds.forEach((troopId) => {
    const baseOverall = base.overall[troopId];
    const incomingOverall = incoming.overall[troopId];
    baseOverall.wins += incomingOverall.wins;
    baseOverall.losses += incomingOverall.losses;
    baseOverall.draws += incomingOverall.draws;
    baseOverall.samples += incomingOverall.samples;
    base.troopIds.forEach((otherTroopId) => {
      if (troopId === otherTroopId) {
        return;
      }
      const baseAgainst = base.against[troopId]?.[otherTroopId];
      const incomingAgainst = incoming.against[troopId]?.[otherTroopId];
      if (baseAgainst && incomingAgainst) {
        baseAgainst.wins += incomingAgainst.wins;
        baseAgainst.losses += incomingAgainst.losses;
        baseAgainst.draws += incomingAgainst.draws;
        baseAgainst.samples += incomingAgainst.samples;
      }
      const baseAlongside = base.alongside[troopId]?.[otherTroopId];
      const incomingAlongside = incoming.alongside[troopId]?.[otherTroopId];
      if (baseAlongside && incomingAlongside) {
        baseAlongside.wins += incomingAlongside.wins;
        baseAlongside.losses += incomingAlongside.losses;
        baseAlongside.draws += incomingAlongside.draws;
        baseAlongside.samples += incomingAlongside.samples;
      }
    });
  });
  return base;
}
function finalizeRecord(record, troopId, quantity) {
  const decisiveSamples = record.wins + record.losses;
  return {
    troopId,
    label: getUnitType(troopId).label,
    quantity,
    wins: record.wins,
    losses: record.losses,
    draws: record.draws,
    samples: record.samples,
    decisiveWinRate: decisiveSamples === 0 ? 0 : fixed(record.wins / decisiveSamples),
    drawRate: record.samples === 0 ? 0 : fixed(record.draws / record.samples)
  };
}
function sortMatrixEntries(entries) {
  return [...entries].sort(
    (left, right) => right.decisiveWinRate - left.decisiveWinRate || right.drawRate - left.drawRate || left.troopId.localeCompare(right.troopId)
  );
}
function finalizePermutationAggregate(aggregate, teamSize, teamCount, matchupCount, runCount, elapsedMs, generatedAt = (/* @__PURE__ */ new Date()).toISOString()) {
  const troops = aggregate.troopIds.map((troopId) => ({
    troopId,
    label: aggregate.labels[troopId],
    quantity: aggregate.quantities[troopId]
  }));
  return {
    mode: `permutations-${teamSize}v${teamSize}`,
    teamSize,
    runCount,
    troopCount: aggregate.troopIds.length,
    teamCount,
    matchupCount,
    elapsedMs,
    generatedAt,
    troops,
    overall: sortMatrixEntries(
      aggregate.troopIds.map((troopId) => finalizeRecord(aggregate.overall[troopId], troopId, aggregate.quantities[troopId]))
    ),
    against: aggregate.troopIds.map((troopId) => ({
      troopId,
      label: aggregate.labels[troopId],
      quantity: aggregate.quantities[troopId],
      entries: sortMatrixEntries(
        aggregate.troopIds.filter((otherTroopId) => otherTroopId !== troopId).map((otherTroopId) => finalizeRecord(aggregate.against[troopId]?.[otherTroopId] ?? emptyRecord(), otherTroopId, aggregate.quantities[otherTroopId]))
      )
    })),
    alongside: aggregate.troopIds.map((troopId) => ({
      troopId,
      label: aggregate.labels[troopId],
      quantity: aggregate.quantities[troopId],
      entries: sortMatrixEntries(
        aggregate.troopIds.filter((otherTroopId) => otherTroopId !== troopId).map((otherTroopId) => finalizeRecord(aggregate.alongside[troopId]?.[otherTroopId] ?? emptyRecord(), otherTroopId, aggregate.quantities[otherTroopId]))
      )
    }))
  };
}
function renderTable(entries) {
  return [
    "| Troop | Qty | Win % | Draw % | Wins | Losses | Draws | Samples |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...entries.map(
      (entry) => `| ${entry.label} | ${entry.quantity} | ${entry.decisiveWinRate.toFixed(3)} | ${entry.drawRate.toFixed(3)} | ${entry.wins} | ${entry.losses} | ${entry.draws} | ${entry.samples} |`
    )
  ];
}
function renderPermutationReport(data) {
  return [
    `# ${data.teamSize}v${data.teamSize} Permutation Report`,
    "",
    `- Generated: ${data.generatedAt}`,
    `- Eligible troops: ${data.troopCount}`,
    `- Teams: ${data.teamCount}`,
    `- Matchups: ${data.matchupCount}`,
    `- Runs per matchup: ${data.runCount}`,
    `- Elapsed ms: ${data.elapsedMs}`,
    "",
    "## Overall troop winrates",
    "",
    ...renderTable(data.overall),
    "",
    "## Against every troop type",
    "",
    ...data.against.flatMap((section) => [
      `### ${section.label}`,
      "",
      ...renderTable(section.entries),
      ""
    ]),
    "## Alongside every troop type",
    "",
    ...data.alongside.flatMap((section) => [
      `### ${section.label}`,
      "",
      ...renderTable(section.entries),
      ""
    ])
  ].join("\n");
}
function runPermutationBatch(teamSize, matchups, runCount, unitTypeIds) {
  const aggregate = createEmptyPermutationAggregate(unitTypeIds);
  const quantities = Object.fromEntries(unitTypeIds.map((troopId) => [troopId, resolvePermutationQuantity(troopId)]));
  const results = matchups.map((matchup) => {
    const sweep = sweepBattleSeeds(
      (seed) => buildBalanceBattleInput(
        seed,
        matchup.left.troopIds.map(
          (troopId, index) => createUnitTypeCombatant(troopId, {
            side: "player",
            quantity: quantities[troopId],
            combatantId: `player-${matchup.index}-${index}-${troopId}`
          })
        ),
        matchup.right.troopIds.map(
          (troopId, index) => createUnitTypeCombatant(troopId, {
            side: "enemy",
            quantity: quantities[troopId],
            combatantId: `enemy-${matchup.index}-${index}-${troopId}`
          })
        )
      ),
      createPermutationSeeds(teamSize, matchup.index, runCount)
    );
    sweep.entries.forEach((entry) => {
      applyPermutationOutcome(aggregate, matchup.left.troopIds, matchup.right.troopIds, entry.metrics.outcome);
    });
    return {
      matchupKey: matchup.key,
      record: {
        playerWins: sweep.summary.wins,
        enemyWins: sweep.summary.losses,
        draws: sweep.summary.draws,
        samples: sweep.summary.battles
      }
    };
  });
  return { aggregate, results };
}
function serializePermutationAggregate(aggregate) {
  return {
    troopIds: [...aggregate.troopIds],
    quantities: Object.fromEntries(Object.entries(aggregate.quantities)),
    labels: Object.fromEntries(Object.entries(aggregate.labels)),
    overall: Object.fromEntries(aggregate.troopIds.map((troopId) => [troopId, cloneRecord(aggregate.overall[troopId])])),
    against: Object.fromEntries(
      aggregate.troopIds.map((troopId) => [
        troopId,
        Object.fromEntries(
          aggregate.troopIds.filter((otherTroopId) => otherTroopId !== troopId).map((otherTroopId) => [otherTroopId, cloneRecord(aggregate.against[troopId]?.[otherTroopId])])
        )
      ])
    ),
    alongside: Object.fromEntries(
      aggregate.troopIds.map((troopId) => [
        troopId,
        Object.fromEntries(
          aggregate.troopIds.filter((otherTroopId) => otherTroopId !== troopId).map((otherTroopId) => [otherTroopId, cloneRecord(aggregate.alongside[troopId]?.[otherTroopId])])
        )
      ])
    )
  };
}

// scripts/reportPermutationsCommon.ts
var DEFAULT_RUN_COUNT = 10;
var DEFAULT_BATCH_SIZE = {
  2: 25,
  3: 10
};
function parseArgs() {
  const args = process.argv.slice(2);
  const workersArg = args.find((arg) => arg.startsWith("--workers="));
  const runsArg = args.find((arg) => arg.startsWith("--runs="));
  const outputDirArg = args.find((arg) => arg.startsWith("--outputDir="));
  const unitTypeIdsArg = args.find((arg) => arg.startsWith("--unitTypeIds="));
  return {
    outputDir: outputDirArg ? outputDirArg.slice("--outputDir=".length) : resolve(process.cwd(), "balance_results"),
    runCount: runsArg ? Math.max(1, Number.parseInt(runsArg.slice("--runs=".length), 10) || DEFAULT_RUN_COUNT) : DEFAULT_RUN_COUNT,
    workerCount: workersArg ? Math.max(1, Number.parseInt(workersArg.slice("--workers=".length), 10) || 1) : 1,
    resume: args.includes("--resume"),
    ...unitTypeIdsArg ? {
      unitTypeIds: unitTypeIdsArg.slice("--unitTypeIds=".length).split(",").map((unitTypeId) => unitTypeId.trim()).filter((unitTypeId) => unitTypeId.length > 0)
    } : {}
  };
}
function chunkMatchups(matchups, batchSize) {
  const chunks = [];
  for (let index = 0; index < matchups.length; index += batchSize) {
    chunks.push(matchups.slice(index, index + batchSize));
  }
  return chunks;
}
function createConfigHash(teamSize, runCount, unitTypeIds) {
  return createHash("sha1").update(JSON.stringify({ teamSize, runCount, unitTypeIds })).digest("hex");
}
async function readCheckpoint(checkpointPath) {
  try {
    const content = await readFile(checkpointPath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}
async function writeCheckpoint(checkpointPath, configHash, teamSize, runCount, unitTypeIds, completedMatchupKeys, aggregate) {
  const payload = {
    configHash,
    teamSize,
    runCount,
    unitTypeIds,
    completedMatchupKeys: [...completedMatchupKeys].sort(),
    aggregate: serializePermutationAggregate(aggregate)
  };
  await writeFile(checkpointPath, JSON.stringify(payload, null, 2), "utf8");
}
async function runBatchInWorker(workerPath, teamSize, runCount, unitTypeIds, matchups) {
  return new Promise((resolvePromise, rejectPromise) => {
    const worker = new Worker(workerPath);
    worker.once("message", (result) => {
      worker.terminate().catch(() => void 0);
      resolvePromise(result);
    });
    worker.once("error", (error) => {
      worker.terminate().catch(() => void 0);
      rejectPromise(error);
    });
    worker.postMessage({
      teamSize,
      runCount,
      unitTypeIds,
      matchups
    });
  });
}
async function processBatches(workerPath, teamSize, runCount, workerCount, unitTypeIds, batches, aggregate, completedMatchupKeys, checkpointPath, configHash) {
  const pendingBatches = [...batches];
  const totalBatches = batches.length;
  const progressInterval = Math.max(1, Math.floor(totalBatches / 100));
  let completedBatches = 0;
  let useWorkers = workerCount > 1;
  const runNext = async () => {
    const batch = pendingBatches.shift();
    if (!batch) {
      return;
    }
    let result;
    if (!useWorkers) {
      result = runPermutationBatch(teamSize, batch, runCount, unitTypeIds);
    } else {
      try {
        result = await runBatchInWorker(workerPath, teamSize, runCount, unitTypeIds, batch);
      } catch (error) {
        console.warn(`Worker startup failed for ${teamSize}v${teamSize}; falling back to serial execution.`, error);
        useWorkers = false;
        result = runPermutationBatch(teamSize, batch, runCount, unitTypeIds);
      }
    }
    mergePermutationAggregates(aggregate, result.aggregate);
    result.results.forEach((entry) => completedMatchupKeys.add(entry.matchupKey));
    completedBatches += 1;
    await writeCheckpoint(checkpointPath, configHash, teamSize, runCount, unitTypeIds, completedMatchupKeys, aggregate);
    if (completedBatches === 1 || completedBatches === totalBatches || completedBatches % progressInterval === 0) {
      console.log(
        `[${teamSize}v${teamSize}] Completed ${completedBatches}/${totalBatches} batches, ${completedMatchupKeys.size} / ${completedMatchupKeys.size + pendingBatches.reduce((sum, entry) => sum + entry.length, 0)} matchups.`
      );
    }
    await runNext();
  };
  const runners = Array.from({ length: Math.min(useWorkers ? workerCount : 1, batches.length || 1) }, () => runNext());
  await Promise.all(runners);
}
async function generatePermutationReportFiles(teamSize) {
  const options = parseArgs();
  const outputDir = resolve(options.outputDir);
  const stem = `permutations-${teamSize}v${teamSize}`;
  const markdownPath = resolve(outputDir, `${stem}.md`);
  const jsonPath = resolve(outputDir, `${stem}.json`);
  const checkpointPath = resolve(outputDir, `${stem}.checkpoint.json`);
  const workerPath = resolve(process.cwd(), "dist-scripts", "scripts", "permutationWorker.js");
  const eligibleTroops = options.unitTypeIds ? filterEligiblePermutationUnitTypeIds(options.unitTypeIds) : getEligiblePermutationUnitTypeIds();
  const configHash = createConfigHash(teamSize, options.runCount, eligibleTroops);
  const teams = generatePermutationTeams(teamSize, eligibleTroops);
  const matchups = generatePermutationMatchups(teams);
  const startedAt = Date.now();
  await mkdir(outputDir, { recursive: true });
  let aggregate = createEmptyPermutationAggregate(eligibleTroops);
  let completedMatchupKeys = /* @__PURE__ */ new Set();
  if (options.resume) {
    const checkpoint = await readCheckpoint(checkpointPath);
    if (checkpoint && checkpoint.configHash === configHash && checkpoint.teamSize === teamSize && checkpoint.runCount === options.runCount && JSON.stringify(checkpoint.unitTypeIds) === JSON.stringify(eligibleTroops)) {
      aggregate = checkpoint.aggregate;
      completedMatchupKeys = new Set(checkpoint.completedMatchupKeys);
    }
  }
  const pendingMatchups = matchups.filter((matchup) => !completedMatchupKeys.has(matchup.key));
  const batches = chunkMatchups(pendingMatchups, DEFAULT_BATCH_SIZE[teamSize]);
  console.log(
    `Starting ${teamSize}v${teamSize} permutation report with ${eligibleTroops.length} troops, ${teams.length} teams, ${matchups.length} matchups, ${options.runCount} runs each, ${options.workerCount} worker(s).`
  );
  if (completedMatchupKeys.size > 0) {
    console.log(`Resuming from checkpoint with ${completedMatchupKeys.size} completed matchups already recorded.`);
  }
  if (batches.length > 0) {
    await processBatches(
      workerPath,
      teamSize,
      options.runCount,
      options.workerCount,
      eligibleTroops,
      batches,
      aggregate,
      completedMatchupKeys,
      checkpointPath,
      configHash
    );
  }
  const finalized = finalizePermutationAggregate(
    aggregate,
    teamSize,
    teams.length,
    matchups.length,
    options.runCount,
    Date.now() - startedAt
  );
  const markdown = renderPermutationReport(finalized);
  await writeFile(markdownPath, markdown, "utf8");
  await writeFile(jsonPath, JSON.stringify(finalized, null, 2), "utf8");
  console.log(`Finished ${teamSize}v${teamSize} report.`);
  console.log(`Markdown: ${markdownPath}`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`Checkpoint: ${checkpointPath}`);
  return finalized;
}

// scripts/reportPermutations3v3.ts
generatePermutationReportFiles(3).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
