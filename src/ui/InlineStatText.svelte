<script lang="ts">
  import { tokenizeStatText } from './inspectText';

  export let text = '';

  $: parts = tokenizeStatText(text);
</script>

<span class="inline-stat-text">
  {#each parts as part}
    {#if part.kind === 'stat'}
      <button type="button" class="inline-stat" aria-label={`${part.label}: ${part.description}`}>
        <span aria-hidden="true">{part.icon}</span>
        <span class="inline-stat-tooltip" role="tooltip">
          <strong>{part.label}</strong>
          <span>{part.description}</span>
        </span>
      </button>
    {:else}
      {part.text}
    {/if}
  {/each}
</span>

<style>
  .inline-stat-text {
    display: inline;
  }

  .inline-stat {
    position: relative;
    display: inline-grid;
    place-items: center;
    min-width: 1.05em;
    margin-inline: 0.03em;
    border-radius: 4px;
    border: 0;
    padding: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    vertical-align: -0.08em;
    cursor: help;
    outline: none;
  }

  .inline-stat:hover,
  .inline-stat:focus-visible {
    background: rgba(213, 178, 116, 0.14);
    box-shadow: 0 0 0 1px rgba(213, 178, 116, 0.24);
  }

  .inline-stat-tooltip {
    position: absolute;
    left: 50%;
    bottom: calc(100% + 0.38rem);
    z-index: 30;
    display: none;
    width: min(13.5rem, calc(100vw - 1rem));
    transform: translateX(-50%);
    gap: 0.25rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid rgba(212, 173, 115, 0.28);
    border-radius: 10px;
    background: rgba(10, 15, 24, 0.98);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.42);
    color: #ecf2f9;
    font-size: 0.72rem;
    line-height: 1.3;
    pointer-events: none;
    text-align: left;
  }

  .inline-stat:hover .inline-stat-tooltip,
  .inline-stat:focus-visible .inline-stat-tooltip {
    display: grid;
  }

  .inline-stat-tooltip strong {
    color: #f2d080;
    font-size: 0.76rem;
  }

  .inline-stat-tooltip span {
    color: #a7b8c8;
  }
</style>
