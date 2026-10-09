import { get } from 'svelte/store';
import { describe, expect, it } from 'vitest';
import { buildMutatorDetail } from './detailCards';
import { createPlanningInspection, planningAbilityTooltipFor } from './planningInspection';
import { inspectionFixture } from './__fixtures__/planningInspection';

describe('shared planning inspection', () => {
  it('shows hover, retains the first pin and previews a distinct second unit', () => {
    const inspection = createPlanningInspection();
    const { detail } = inspectionFixture();
    const other = { ...detail, detailKey: 'enemy:other' };
    inspection.preview(detail);
    expect(get(inspection).primary).toBe(detail);
    inspection.togglePin(detail);
    inspection.preview(other);
    expect(get(inspection)).toMatchObject({ primary: detail, secondary: other });
    expect([...get(inspection).highlightedKeys]).toEqual([detail.detailKey, other.detailKey]);
    inspection.clearPreview();
    expect(get(inspection)).toMatchObject({ primary: detail, secondary: null, hovered: null });
    inspection.preview(detail);
    expect(get(inspection).secondary).toBeNull();
  });

  it('caps pins at two, suppresses a third unit hover and toggles each pin by key', () => {
    const inspection = createPlanningInspection();
    const { detail } = inspectionFixture();
    const second = { ...detail, detailKey: 'second' };
    const third = { ...detail, detailKey: 'third' };
    inspection.togglePin(detail);
    inspection.togglePin(second);
    expect(inspection.preview(third)).toBe(false);
    expect(get(inspection).hovered).toBeNull();
    inspection.togglePin(third);
    expect(get(inspection).pinned).toEqual([detail, third]);
    inspection.togglePin({ ...third });
    expect(get(inspection).pinned).toEqual([detail]);
    inspection.togglePin(detail);
    expect(get(inspection).primary).toBeNull();
  });

  it('allows non-unit previews while two units are pinned without replacing the comparison', () => {
    const inspection = createPlanningInspection();
    const { detail } = inspectionFixture();
    const other = { ...detail, detailKey: 'other' };
    inspection.togglePin(detail);
    inspection.togglePin(other);
    const mutator = buildMutatorDetail('decay');
    expect(inspection.preview(mutator)).toBe(true);
    expect(get(inspection)).toMatchObject({ primary: detail, secondary: other, hovered: mutator });
  });

  it('scopes tooltips by owner and gives pinned abilities precedence over hover', () => {
    const inspection = createPlanningInspection();
    const ability = { label: 'Ability', description: 'Description' };
    inspection.showAbility(ability, 'a');
    expect(planningAbilityTooltipFor(get(inspection), 'a')?.description).toBe('Description');
    expect(planningAbilityTooltipFor(get(inspection), 'b')).toBeNull();
    inspection.toggleAbility(ability, 'a');
    inspection.showAbility({ label: 'Other', description: 'Other description' }, 'b');
    expect(planningAbilityTooltipFor(get(inspection), 'a')?.label).toBe('Ability');
    expect(planningAbilityTooltipFor(get(inspection), 'b')).toBeNull();
    inspection.toggleAbility(ability, 'a');
    expect(get(inspection)).toMatchObject({ pinnedAbility: null, hoveredAbility: null });
    inspection.toggleAbility(ability, 'b');
    expect(planningAbilityTooltipFor(get(inspection), 'b')?.label).toBe('Ability');
  });

  it('resets ability state when pins change, and replaces draft inspection atomically', () => {
    const inspection = createPlanningInspection();
    const { detail } = inspectionFixture();
    const ability = { label: 'Ability', description: 'Description' };
    inspection.toggleAbility(ability, detail.detailKey);
    inspection.togglePin(detail);
    expect(get(inspection).pinnedAbility).toBeNull();
    inspection.preview({ ...detail, detailKey: 'other' });
    inspection.showAbility(ability, 'other');
    inspection.replacePin(detail);
    expect(get(inspection)).toMatchObject({ pinned: [detail], hovered: null, hoveredAbility: null, pinnedAbility: null });
    inspection.replacePin(null);
    expect(get(inspection).primary).toBeNull();
  });

  it('retains pins when hover clears and fully resets on scene/context changes', () => {
    const inspection = createPlanningInspection();
    const { detail } = inspectionFixture();
    const ability = { label: 'Ability', description: 'Description' };
    inspection.togglePin(detail);
    inspection.toggleAbility(ability, detail.detailKey);
    inspection.showAbility(ability, detail.detailKey);
    inspection.clearPreview();
    expect(get(inspection)).toMatchObject({ pinned: [detail], hoveredAbility: null });
    expect(get(inspection).pinnedAbility?.label).toBe('Ability');
    inspection.clearDetails();
    expect(get(inspection).primary).toBeNull();
    inspection.reset();
    expect(get(inspection)).toMatchObject({ pinned: [], hovered: null, primary: null, secondary: null,
      hoveredAbility: null, pinnedAbility: null });
    expect(get(inspection).highlightedKeys.size).toBe(0);
  });
});
