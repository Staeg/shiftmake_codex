import { createTroopInstance, getTroopQuantityBreakdown } from '../engine/army';
import { formatFixed } from '../engine/fixed';
import {
  RACE_UPGRADES,
  getAbility,
  getRace,
  getMutator,
  getSummonedUnitPreviews,
  getTroopClassUpgrade,
  getUnitClass,
} from '../engine/unitCatalog';
import type {
  AbilityDefinition,
  ExplainedStatKey,
  RaceId,
  GameMode,
  RiftInstance,
  RoleId,
  StatBreakdown,
  UnitClassId,
  UpgradeId,
} from '../engine/types';
import { displayIcon, formatAbilityDescription, statIcon } from './inspectText';

export type StatEntry = {
  key: string;
  label: string;
  name?: string;
  description?: string;
  value: string;
  breakdown: StatBreakdown | null;
};

export type DetailCard =
  | {
      detailKey: string;
      kind: 'mutator' | 'race' | 'upgrade' | 'rift';
      label: string;
      description: string;
      iconKind?: 'upgrade' | 'mutator';
      iconId?: string;
      stats?: StatEntry[];
    }
  | {
      detailKey: string;
      kind: 'unit';
      inspectLabel: string;
      label: string;
      description: string;
      portraitUrl: string;
      quantity: number;
      raceId: RaceId;
      unitClassId: UnitClassId;
      role: RoleId;
      stats: StatEntry[];
      abilities: Array<{
        id: string;
        label: string;
        description: string;
        summoned: Array<{
          key: string;
          label: string;
          count: number;
          detail: DetailCard;
        }>;
      }>;
    };

const EXPLAINED_STAT_ORDER: ExplainedStatKey[] = ['health', 'damage', 'speed', 'move', 'armor', 'range', 'capacity', 'size'];

export function parseTroopUnlockId(troopUnlockId: string): [RaceId, UnitClassId] {
  return troopUnlockId.split('/') as [RaceId, UnitClassId];
}

export function slotPhaseLabel(phase?: string | null): string {
  return phase ? phase.replace(/_/g, ' ') : 'planning';
}

export function formatRiftTierLabel(tier: number): string {
  return `T${tier}`;
}

export function riftTierTooltip(tier: number, gameMode: GameMode): string {
  if (gameMode === 'contest') {
    return `Tier ${tier} sets the Guardian difficulty for this Rift and pays ${tier} Victory Point per cycle to the side controlling it.`;
  }
  if (gameMode === 'ladder') {
    return `Tier ${tier} sets the Ladder Guardian difficulty and awards ${tier} Victory Point if you win this Rift.`;
  }
  return `Tier ${tier} sets the enemy difficulty and awards ${tier} Victory Point if you win this Rift.`;
}

export function formatRiftDisplayId(riftId: string): string {
  const match = /^cycle-(\d+)-rift-(\d+)$/i.exec(riftId);
  if (!match) {
    return riftId;
  }

  const [, cycleNumber, riftNumber] = match;
  return `C${cycleNumber}R${riftNumber}`;
}

export function getUpgradeDetails(upgradeId: UpgradeId): { label: string; description: string; bucket: string } {
  if (upgradeId in RACE_UPGRADES) {
    const upgrade = RACE_UPGRADES[upgradeId]!;
    return {
      label: upgrade.label,
      description: upgrade.description,
      bucket: `${getRace(upgrade.raceId).label} race upgrade`,
    };
  }

  const upgrade = getTroopClassUpgrade(upgradeId);
  return {
    label: upgrade.label,
    description: upgrade.description,
    bucket: `${getUnitClass(upgrade.unitClassId).label} troop upgrade`,
  };
}

export function getStatLabel(key: ExplainedStatKey): string {
  return {
    health: 'Health',
    damage: 'Damage',
    speed: 'Speed',
    move: 'Move',
    range: 'Range',
    armor: 'Armor',
    capacity: 'Capacity',
    size: 'Size',
  }[key];
}

export function getStatDescription(key: ExplainedStatKey): string {
  return {
    health: 'How much punishment each unit can take before falling.',
    damage: 'How much harm each attack deals before armor and other effects.',
    speed: 'How quickly the unit gains initiative and takes turns.',
    move: 'How many hexes this unit can travel during ordinary movement and special repositioning.',
    range: 'How many hexes away the unit can attack from.',
    armor: 'Flat damage reduction applied when the unit is hit.',
    capacity: 'How many enemies this unit can hold in melee engagement.',
    size: 'How much space each unit occupies on the battlefield.',
  }[key];
}

