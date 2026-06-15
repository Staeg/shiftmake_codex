import type { AbilityId, MutatorId, UpgradeId } from '../engine/types';
import { ABILITIES } from '../engine/unitCatalog';

type IconKind = 'ability' | 'faction_upgrade' | 'troop_type_upgrade' | 'rift_mutator';
export type AbilityFallbackIconShape = 'heart' | 'self' | 'single' | 'aoe' | 'plus';
export type AbilityFallbackIconTone = 'positive' | 'negative' | 'neutral';
export type AbilityFallbackIcon = {
  shape: AbilityFallbackIconShape;
  tone: AbilityFallbackIconTone;
};

const iconModules = import.meta.glob('../../assets/icons/final/**/*.{png,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const iconUrls = new Map<string, string>();
const GENERIC_ABILITY_RASTER_IDS = new Set<AbilityId>(['blast', 'blast-5']);
const upgradeIconAliases: Record<string, string[]> = {
  'archer-crippling-shots': ['archer-shredding-arrows', 'archer-pinning-volley'],
  'avenger-witness': ['avenger-last-witness', 'avenger-blood-oath'],
  'beastmaster-bloodhounds': ['beastmaster-blood-in-the-water', 'beastmaster-packmasters-whistle'],
  'champion-anointed-executioner': ['champion-anointed', 'champion-executioner'],
  'druid-forest-friends': ['druid-wild-call', 'druid-wild-growth'],
  'druid-ents-visage': ['druid-thornhide', 'druid-bramble-snare'],
  'elementalist-crackling-mitosis': ['elementalist-mitosis', 'elementalist-arc-conductor'],
  'knight-dine-in-hell': ['knight-retaliate', 'knight-brace'],
  'militia-rat-behavior': ['militia-rabble-rush'],
  'necromancer-hemomancy': ['necromancer-alternate-fuel', 'necromancer-rising-tide'],
  'necromancer-explosion-corpse': ['necromancer-carrion-choir', 'necromancer-early-riser'],
  'priest-bolstering-light': ['priest-zeal', 'priest-overflowing-grace'],
  'ranger-on-the-hunt': ['ranger-concussive-shots', 'ranger-scavengers-hunger'],
  'ranger-shadows-embrace': ['ranger-heartseeker', 'ranger-skirmishers-step'],
  'shaman-grave-vigor': ['shaman-serve-once-more', 'shaman-static-charge'],
  'wizard-storm-rods': ['wizard-storm', 'wizard-lightning-rods'],
};

Object.entries(iconModules).forEach(([path, url]) => {
  const normalized = path.replace(/\\/g, '/').replace('../../assets/icons/final/', 'assets/icons/final/');
  iconUrls.set(normalized, url);
});

function iconUrl(kind: IconKind, id: string): string {
  const basePath = `assets/icons/final/${kind}/${id}`;
  return iconUrls.get(`${basePath}.png`) ?? iconUrls.get(`${basePath}.svg`) ?? '';
}

export function getAbilityIconUrl(abilityId: AbilityId): string {
  // The generated SVG set is intentionally ignored for abilities: those files are generic colored badges.
  // Ability icons should use the rule-based fallback unless a future bespoke raster asset is added.
  if (GENERIC_ABILITY_RASTER_IDS.has(abilityId)) {
    return '';
  }
  const basePath = `assets/icons/final/ability/${abilityId}`;
  return iconUrls.get(`${basePath}.png`) ?? '';
}

function abilityTone(abilityId: AbilityId): AbilityFallbackIconTone {
  const ability = ABILITIES[abilityId];
  if (!ability) {
    return 'neutral';
  }
  if (ability.effects.some((effect) => effect.kind === 'summon')) {
    return 'neutral';
  }
  if (ability.effects.some((effect) => effect.disposition === 'harmful' || effect.kind === 'blast' || effect.kind === 'redirect')) {
    return 'negative';
  }
  if (
    ability.effects.some(
      (effect) =>
        effect.disposition === 'beneficial' ||
        effect.kind === 'heal' ||
        effect.kind === 'bolster' ||
        effect.kind === 'haste' ||
        effect.kind === 'ramp' ||
        (effect.kind === 'statDelta' && effect.amount > 0),
    )
  ) {
    return 'positive';
  }
  if (ability.target?.allegiance === 'enemy') {
    return 'negative';
  }
  if (ability.target?.allegiance === 'ally' || ability.target?.mode === 'self') {
    return 'positive';
  }
  return 'neutral';
}

export function getAbilityFallbackIcon(abilityId: AbilityId): AbilityFallbackIcon {
  const ability = ABILITIES[abilityId];
  if (!ability) {
    return { shape: 'single', tone: 'neutral' };
  }
  if (ability.effects.some((effect) => effect.kind === 'summon')) {
    return { shape: 'plus', tone: 'neutral' };
  }
  if (ability.effects.some((effect) => effect.kind === 'blast' || effect.kind === 'heal')) {
    return { shape: 'heart', tone: abilityTone(abilityId) };
  }
  if (ability.target?.mode === 'self') {
    return { shape: 'self', tone: abilityTone(abilityId) };
  }
  if (ability.target?.mode === 'aoe') {
    return { shape: 'aoe', tone: abilityTone(abilityId) };
  }
  return { shape: 'single', tone: abilityTone(abilityId) };
}

export function getUpgradeIconUrl(upgradeId: UpgradeId): string {
  return (
    iconUrl('faction_upgrade', upgradeId) ||
    iconUrl('troop_type_upgrade', upgradeId) ||
    (upgradeIconAliases[upgradeId] ?? []).map((id) => iconUrl('troop_type_upgrade', id)).find(Boolean) ||
    ''
  );
}

export function getMutatorIconUrl(mutatorId: MutatorId): string {
  return iconUrl('rift_mutator', mutatorId);
}

export function getPreloadableGameIconUrls(): string[] {
  return [
    ...new Set(
      [...iconUrls.entries()]
        .filter(
          ([path]) =>
            path.includes('/rift_mutator/') ||
            ((path.includes('/faction_upgrade/') || path.includes('/troop_type_upgrade/')) && path.endsWith('.svg')),
        )
        .map(([, url]) => url)
        .filter((url) => url.length > 0),
    ),
  ];
}
