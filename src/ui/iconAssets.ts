import type { AbilityId, MutatorId, UpgradeId } from '../engine/types';
import { ABILITIES } from '../engine/unitCatalog';

type IconKind = 'ability' | 'faction_upgrade' | 'troop_type_upgrade' | 'rift_mutator';
type IconEffectKind = 'blast' | 'bolster' | 'haste' | 'heal' | 'ramp' | 'strike' | 'summon' | 'redirect';

const effectIconCandidates: Partial<Record<IconEffectKind, string[]>> = {
  blast: ['blast', 'blast-5'],
  bolster: ['bolster'],
  haste: ['haste', 'haste-1'],
  heal: ['heal', 'mend-4', 'regen-5'],
  ramp: ['ramp', 'ramp-1'],
  strike: ['strike'],
  summon: ['summon'],
  redirect: ['redirect', 'taunt'],
};

const iconModules = import.meta.glob('../../assets/icons/final/**/*.{png,svg}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const iconUrls = new Map<string, string>();
const upgradeIconAliases: Record<string, string[]> = {
  'archer-crippling-shots': ['archer-shredding-arrows', 'archer-pinning-volley'],
  'avenger-witness': ['avenger-last-witness', 'avenger-blood-oath'],
  'beastmaster-bloodhounds': ['beastmaster-blood-in-the-water', 'beastmaster-packmasters-whistle'],
  'champion-anointed-executioner': ['champion-anointed', 'champion-executioner'],
  'druid-forest-friends': ['druid-wild-call', 'druid-wild-growth'],
  'druid-ents-visage': ['druid-thornhide', 'druid-bramble-snare'],
  'elementalist-crackling-mitosis': ['elementalist-mitosis', 'elementalist-arc-conductor'],
  'knight-dine-in-hell': ['knight-retaliate', 'knight-brace'],
  'militia-rat-behavior': ['militia-scurry', 'militia-rabble-rush'],
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

function abilityBaseIconCandidates(abilityId: AbilityId): string[] {
  const ability = ABILITIES[abilityId];
  if (!ability) {
    return [];
  }

  return [
    ...new Set(
      ability.effects.flatMap((effect) => {
        const candidates = effectIconCandidates[effect.kind as IconEffectKind] ?? [];
        return candidates.filter((candidateId) => candidateId !== abilityId);
      }),
    ),
  ];
}

export function getAbilityIconUrl(abilityId: AbilityId): string {
  return iconUrl('ability', abilityId) || abilityBaseIconCandidates(abilityId).map((id) => iconUrl('ability', id)).find(Boolean) || '';
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
