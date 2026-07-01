<script lang="ts">
  import { formatFixed } from '../engine/fixed';
  import type { StatBreakdown } from '../engine/types';
  import { replaceStatWordsWithIcons } from './inspectText';

  export let stats: Array<{
    key: string;
    label: string;
    name?: string;
    description?: string;
    value: string;
    breakdown: StatBreakdown | null;
    action?: {
      label: string;
      cost: string;
      disabled?: boolean;
      onClick?: () => void;
      onMouseEnter?: () => void;
      onMouseLeave?: () => void;
    };
  }> = [];

  export let columns = 3;
  export let compact = false;
  export let onHoverStat: ((key: string) => void) | null = null;

  let hoveredKey: string | null = null;
  let tooltipStyle = '';

  const STAT_FALLBACKS: Record<string, { name: string; description: string }> = {
    health: { name: 'Health', description: 'How much punishment each unit can take before falling.' },
    damage: { name: 'Damage', description: 'How much harm each attack deals before armor and other effects.' },
    rate: { name: 'Rate', description: 'How quickly the unit gains readiness and takes turns.' },
    move: { name: 'Move', description: 'How many hexes this unit can travel during ordinary movement and special repositioning.' },
    range: { name: 'Range', description: 'How many hexes away the unit can attack from.' },
    armor: { name: 'Armor', description: 'Flat damage reduction applied when the unit is hit.' },
    capacity: { name: 'Capacity', description: 'How many enemies this unit can hold in melee engagement.' },
    size: { name: 'Size', description: 'How much space each unit occupies on the battlefield.' },
    quantity: { name: 'Quantity', description: 'How many bodies are in this troop group.' },
  };

  function formatLineValue(kind: StatBreakdown['lines'][number]['kind'], value: number): string {
    if (kind === 'base') {
      return formatFixed(value);
    }
    if (kind === 'set') {
      return `= ${formatFixed(value)}`;
    }
    return `${value > 0 ? '+' : ''}${formatFixed(value)}`;
  }

  function openTooltip(stat: (typeof stats)[number], target: EventTarget | null): void {
    if (!(target instanceof HTMLElement)) {
      hoveredKey = null;
      return;
    }

    hoveredKey = stat.key;
    onHoverStat?.(stat.key);
    const width = Math.min(220, Math.max(180, window.innerWidth - 24));
    const estimatedHeight = 96 + (stat.breakdown?.lines.length ?? 0) * 26;
    const rect = target.getBoundingClientRect();
    const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12));
    const prefersAbove = rect.bottom + 10 + estimatedHeight > window.innerHeight && rect.top - 10 - estimatedHeight > 12;
    const top = prefersAbove ? Math.max(12, rect.top - estimatedHeight - 10) : Math.min(rect.bottom + 10, window.innerHeight - estimatedHeight - 12);

    tooltipStyle = `left:${left}px; top:${top}px; width:${width}px;`;
  }

  function handleKeydown(event: KeyboardEvent, stat: (typeof stats)[number]): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openTooltip(stat, event.currentTarget);
    }
  }

  function statName(stat: (typeof stats)[number]): string {
    return stat.name ?? STAT_FALLBACKS[stat.key]?.name ?? stat.label;
  }

  function statDescription(stat: (typeof stats)[number]): string {
    return stat.description ?? STAT_FALLBACKS[stat.key]?.description ?? 'A combat statistic used by the battle resolver.';
  }
</script>

