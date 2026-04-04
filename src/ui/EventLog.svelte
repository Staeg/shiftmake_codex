<script lang="ts">
  import { tick } from 'svelte';
  import type { BattleStep } from '../engine/types';
  import ReplayStepExplanation from './ReplayStepExplanation.svelte';
  import { buildReplayStepExplanationView } from './replayStepExplanation';

  export let steps: BattleStep[] = [];
  export let selected: number | null = null;
  export let currentStep = -1;
  export let showTitle = true;
  export let pinnedExplanationIndex: number | null = null;
  export let onSelect: (index: number) => void;
  export let onPinExplanation: (index: number | null) => void = () => {};

  let logEl: HTMLDivElement;
  let popupEl: HTMLDivElement | null = null;
  let hoveredExplanationIndex: number | null = null;
  let rowElements: Array<HTMLButtonElement | null> = [];
  let popupStyle = '';

  function styleFor(kind: BattleStep['kind']): string {
    if (kind === 'beat') return 'beat';
    if (kind === 'attack') return 'attack';
    if (kind === 'death') return 'dead';
    if (kind === 'engage') return 'engage';
    return 'move';
  }

  function roleIntentLabel(step: BattleStep): string | null {
    const roleIntent = step.metadata?.roleIntent;
    if (roleIntent === 'screen-frontline' || roleIntent === 'fallback-backline') {
      return 'Hold line';
    }
    if (roleIntent === 'breach-backline' || roleIntent === 'hold-backline') {
      return 'Break through';
    }
    if (roleIntent === 'retreat-range' || roleIntent === 'advance-range') {
      return 'Keep range';
    }
    return null;
  }

  function handleEnter(index: number): void {
    if (pinnedExplanationIndex !== null) {
      return;
    }
    hoveredExplanationIndex = index;
  }

  function handleLeave(index: number): void {
    if (pinnedExplanationIndex !== null) {
      return;
    }
    if (hoveredExplanationIndex === index) {
      hoveredExplanationIndex = null;
    }
  }

  function handleClick(index: number): void {
    const hadPinnedExplanation = pinnedExplanationIndex !== null;
    onSelect(index);
    if (hadPinnedExplanation) {
      hoveredExplanationIndex = null;
      onPinExplanation(null);
      return;
    }
    onPinExplanation(index);
  }

  function closePinnedExplanation(): void {
    hoveredExplanationIndex = null;
    onPinExplanation(null);
  }

  async function repositionPopup(): Promise<void> {
    if (activeExplanationIndex === null || !popupEl) {
      return;
    }

    const rowEl = rowElements[activeExplanationIndex];
    if (!rowEl) {
      return;
    }

    await tick();

    const rowRect = rowEl.getBoundingClientRect();
    const popupRect = popupEl.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const margin = 12;
    const gap = 12;
    const maxHeight = Math.max(220, viewportHeight - margin * 2);
    const popupHeight = Math.min(popupRect.height, maxHeight);
    const popupWidth = popupRect.width;
    const preferredLeft = rowRect.left - gap - popupWidth;
    const left = Math.max(margin, Math.min(preferredLeft, viewportWidth - margin - popupWidth));
    const top = Math.max(margin, Math.min(rowRect.top + rowRect.height / 2 - popupHeight / 2, viewportHeight - margin - popupHeight));

    popupStyle = `left:${left}px; top:${top}px; max-height:${maxHeight}px;`;
  }

  function handleLogScroll(): void {
    if (activeExplanationIndex !== null) {
      void repositionPopup();
    }
  }

  function handleWindowResize(): void {
    if (activeExplanationIndex !== null) {
      void repositionPopup();
    }
  }

  $: scrollTarget = selected ?? (currentStep >= 0 ? currentStep : null);
  $: activeExplanationIndex = pinnedExplanationIndex ?? hoveredExplanationIndex;
  $: activeExplanationView =
    activeExplanationIndex !== null && steps[activeExplanationIndex]
      ? buildReplayStepExplanationView(steps[activeExplanationIndex]!)
      : null;

  $: if (logEl && scrollTarget !== null) {
    tick().then(() => {
      const target = logEl.querySelector(`button[data-step='${scrollTarget}']`) as HTMLButtonElement | null;
      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  $: if (activeExplanationView && popupEl) {
    void repositionPopup();
  }
</script>

<svelte:window on:resize={handleWindowResize} />

<section class="panel">
  {#if showTitle}
    <h2>Event Log</h2>
  {/if}
  <div class="log" bind:this={logEl} on:scroll={handleLogScroll}>
    {#if steps.length === 0}
      <p>No battle yet.</p>
    {:else}
      {#each steps as step, index}
        <button
          bind:this={rowElements[index]}
          data-step={index}
          class:selected={selected === index}
          class:pinned={pinnedExplanationIndex === index}
          class={styleFor(step.kind)}
          on:click={() => handleClick(index)}
          on:mouseenter={() => handleEnter(index)}
          on:mouseleave={() => handleLeave(index)}
        >
          <span>#{index + 1}</span>
          <small>{step.kind.toUpperCase()}</small>
          {#if step.metadata?.roleIntent}
            <span class="intent-badge">{roleIntentLabel(step)}</span>
          {/if}
          <strong>{step.message}</strong>
        </button>
      {/each}
    {/if}
  </div>
</section>

{#if activeExplanationView}
  <div
    bind:this={popupEl}
    class="hover-popup"
    class:pinned-popup={pinnedExplanationIndex !== null}
    style={popupStyle}
    aria-live="polite"
  >
    {#if pinnedExplanationIndex !== null}
      <button
        type="button"
        class="popup-close"
        aria-label="Close pinned explanation"
        on:click|stopPropagation={closePinnedExplanation}
      >
        ×
      </button>
    {/if}
    <ReplayStepExplanation view={activeExplanationView} compact={true} />
  </div>
{/if}

<style>
  .panel {
    background: linear-gradient(145deg, rgba(20, 24, 32, 0.95), rgba(11, 13, 18, 0.95));
    border: 1px solid #2f3b49;
    border-radius: 14px;
    padding: 0.6rem 0.7rem;
    min-height: 0;
    display: grid;
    gap: 0.45rem;
  }

  h2,
  p {
    margin: 0;
  }

  .log {
    display: grid;
    gap: 0.24rem;
    min-height: 0;
    overflow: auto;
  }

  .log button {
    width: 100%;
    text-align: left;
    background: #111922;
    border: 1px solid #2d3c4a;
    color: #e8edf3;
    border-radius: 10px;
    padding: 0.32rem 0.45rem;
    display: grid;
    gap: 0.1rem;
    cursor: pointer;
  }

  .log button.selected {
    outline: 2px solid #e8d17a;
  }

  .log button.pinned {
    border-color: rgba(124, 153, 176, 0.7);
    background: rgba(21, 29, 41, 0.96);
  }

  .log button small {
    color: #aeb9c2;
  }

  .log button strong {
    font-size: 0.78rem;
    font-weight: 500;
  }

  .intent-badge {
    justify-self: start;
    border-radius: 999px;
    border: 1px solid rgba(232, 209, 122, 0.35);
    background: rgba(232, 209, 122, 0.12);
    color: #f0dc98;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    padding: 0.06rem 0.34rem;
    text-transform: uppercase;
  }

  .log button.attack {
    border-left: 4px solid #d5786a;
  }

  .log button.beat {
    border-left: 4px solid #7ca1d8;
  }

  .log button.dead {
    border-left: 4px solid #f1af53;
  }

  .log button.move {
    border-left: 4px solid #8cc28c;
  }

  .log button.engage {
    border-left: 4px solid #b197de;
  }

  .hover-popup {
    position: fixed;
    z-index: 25;
    width: min(25rem, calc(100vw - 1.5rem));
    overflow: auto;
    padding: 0.85rem 0.9rem;
    border-radius: 18px;
    border: 1px solid rgba(124, 153, 176, 0.22);
    background:
      linear-gradient(180deg, rgba(8, 13, 21, 0.98), rgba(12, 18, 28, 0.98)),
      radial-gradient(circle at top right, rgba(123, 175, 221, 0.16), transparent 34%);
    box-shadow: 0 22px 50px rgba(0, 0, 0, 0.42);
    pointer-events: none;
  }

  .hover-popup.pinned-popup {
    pointer-events: auto;
    padding-top: 2rem;
  }

  .popup-close {
    position: absolute;
    top: 0.55rem;
    right: 0.55rem;
    width: 1.7rem;
    height: 1.7rem;
    border-radius: 999px;
    border: 1px solid rgba(145, 170, 196, 0.24);
    background: rgba(14, 19, 28, 0.92);
    color: #d8e4f0;
    font-size: 1rem;
    line-height: 1;
    cursor: pointer;
  }

  .popup-close:hover {
    border-color: rgba(232, 209, 122, 0.4);
    color: #f4e4a5;
  }
</style>
