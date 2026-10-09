import { readFileSync } from 'node:fs';
import { parse } from 'svelte/compiler';
import { describe, expect, it } from 'vitest';

const componentNames = ['OpeningUnlockScreen', 'ScheduledUnlockScreen', 'EssenceDraftPanel',
  'ArchivePanel', 'PlanningInspector', 'TroopRosterBoard', 'RivalInfoBoard',
  'RiftBoard', 'ReadyTroopsPanel', 'PlanningActionRail'];
const prefix = ':is(.overworld-surface, .overworld-shell) ';
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim();
function readRules(source: string) {
  const style = source.slice(source.indexOf('<style>'));
  return parse(style).css!.children.filter(node => node.type === 'Rule').map(rule => ({
    selectors: rule.prelude.children.map((node: { start: number; end: number }) => style.slice(node.start, node.end)),
    body: normalize(style.slice(rule.block.start, rule.block.end)),
  }));
}
const css = readFileSync('src/ui/overworldPrimitives.css', 'utf8');
const shared = readRules(`<style>${css}</style>`);
const appSource = readFileSync('src/ui/App.svelte', 'utf8');
const appRules = readRules(appSource);

describe('shared overworld primitives', () => {
  it('confines defaults to overworld surfaces and imports them exactly once', () => {
    expect(shared).toHaveLength(9);
    expect(shared.flatMap(rule => rule.selectors).every(selector => selector.startsWith(prefix))).toBe(true);
    expect(css).not.toContain('@media');
    expect(css).not.toContain('body {');
    expect(css).not.toContain('grid-template');
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main.match(/import '\.\/ui\/overworldPrimitives\.css';/g)).toHaveLength(1);
  });

  it('retains canonical declarations and primary base-before-variant ordering', () => {
    for (const rule of shared) {
      for (const selector of rule.selectors) {
        const sharedSelector = selector.slice(prefix.length);
        const originalSelector = ['.list-button', '.troop-chip', '.title-button'].includes(sharedSelector)
          ? '.primary' : sharedSelector.replace('.draft-panel', '.panel');
        expect(appRules.some(original => original.selectors.includes(originalSelector) && original.body === rule.body), originalSelector).toBe(true);
      }
    }
    const primary = shared.filter(rule => rule.selectors.includes(`${prefix}.primary`));
    expect(primary).toHaveLength(2);
    expect(primary[0]!.body).toContain('background: var(--ui-color-surface-interactive)');
    expect(primary[1]!.body).toContain('background: linear-gradient');
  });

  it('removes canonical duplicates and copied globals from extracted surfaces', () => {
    for (const name of componentNames) {
      const source = readFileSync(`src/ui/${name}.svelte`, 'utf8');
      const rules = readRules(source);
      for (const rule of shared) {
        for (const selector of rule.selectors) {
          expect(rules.some(local => local.body === rule.body && local.selectors.includes(selector.slice(prefix.length))), `${name}: ${selector}`).toBe(false);
        }
      }
      expect(source).not.toContain(':global(body)');
      expect(source).not.toContain(':global(.ui-debug-target[data-design-selected])');
    }
    expect(appSource).toContain(':global(body)');
    expect(appSource).toContain(':global(.ui-debug-target[data-design-selected])');
  });
});
