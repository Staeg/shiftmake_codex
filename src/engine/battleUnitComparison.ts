import type { BattleUnit, HexCoord, UnitStats } from './types';

type FieldComparisons<T> = {
  [K in keyof T]-?: (left: T[K], right: T[K]) => boolean;
};

function sameValue<T>(left: T, right: T): boolean {
  return left === right;
}

function sameFields<T>(left: T, right: T, comparisons: FieldComparisons<T>): boolean {
  for (const key in comparisons) {
    if (!comparisons[key](left[key], right[key])) return false;
  }
  return true;
}

function sameOrderedItems<T>(left: T[], right: T[], compare: (a: T, b: T) => boolean): boolean {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (!compare(left[index]!, right[index]!)) return false;
  }
  return true;
}

const hexComparisons: FieldComparisons<HexCoord> = { q: sameValue, r: sameValue };
const statComparisons: FieldComparisons<UnitStats> = {
  health: sameValue,
  damage: sameValue,
  rate: sameValue,
  move: sameValue,
  range: sameValue,
  armor: sameValue,
  size: sameValue,
  capacity: sameValue,
};

function sameHex(left: HexCoord, right: HexCoord): boolean {
  return sameFields(left, right, hexComparisons);
}

// Required mapped keys make new fields (including optional ones) a compiler error here.
const unitComparisons: FieldComparisons<BattleUnit> = {
  id: sameValue,
  troopInstanceId: sameValue,
  troopId: sameValue,
  troopLabel: sameValue,
  unitClassId: sameValue,
  raceId: sameValue,
  side: sameValue,
  role: sameValue,
  unitClassTag: sameValue,
  attributes: (left, right) => sameOrderedItems(left, right, sameValue),
  position: sameHex,
  occupiedHexes: (left, right) => sameOrderedItems(left, right, sameHex),
  footprintOrientation: sameValue,
  stats: (left, right) => sameFields(left, right, statComparisons),
  hp: sameValue,
  maxHp: sameValue,
  readiness: sameValue,
  alive: sameValue,
  engagedWithIds: (left, right) => sameOrderedItems(left, right, sameValue),
};

export function battleUnitChanged(left: BattleUnit | undefined, right: BattleUnit): boolean {
  return !left || !sameFields(left, right, unitComparisons);
}
