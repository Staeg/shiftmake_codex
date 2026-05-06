<script lang="ts">
  import { tick } from 'svelte';
  import type { BattleStep } from '../engine/types';

  export let steps: BattleStep[] = [];
  export let selected: number | null = null;
  export let currentStep = -1;
  export let showTitle = true;
  export let pinnedExplanationIndex: number | null = null;
  export let onSelect: (index: number) => void;
  export let onPinExplanation: (index: number | null) => void = () => {};

  let logEl: HTMLDivElement;

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

  function handleClick(index: number): void {
    onSelect(index);
    if (pinnedExplanationIndex === index) {
      onPinExplanation(null);
      return;
    }
    onPinExplanation(index);
  }

  $: scrollTarget = selected ?? (currentStep >= 0 ? currentStep : null);

  $: if (logEl && scrollTarget !== null) {
    tick().then(() => {
      const target = logEl.querySelector(`button[data-step='${scrollTarget}']`) as HTMLButtonElement | null;
      target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }
</script>

<section class="panel">
  {#if showTitle}
    <h2>Event Log</h2>
  {/if}
  <div class="log" bind:this={logEl}>
    {#if steps.length === 0}
      <p>No battle yet.</p>
    {:else}
      {#each steps as step, index}
        <button
          data-step={index}
          class:selected={selected === index}
          class:pinned={pinnedExplanationIndex === index}
          class={styleFor(step.kind)}
          on:click={() => handleClick(index)}
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
</style>