export function formatStatModifier(value: { flat?: number; multiplier?: number } | undefined): string {
  if (!value) {
    return '0';
  }

  const parts: string[] = [];
  const multiplier = value.multiplier ?? 1;
  const percent = (multiplier - 1) * 100;
  if (percent !== 0) {
    parts.push(`${percent > 0 ? '+' : ''}${formatFixed(percent)}%`);
  }
  if ((value.flat ?? 0) !== 0) {
    parts.push(`${value.flat! > 0 ? '+' : ''}${formatFixed(value.flat!)}`);
  }
  return parts.join(', ') || '0';
}

export function buildStatEntries(
  stats: { health: number; damage: number; speed: number; move: number; armor: number; range: number; capacity: number; size?: number },
  breakdowns?: Partial<Record<ExplainedStatKey | 'quantity', StatBreakdown>>,
  includeSize = false,
  quantity?: number,
): StatEntry[] {
  const keys = includeSize ? EXPLAINED_STAT_ORDER : EXPLAINED_STAT_ORDER.filter((stat) => stat !== 'size');
  const entries = keys.map((key) => ({
    key,
    label: displayIcon(key),
    name: getStatLabel(key),
    description: getStatDescription(key),
    value: formatFixed(key === 'size' ? stats.size ?? 0 : (stats[key as keyof typeof stats] as number)),
    breakdown: breakdowns?.[key] ?? null,
  }));

  if (typeof quantity === 'number') {
    entries.push({
      key: 'quantity',
      label: displayIcon('quantity'),
      name: 'Quantity',
      description: 'How many bodies are in this troop group.',
      value: formatFixed(quantity),
      breakdown: breakdowns?.quantity ?? null,
    });
  }

  return entries;
}

export function describeRaceModifiers(raceId: RaceId): string[] {
  const race = getRace(raceId);
  const parts: string[] = [];

  Object.entries(race.statAdjustments).forEach(([key, adjustment]) => {
    if (!adjustment) {
      return;
    }

    if (key === 'cost') {
      const percent = ((adjustment.multiplier ?? 1) - 1) * 100;
      const flat = adjustment.flat ?? 0;
      if (percent !== 0) {
        parts.push(`Recruitment cost ${percent > 0 ? '+' : ''}${formatFixed(percent)}%.`);
      } else if (flat !== 0) {
        parts.push(`Recruitment cost ${flat > 0 ? '+' : ''}${formatFixed(flat)}.`);
      }
      return;
    }

    const flat = adjustment.flat ?? 0;
    const percent = ((adjustment.multiplier ?? 1) - 1) * 100;
    const modifiers: string[] = [];
    if (flat !== 0) {
      modifiers.push(`${flat > 0 ? '+' : ''}${formatFixed(flat)}`);
    }
    if (percent !== 0) {
      modifiers.push(`${percent > 0 ? '+' : ''}${formatFixed(percent)}%`);
    }
    if (modifiers.length > 0) {
      parts.push(`${statIcon(key as ExplainedStatKey)} ${modifiers.join(', ')}.`);
    }
  });

  race.abilityIds.forEach((abilityId) => {
    const ability = getAbility(abilityId);
    parts.push(`${ability.label}: ${formatAbilityDescription(ability)}`);
  });

  return parts.length > 0 ? parts : ['No special modifiers.'];
}

export function buildRaceDetail(raceId: RaceId): DetailCard {
  const race = getRace(raceId);
  const nonStatModifiers = race.abilityIds.map((abilityId) => {
    const ability = getAbility(abilityId);
    return `${ability.label}: ${formatAbilityDescription(ability)}`;
  });
  const stats = EXPLAINED_STAT_ORDER.map((key) => ({
    key,
    label: displayIcon(key),
    name: getStatLabel(key),
    description: getStatDescription(key),
    value: formatStatModifier(race.statAdjustments[key]),
    breakdown: null,
  })).filter((entry) => entry.value !== '0');

  return {
    detailKey: `race:${raceId}`,
    kind: 'race',
    label: race.label,
    description: nonStatModifiers.join(' '),
    stats,
  };
}

export function buildMutatorDetail(mutatorId: string): DetailCard {
  const mutator = getMutator(mutatorId);
  return {
    detailKey: `mutator:${mutatorId}`,
    kind: 'mutator',
    label: mutator.label,
    description: mutator.description,
    iconKind: 'mutator',
    iconId: mutatorId,
  };
}

export function buildRiftTierDetail(rift: RiftInstance, gameMode: GameMode): DetailCard {
  return {
    detailKey: `rift-tier:${rift.id}`,
    kind: 'rift',
    label: `Tier ${rift.tier}`,
    description: riftTierTooltip(rift.tier, gameMode),
  };
}

