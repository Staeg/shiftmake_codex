import type { AbilityDefinition, AbilityEffectDefinition, AbilityTargetDefinition, AbilityTiming, ExplainedStatKey, RoleId } from '../engine/types';

export const STAT_ICONS: Record<ExplainedStatKey, string> = {
  health: '❤️',
  damage: '⚔️',
  speed: '⚡',
  range: '🏹',
  armor: '🛡️',
  capacity: '🧲',
  size: '🐘',
};
export const QUANTITY_ICON = '⌗';

export function statIcon(key: ExplainedStatKey): string {
  return STAT_ICONS[key];
}

export function displayIcon(key: ExplainedStatKey | 'quantity'): string {
  return key === 'quantity' ? QUANTITY_ICON : statIcon(key);
}

export function replaceStatWordsWithIcons(text: string): string {
  return text
    .replace(/\bhealth\b/gi, STAT_ICONS.health)
    .replace(/\bdamage\b/gi, STAT_ICONS.damage)
    .replace(/\bspeed\b/gi, STAT_ICONS.speed)
    .replace(/\brange\b/gi, STAT_ICONS.range)
    .replace(/\barmor\b/gi, STAT_ICONS.armor)
    .replace(/\bcapacity\b/gi, STAT_ICONS.capacity)
    .replace(/\bsize\b/gi, STAT_ICONS.size)
    .replace(/\bquantity\b/gi, QUANTITY_ICON);
}

function timingLabel(timing: AbilityTiming): string {
  return {
    startOfBattle: 'Start of battle',
    startOfTurn: 'Start of turn',
    endOfTurn: 'End of turn',
    onAttack: 'On attack',
    onKill: 'On kill',
    onDeath: 'On death',
    onDamaged: 'On damaged',
    onFallen: 'On nearby death',
    onEffectApplied: 'On applied effect',
    passive: 'Passive',
  }[timing];
}

function targetLabel(target?: AbilityTargetDefinition): string {
  if (!target) {
    return 'default target rules';
  }

  const radiusLabel = target.radiusSource === 'selfRange' ? 'R' : `${target.radius ?? 0}`;

  const base =
    target.mode === 'self'
      ? 'self'
      : target.mode === 'random'
        ? `random ${target.allegiance ?? 'all'} target`
        : target.mode === 'aoe'
          ? `${target.allegiance ?? 'all'} units in radius ${radiusLabel}`
          : `${target.allegiance ?? 'default'} target`;

  const parts = [base];
  if ((target.radiusSource === 'selfRange' || target.radius) && target.mode !== 'aoe') {
    parts.push(`within ${radiusLabel} hexes`);
  }
  if (target.filters?.notTypes?.length) {
    parts.push(`excluding ${target.filters.notTypes.join(', ')}`);
  }
  if (target.filters?.onlyTypes?.length) {
    parts.push(`only ${target.filters.onlyTypes.join(', ')}`);
  }
  if (target.filters?.prioritizeTypes?.length) {
    parts.push(`prioritizes ${target.filters.prioritizeTypes.join(', ')}`);
  }
  if (target.filters?.unengaged) {
    parts.push('only unengaged');
  }
  return parts.join(', ');
}

function effectLabel(effect: AbilityEffectDefinition): string {
  if (effect.kind === 'bolster') return `${effect.amount > 0 ? '+' : ''}${effect.amount} ${statIcon('health')}`;
  if (effect.kind === 'haste') return `${effect.amount > 0 ? '+' : ''}${effect.amount} ${statIcon('speed')}`;
  if (effect.kind === 'ramp') return `${effect.amount > 0 ? '+' : ''}${effect.amount} ${statIcon('damage')}`;
  if (effect.kind === 'heal') return `heal ${effect.amount} ${statIcon('health')}`;
  if (effect.kind === 'statDelta') return `${effect.amount > 0 ? '+' : ''}${effect.amount} ${statIcon(effect.stat)}`;
  if (effect.kind === 'rangeset') return `set ${statIcon('range')} to ${effect.value}`;
  if (effect.kind === 'roleset') return `become ${effect.role}`;
  if (effect.kind === 'initiativeSet') return `set initiative to ${effect.value}`;
  if (effect.kind === 'grantAbility') return `grant ${effect.abilityId}`;
  if (effect.kind === 'blast') return `${effect.amount} blast damage`;
  if (effect.kind === 'strike') return `${effect.amount} extra strikes`;
  if (effect.kind === 'summon') {
    const article = /^[aeiou]/i.test(effect.unitTypeId) ? 'an' : 'a';
    const unitLabel = effect.unitTypeId.replace(/-/g, ' ');
    const corpseClause = effect.consumeFallenUnitCorpse ? ' by consuming a corpse' : '';
    return `summon ${effect.count} ${effect.count === 1 ? `${article} ${unitLabel}` : `${unitLabel}s`}${corpseClause}`;
  }
  return `error 404: unknown ability effect "${String((effect as { kind?: string }).kind ?? 'missing-kind')}"`;
}

function durationLabel(ability: AbilityDefinition): string {
  if (ability.duration.kind === 'instant') return 'instant';
  if (ability.duration.kind === 'battle') return 'for the battle';
  return `for ${ability.duration.turns} turn${ability.duration.turns === 1 ? '' : 's'}`;
}

export function formatAbilityExact(ability: AbilityDefinition): string {
  const trigger = timingLabel(ability.trigger.timing);
  const target = targetLabel(ability.target);
  const effects = ability.effects.map(effectLabel).join(' and ');
  const duration = durationLabel(ability);
  return `${trigger}. Target: ${target}. Effect: ${effects} ${duration}.`;
}

export function formatRoleExact(role: RoleId): string {
  return {
    frontline:
      'Frontline units block access to allied backline, engage first, and spill into enemy backline when the lane opens.',
    chaff: 'Chaff units spill into enemy backline whenever possible and stay committed there once they break through.',
    backline: 'Backline units attack from range and preserve distance when geometry allows instead of holding a crowded hex.',
  }[role];
}
