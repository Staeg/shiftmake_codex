import { describe, expect, it } from 'vitest';
import { getAbilityFallbackIcon, getAbilityIconUrl } from '../presentation/iconAssets';

describe('ability icon fallback rules', () => {
  it('uses rule-based icons instead of generated placeholder SVGs', () => {
    expect(getAbilityIconUrl('valor-20')).toBe('');
    expect(getAbilityFallbackIcon('valor-20')).toEqual({ shape: 'heart', tone: 'positive' });

    expect(getAbilityIconUrl('self-haste-2')).toBe('');
    expect(getAbilityFallbackIcon('self-haste-2')).toEqual({ shape: 'self', tone: 'positive' });

    expect(getAbilityIconUrl('regen-5')).toBe('');
    expect(getAbilityFallbackIcon('regen-5')).toEqual({ shape: 'heart', tone: 'positive' });
  });

  it('groups damage, single-target, area, and summon effects by shape and tone', () => {
    expect(getAbilityFallbackIcon('blast-5')).toEqual({ shape: 'heart', tone: 'negative' });
    expect(getAbilityFallbackIcon('shredding-arrows')).toEqual({ shape: 'single', tone: 'negative' });
    expect(getAbilityFallbackIcon('taunt')).toEqual({ shape: 'aoe', tone: 'negative' });
    expect(getAbilityFallbackIcon('summon-wolf-2')).toEqual({ shape: 'plus', tone: 'neutral' });
  });
});
