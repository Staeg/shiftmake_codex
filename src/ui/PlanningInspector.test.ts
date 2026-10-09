import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import { buildMutatorDetail } from './detailCards';
import PlanningInspector from './PlanningInspector.svelte';
import { createPlanningInspection } from './planningInspection';
import { inspectionFixture } from './__fixtures__/planningInspection';

const ServerInspector = PlanningInspector as unknown as { render(props: ComponentProps<PlanningInspector>): { html: string } };

function setup() {
  const fixture = inspectionFixture();
  const inspection = createPlanningInspection();
  const props: ComponentProps<PlanningInspector> = { inspection, centerMode: 'rifts', selectedTroop: null,
    selectedTroopDefinition: null, getRaceUnitPortrait: fixture.portrait, previewDetail: vi.fn(), togglePinnedDetail: vi.fn() };
  return { ...fixture, inspection, props };
}

describe('planning inspector', () => {
  it('renders the empty context and existing debug target without issuing commands', () => {
    const { props } = setup();
    const html = ServerInspector.render(props).html;
    expect(html).toContain('No Focus Item');
    expect(html).toContain('data-ui-name="Detail panel"');
    expect(html).toContain('Rift board');
    expect(props.previewDetail).not.toHaveBeenCalled();
    expect(props.togglePinnedDetail).not.toHaveBeenCalled();
    expect(ServerInspector.render({ ...props, centerMode: 'contest' }).html).toContain('opponent troop');
  });

  it('renders a pinned unit, summoned previews and owner-scoped ability text', () => {
    const { props, detail, inspection } = setup();
    inspection.togglePin(detail);
    inspection.toggleAbility({ label: 'Pinned Ability', description: 'Ability detail' }, detail.detailKey);
    const html = ServerInspector.render(props).html;
    expect(html).toContain('Human Beastmaster');
    expect(html).toContain('Health details');
    expect(html).toContain('Inspect summoned Wolf');
    expect(html).toContain('Pinned Ability');
    inspection.toggleAbility({ label: 'Other Ability', description: 'Wrong owner' }, 'other');
    expect(ServerInspector.render(props).html).not.toContain('Wrong owner');
  });

  it('renders two comparison units and the selected roster fallback', () => {
    const { props, detail, definition, troop, inspection } = setup();
    inspection.togglePin(detail);
    inspection.togglePin({ ...detail, detailKey: 'other', label: 'Other Beastmaster' });
    expect(ServerInspector.render(props).html).toContain('Other Beastmaster');
    inspection.reset();
    const html = ServerInspector.render({ ...props, centerMode: 'troops', selectedTroop: troop, selectedTroopDefinition: definition }).html;
    expect(html).toContain('Human Beastmaster');
    expect(html).toContain('Inspect summoned Wolf');
    expect(html).not.toContain('No Focus Item');
  });

  it('renders non-unit inspection and clears it through the shared owner', () => {
    const { props, inspection } = setup();
    inspection.replacePin(buildMutatorDetail('decay'));
    expect(ServerInspector.render(props).html).toContain('Decay');
    inspection.reset();
    expect(ServerInspector.render(props).html).toContain('No Focus Item');
  });
});
