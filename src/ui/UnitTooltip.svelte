<script lang="ts">
  import { tick } from 'svelte';
  import { BASIC_UNIT_TYPES } from '../engine/unitCatalog';
  import type { BattleUnit } from '../engine/types';

  export let unit: BattleUnit;
  export let engagedUnits: BattleUnit[] = [];
  export let x = 0;
  export let y = 0;
  export let locked = false;
  export let docked = false;

  let showRoleDetail = false;
  let roleButtonEl: HTMLButtonElement | null = null;
  let rolePopoverEl: HTMLDivElement | null = null;
  let rolePopoverStyle = '';

  const ROLE_DETAILS: Record<string, string> = {
    frontline: 'Draw attention when possible. If none are available, it overruns toward Frontline/Chaff targets.',
    chaff: 'If no non-engaged enemies share its hex, it pursues Backline. Otherwise, it piles on nearby enemies.',
    backline: 'Retreats if enemies share its hex. Otherwise shoots enemies in range, or advances carefully.',
  };

  const POPUP_GAP = 10;
  const VIEWPORT_PAD = 8;

  type Placement = 'bottom' | 'left' | 'right' | 'top';

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function candidatePosition(
    placement: Placement,
    anchor: DOMRect,
    popup: DOMRect,
  ): { left: number; top: number } {
    if (placement === 'left') {
      return {
        left: anchor.left - popup.width - POPUP_GAP,
        top: anchor.top + anchor.height / 2 - popup.height / 2,
      };
    }

    if (placement === 'right') {
      return {
        left: anchor.right + POPUP_GAP,
        top: anchor.top + anchor.height / 2 - popup.height / 2,
      };
    }

    if (placement === 'top') {
      return {
        left: anchor.left + anchor.width / 2 - popup.width / 2,
        top: anchor.top - popup.height - POPUP_GAP,
      };
    }

    return {
      left: anchor.left + anchor.width / 2 - popup.width / 2,
      top: anchor.bottom + POPUP_GAP,
    };
  }

  function fullyFits(left: number, top: number, popup: DOMRect): boolean {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return (
      left >= VIEWPORT_PAD &&
      top >= VIEWPORT_PAD &&
      left + popup.width <= vw - VIEWPORT_PAD &&
      top + popup.height <= vh - VIEWPORT_PAD
    );
  }

  function visibleScore(left: number, top: number, popup: DOMRect): number {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const x1 = Math.max(VIEWPORT_PAD, left);
    const y1 = Math.max(VIEWPORT_PAD, top);
    const x2 = Math.min(vw - VIEWPORT_PAD, left + popup.width);
    const y2 = Math.min(vh - VIEWPORT_PAD, top + popup.height);

    const width = Math.max(0, x2 - x1);
    const height = Math.max(0, y2 - y1);
    return width * height;
  }

  function updateRolePopoverPosition(): void {
    if (!showRoleDetail || !roleButtonEl || !rolePopoverEl) {
      return;
    }

    const anchor = roleButtonEl.getBoundingClientRect();
    const popup = rolePopoverEl.getBoundingClientRect();

    const preferredOrder: Placement[] = ['bottom', 'left', 'right', 'top'];

    let chosen = candidatePosition(preferredOrder[0], anchor, popup);

    for (const placement of preferredOrder) {
      const position = candidatePosition(placement, anchor, popup);
      if (fullyFits(position.left, position.top, popup)) {
        chosen = position;
        rolePopoverStyle = `left:${Math.round(chosen.left)}px; top:${Math.round(chosen.top)}px;`;
        return;
      }
    }

    const best = preferredOrder
      .map((placement) => {
        const position = candidatePosition(placement, anchor, popup);
        return {
          position,
          score: visibleScore(position.left, position.top, popup),
        };
      })
      .sort((a, b) => b.score - a.score)[0];

    if (best) {
      chosen = best.position;
    }

    const clampedLeft = clamp(chosen.left, VIEWPORT_PAD, window.innerWidth - popup.width - VIEWPORT_PAD);
    const clampedTop = clamp(chosen.top, VIEWPORT_PAD, window.innerHeight - popup.height - VIEWPORT_PAD);
    rolePopoverStyle = `left:${Math.round(clampedLeft)}px; top:${Math.round(clampedTop)}px;`;
  }

  function handleRoleEnter(): void {
    if (!locked) {
      return;
    }
    showRoleDetail = true;
  }

  function handleRoleLeave(): void {
    showRoleDetail = false;
  }

  function refreshRolePopup(): void {
    updateRolePopoverPosition();
  }

  $: archetype = BASIC_UNIT_TYPES[unit.typeId];

  $: if (locked && showRoleDetail) {
    tick().then(updateRolePopoverPosition);
  }

  $: if (!locked) {
    showRoleDetail = false;
  }

  $: if (showRoleDetail) {
    window.addEventListener('resize', refreshRolePopup);
  } else {
    window.removeEventListener('resize', refreshRolePopup);
  }
