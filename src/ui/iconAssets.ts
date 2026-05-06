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
  return iconUrl('faction_upgrade', upgradeId) || iconUrl('troop_type_upgrade', upgradeId);
}

export function getMutatorIconUrl(mutatorId: MutatorId): string {
  return iconUrl('rift_mutator', mutatorId);
}
