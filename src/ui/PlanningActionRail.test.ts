import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import PlanningActionRail from './PlanningActionRail.svelte';

const Rail = PlanningActionRail as unknown as { render(props: ComponentProps<PlanningActionRail>): { html: string } };
function setup(): ComponentProps<PlanningActionRail> {
  return { empty: false,
    cycle: { visible: true, label: 'End Cycle', blocked: false, disabled: false,
      tooltip: null, hovered: false, enter: vi.fn(), leave: vi.fn(), submit: vi.fn() },
    notice: { message: null, unspentEssence: false, dismiss: vi.fn(), focusEssence: vi.fn() } };
}

describe('planning action rail', () => {
  it('renders supplied cycle state and preserved tutorial targets without invoking commands', () => {
    const props = setup();
    const html = Rail.render(props).html;
    expect(html).toContain('data-tutorial-target="end-cycle-button"');
    expect(html).toContain('End Cycle');
    expect(html).not.toContain('end-cycle-tooltip');
    expect(props.cycle.submit).not.toHaveBeenCalled();
    expect(props.cycle.enter).not.toHaveBeenCalled();
    expect(props.notice.dismiss).not.toHaveBeenCalled();
  });

  it('distinguishes blocked eligibility from disabled submission and shows authoritative guidance', () => {
    const props = setup();
    const blocked = Rail.render({ ...props, cycle: { ...props.cycle, blocked: true,
      tooltip: 'Finish the draft.' } }).html;
    expect(blocked).toContain('aria-disabled="true"');
    expect(blocked).toContain('aria-describedby="end-cycle-tooltip"');
    expect(blocked).toContain('Finish the draft.');
    expect(blocked).toMatch(/end-cycle-tooltip[^"\n]*visible/);
    const resolving = Rail.render({ ...props, cycle: { ...props.cycle,
      label: 'Resolving...', disabled: true } }).html;
    expect(resolving).toContain('Resolving...');
    expect(resolving).toMatch(/<button[^>]*disabled/);
  });

  it('renders notice actions only when the caller supplies the corresponding notice state', () => {
    const props = setup();
    const notice = { ...props.notice, message: 'Unspent Essence remains.', unspentEssence: true };
    const html = Rail.render({ ...props, notice }).html;
    expect(html).toContain('Dismiss system message');
    expect(html).toContain('Spend Essence');
    expect(html).toContain('Unspent Essence remains.');
    expect(notice.focusEssence).not.toHaveBeenCalled();
    expect(Rail.render({ ...props, notice: { ...notice, unspentEssence: false } }).html).not.toContain('Spend Essence');
  });

  it('does not manufacture controls outside planning or in an empty rail', () => {
    const props = setup();
    const html = Rail.render({ ...props, empty: true, cycle: { ...props.cycle, visible: false } }).html;
    expect(html).toContain('empty-action-rail');
    expect(html).not.toContain('<button');
  });
});