</script>

<aside class="tooltip" class:docked={docked} style={docked ? '' : `left:${x + 14}px; top:${y - 10}px;`}>
  <header>
    <strong>{archetype.label}</strong>
    <small>{unit.id}</small>
  </header>

  <div class="rows">
    <div><span>Health</span><b>{Math.max(0, Math.floor(unit.hp))}/{archetype.stats.health}</b></div>
    <div><span>Damage</span><b>{archetype.stats.damage}</b></div>
    <div><span>Armor</span><b>{archetype.stats.armor}</b></div>
    <div><span>Speed</span><b>{archetype.stats.speed}</b></div>
    <div><span>Range</span><b>{archetype.stats.range}</b></div>
    <div><span>Size/Cap</span><b>{archetype.stats.size}/{archetype.stats.capacity}</b></div>
  </div>

  <div class="meta">
    <span>Types: {archetype.types.join(', ')}</span>
    <button
      type="button"
      class="role-button"
      class:role-chip={locked}
      disabled={!locked}
      bind:this={roleButtonEl}
      on:mouseenter={handleRoleEnter}
      on:mouseleave={handleRoleLeave}
    >
      Role: {archetype.role}
    </button>
  </div>

  <div class="engaged">
    <span>Engaged With ({engagedUnits.length})</span>
    {#if engagedUnits.length === 0}
      <small>None</small>
    {:else}
      <ul>
        {#each engagedUnits as other}
          <li>{BASIC_UNIT_TYPES[other.typeId].label} ({other.id})</li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if locked}
    <footer>Locked selection (click unit again to unlock)</footer>
  {/if}
</aside>

{#if locked && showRoleDetail}
  <div class="role-popover" bind:this={rolePopoverEl} style={rolePopoverStyle}>
    {ROLE_DETAILS[archetype.role]}
  </div>
{/if}

<style>
  .tooltip {
    position: absolute;
    width: 280px;
    background: rgba(10, 15, 24, 0.96);
    border: 1px solid #3c5269;
    border-radius: 10px;
    padding: 0.55rem;
    color: #ecf2f9;
    z-index: 5;
    pointer-events: auto;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
  }

  .tooltip.docked {
    position: relative;
    width: 100%;
    left: auto;
    top: auto;
    z-index: 1;
    box-shadow: none;
    background: linear-gradient(145deg, rgba(20, 24, 32, 0.95), rgba(11, 13, 18, 0.95));
    border-color: #2f3b49;
  }

  .role-popover {
    position: fixed;
    z-index: 20;
    max-width: 280px;
    background: rgba(8, 14, 22, 0.98);
    border: 1px solid #4d6c8f;
    border-radius: 7px;
    padding: 0.42rem 0.5rem;
    font-size: 0.74rem;
    color: #d4e4f3;
    line-height: 1.3;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.45);
    pointer-events: auto;
  }

  header {
    display: grid;
    margin-bottom: 0.45rem;
  }

  header small {
    color: #90a2b4;
    font-size: 0.72rem;
  }

  .rows {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.28rem 0.45rem;
    margin-bottom: 0.45rem;
  }

  .rows div {
    display: flex;
    justify-content: space-between;
    background: rgba(22, 32, 44, 0.65);
    border: 1px solid #2f4155;
    border-radius: 6px;
    padding: 0.2rem 0.35rem;
    font-size: 0.78rem;
  }

  .meta {
    display: grid;
    gap: 0.2rem;
    color: #bfccd8;
    font-size: 0.75rem;
    margin-bottom: 0.35rem;
  }

  .role-button {
    all: unset;
    color: inherit;
    width: fit-content;
  }

  .role-chip {
    border-bottom: 1px dashed #9dc0e8;
    cursor: help;
  }

  .engaged {
    border-top: 1px solid #28384a;
    padding-top: 0.35rem;
    display: grid;
    gap: 0.2rem;
    font-size: 0.75rem;
  }

  ul {
    margin: 0;
    padding-left: 1.05rem;
    color: #cbd8e5;
    max-height: 90px;
    overflow: auto;
  }

  footer {
    margin-top: 0.35rem;
    font-size: 0.7rem;
    color: #95a5b5;
  }
</style>