<div class="stats-grid" class:compact style={`--stat-columns:${columns};`}>
  {#each stats as stat}
    <div class="stat-card">
      <button
        type="button"
        class="stat-main inspectable"
        aria-label={`${statName(stat)} details`}
        on:mouseenter={(event) => openTooltip(stat, event.currentTarget)}
        on:focus={(event) => openTooltip(stat, event.currentTarget)}
        on:keydown={(event) => handleKeydown(event, stat)}
        on:mouseleave={() => (hoveredKey = null)}
        on:blur={() => (hoveredKey = null)}
      >
        <span class="stat-head">
          <span>{stat.label}</span>
          <span class="stat-values">
            <strong>{stat.value}</strong>
          </span>
        </span>
      </button>
      {#if stat.action}
        <button
          type="button"
          class="stat-action"
          disabled={stat.action.disabled}
          on:click={() => stat.action?.onClick?.()}
          on:mouseenter={() => stat.action?.onMouseEnter?.()}
          on:focus={() => stat.action?.onMouseEnter?.()}
          on:mouseleave={() => stat.action?.onMouseLeave?.()}
          on:blur={() => stat.action?.onMouseLeave?.()}
        >
          <span class="stat-action-row">
            <span class="stat-action-plus">{stat.action.label}</span>
            <small><i class="resource-icon gold"></i>{stat.action.cost}</small>
          </span>
        </button>
      {/if}

      {#if stat.breakdown && hoveredKey === stat.key}
        <span class="stat-breakdown-tooltip" style={tooltipStyle}>
          <span class="tooltip-header">
            <strong>{statName(stat)}</strong>
            <span class="tooltip-total">{formatFixed(stat.breakdown.finalValue)}</span>
          </span>
          <span class="tooltip-description">{statDescription(stat)}</span>
          <span class="breakdown-lines">
            {#each stat.breakdown.lines as line}
              <span class="breakdown-line">
                <span class="breakdown-label">{replaceStatWordsWithIcons(line.label)}</span>
                <strong>{formatLineValue(line.kind, line.value)}</strong>
              </span>
            {/each}
          </span>
        </span>
      {:else if hoveredKey === stat.key}
        <span class="stat-breakdown-tooltip" style={tooltipStyle}>
          <span class="tooltip-header">
            <strong>{statName(stat)}</strong>
            <span class="tooltip-total">{stat.value}</span>
          </span>
          <span class="tooltip-description">{statDescription(stat)}</span>
        </span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(var(--stat-columns, 3), minmax(0, 1fr));
    gap: 0.38rem;
    container-type: inline-size;
  }

  .stat-card {
    position: relative;
    display: grid;
    align-content: start;
    gap: 0.15rem;
    padding: 0.45rem 0.55rem;
    border: 1px solid rgba(124, 153, 176, 0.15);
    border-radius: 12px;
    background: rgba(20, 28, 38, 0.7);
    outline: none;
    width: 100%;
    color: inherit;
    font: inherit;
    text-align: left;
    min-width: 0;
    overflow: hidden;
  }

  .stats-grid.compact {
    display: grid;
    grid-template-columns: repeat(var(--stat-columns, 3), minmax(0, 1fr));
    align-items: center;
    gap: 0.12rem 0.28rem;
    min-width: 0;
  }

  .stats-grid.compact .stat-card {
    min-width: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    overflow: visible;
  }

  .stats-grid.compact .stat-main.inspectable {
    width: 100%;
    min-height: 1.08rem;
    display: grid;
    place-items: center;
  }

  .stats-grid.compact .stat-head {
    gap: 0.16rem;
  }

  .stats-grid.compact .stat-main > span {
    font-size: 0.66rem;
  }

  .stats-grid.compact .stat-values > strong {
    font-size: 0.82rem;
  }

  .stat-main {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  .stat-head {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    min-width: 0;
    text-align: center;
  }

  .stat-main.inspectable {
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: help;
  }

  .stat-main.inspectable:hover,
  .stat-main.inspectable:focus-visible {
    color: #fff6e5;
  }

  .stat-main > span {
    color: #93a9bc;
    font-size: 0.7rem;
  }

  .stat-head > span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: clip;
    white-space: nowrap;
  }

  .stat-values {
    display: inline-flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.25rem;
    min-width: 0;
    white-space: nowrap;
  }

  .stat-values > strong {
    font-size: 0.95rem;
    line-height: 1;
    min-width: 0;
  }

  @container (max-width: 520px) {
    .stats-grid {
      gap: 0.35rem;
    }

    .stat-card {
      padding: 0.38rem 0.42rem;
    }

    .stat-head,
    .stat-values {
      gap: 0.18rem;
    }

    .stat-main > span {
      font-size: 0.64rem;
    }

    .stat-values > strong {
      font-size: clamp(0.72rem, 16cqw, 0.92rem);
    }
  }

  .stat-action {
    margin-top: 0.15rem;
    display: flex;
    align-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  .stat-action:disabled {
    opacity: 0.7;
  }

  .stat-action-row {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .stat-action-plus {
    color: #69d26b;
    font-size: 1rem;
    font-weight: 700;
    line-height: 1;
  }

  .stat-action small {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: #d7c8a4;
    font-size: 0.68rem;
    line-height: 1;
  }

  .stat-action .resource-icon {
    display: inline-block;
    width: 0.78rem;
    height: 0.78rem;
    border-radius: 999px;
    background: radial-gradient(circle at 35% 35%, #fff2a8, #f3cc63 58%, #b8871d 100%);
    box-shadow: 0 0 0 1px rgba(255, 218, 117, 0.2);
  }

  .stat-breakdown-tooltip {
    position: fixed;
    z-index: 4;
    display: grid;
    gap: 0.55rem;
    padding: 0.75rem 0.8rem;
    border-radius: 16px;
    border: 1px solid rgba(212, 173, 115, 0.28);
    background:
      linear-gradient(160deg, rgba(17, 25, 35, 0.98), rgba(8, 12, 19, 0.98)),
      radial-gradient(circle at top left, rgba(212, 173, 115, 0.12), transparent 44%);
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.34);
  }

  .tooltip-header,
  .breakdown-line {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .tooltip-description {
    color: #a7b8c8;
    font-size: 0.74rem;
    line-height: 1.35;
  }

  .tooltip-total,
  .breakdown-label {
    color: #c6d5e1;
    font-size: 0.78rem;
  }

  .breakdown-lines {
    display: grid;
    gap: 0.35rem;
  }

  .breakdown-lines strong {
    white-space: nowrap;
  }
</style>