export function buildUpgradeDetail(upgradeId: UpgradeId): DetailCard {
  const details = getUpgradeDetails(upgradeId);
  return {
    detailKey: `upgrade:${upgradeId}`,
    kind: 'upgrade',
    label: details.label,
    description: details.description,
    iconKind: 'upgrade',
    iconId: upgradeId,
  };
}

type BuildResolvedUnitDetailOptions = {
  detailKey: string;
  label: string;
  raceId: RaceId;
  unitClassId: UnitClassId;
  stats: { health: number; damage: number; speed: number; move: number; armor: number; range: number; capacity: number; size?: number };
  quantity: number;
  description: string;
  abilities: AbilityDefinition[];
  statBreakdowns?: Partial<Record<ExplainedStatKey | 'quantity', StatBreakdown>>;
  getRaceUnitPortrait: (raceId: RaceId, unitClassId: UnitClassId) => string;
  summonPreviewTrail?: string[];
};

export function buildResolvedUnitDetail(options: BuildResolvedUnitDetailOptions): DetailCard {
  const safeDescription = options.description ?? 'Troop preview.';
  const lowerDescription = safeDescription.toLowerCase();
  const summonPreviewTrail = options.summonPreviewTrail ?? [];
  return {
    detailKey: options.detailKey,
    kind: 'unit',
    inspectLabel:
      /^enemy:/.test(options.detailKey) || lowerDescription.includes('enemy')
        ? 'Enemy Troop'
        : lowerDescription.includes('assigned') || /^rift-assigned:/.test(options.detailKey)
          ? 'Assigned Troop'
          : lowerDescription.includes('ready') || /^ready:/.test(options.detailKey)
            ? 'Ready Troop'
            : 'Troop Inspector',
    label: options.label,
    description: safeDescription,
    portraitUrl: options.getRaceUnitPortrait(options.raceId, options.unitClassId),
    quantity: options.quantity,
    raceId: options.raceId,
    unitClassId: options.unitClassId,
    role: getUnitClass(options.unitClassId).role,
    stats: buildStatEntries(
      options.stats,
      {
        ...(options.statBreakdowns ?? {}),
        quantity: getTroopQuantityBreakdown(createTroopInstance(options.raceId, options.unitClassId)),
      },
      true,
      options.quantity,
    ),
    abilities: options.abilities.map((ability) => {
      const summoned = getSummonedUnitPreviews(ability, options.raceId).map((preview) => ({
        key: `${ability.id}:${preview.unitClassId}:${preview.count}:${preview.grantedAbilityIds.join(',')}`,
        label: preview.troop.label,
        count: preview.count,
        detail: (() => {
          const previewKey = `${ability.id}:${preview.unitClassId}:${preview.grantedAbilityIds.join(',')}`;
          const repeatsPreview = summonPreviewTrail.includes(previewKey);
          return buildResolvedUnitDetail({
            detailKey: `summon-preview:${options.detailKey}:${ability.id}:${preview.unitClassId}:${preview.grantedAbilityIds.join(',')}`,
            label: preview.troop.label,
            raceId: preview.troop.raceId,
            unitClassId: preview.troop.unitClassId,
            stats: preview.troop.stats,
            quantity: preview.troop.quantity,
            description: `${preview.count > 1 ? `${preview.count} units. ` : ''}${preview.consumesCorpse ? 'Requires a corpse. ' : ''}Summoned by ${ability.label}.`,
            abilities: repeatsPreview ? [] : preview.troop.abilities,
            getRaceUnitPortrait: options.getRaceUnitPortrait,
            summonPreviewTrail: [...summonPreviewTrail, previewKey],
          });
        })(),
      }));
      return {
        id: ability.id,
        label: ability.label,
        description: formatAbilityDescription(ability),
        summoned,
      };
    }),
  };
}

export function unitIconCount(quantity: number): number {
  return Number.isFinite(quantity) ? Math.max(1, Math.round(quantity)) : 1;
}

export function unitIconCopies(quantity: number): number[] {
  return Array.from({ length: unitIconCount(quantity) }, (_, index) => index);
}

export function unitIconColumns(quantity: number): number {
  const count = unitIconCount(quantity);
  if (count <= 1) {
    return 1;
  }
  if (count <= 4) {
    return count;
  }
  if (count <= 6) {
    return 3;
  }
  if (count <= 12) {
    return 4;
  }
  if (count <= 20) {
    return 5;
  }
  return 6;
}

export function unitIconDensityClass(quantity: number): string {
  const count = unitIconCount(quantity);
  if (count > 20) {
    return 'density-24';
  }
  if (count > 12) {
    return 'density-20';
  }
  if (count >= 10) {
    return 'density-12';
  }
  if (count >= 7) {
    return 'density-9';
  }
  if (count >= 5) {
    return 'density-6';
  }
  if (count >= 2) {
    return 'density-4';
  }
  return 'density-1';
}
