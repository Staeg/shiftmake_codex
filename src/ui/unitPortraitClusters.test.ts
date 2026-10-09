import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'svelte/compiler';
import { unitIconDensityClass } from './detailCards';

const css = readFileSync('src/ui/unitPortraitClusters.css', 'utf8');
const source = `<style>${css}</style>`;
const rules = parse(source).css!.children.filter(node => node.type === 'Rule');
const selectors: string[] = rules.flatMap(rule => rule.prelude.children.map((selector: { start: number; end: number }) => source.slice(selector.start, selector.end)));

describe('shared overworld portrait styles', () => {
  it('keeps every selector inside the overworld surface with no duplicate rules', () => {
    expect(selectors.length).toBeGreaterThan(100);
    expect(selectors.every(selector => selector.startsWith(':is(.overworld-surface, .overworld-shell) '))).toBe(true);
    expect(new Set(selectors).size).toBe(selectors.length);
  });

  it('covers every helper density for board, roster and inspector clusters', () => {
    for (const quantity of [1, 2, 5, 7, 10, 13, 24]) {
      for (const kind of ['tile', 'chip', 'detail']) {
        expect(selectors).toContain(`:is(.overworld-surface, .overworld-shell) .unit-icon-cluster.${kind}-unit-cluster.${unitIconDensityClass(quantity)}`);
      }
    }
    for (const [kind, art] of [['tile', 'unit-tile-art'], ['chip', 'unit-button-art'], ['detail', 'hover-unit-art']]) {
      for (let copy = 2; copy <= 24; copy++) {
        expect(selectors).toContain(`:is(.overworld-surface, .overworld-shell) .unit-icon-cluster.${kind}-unit-cluster.density-24 .${art}:nth-child(${copy})`);
      }
    }
  });

  it('retains foreground and background layering without owning surface layout', () => {
    expect(css).toContain('--unit-cluster-hero-size: 76%');
    expect(css).toContain('--unit-cluster-bg-size: 23%');
    expect(css).toContain('z-index: 5');
    expect(css).toContain('transform: translate(-50%, -50%)');
    for (const [kind, art] of [['tile', 'unit-tile-art'], ['chip', 'unit-button-art'], ['detail', 'hover-unit-art']]) {
      // The common class keeps hero rules above retained Svelte-scoped base rules.
      expect(selectors).toContain(`:is(.overworld-surface, .overworld-shell) .unit-icon-cluster.${kind}-unit-cluster .${art}:first-child`);
    }
    expect(css).not.toContain('grid-template-columns');
    expect(css).not.toContain('@media');
  });
});
