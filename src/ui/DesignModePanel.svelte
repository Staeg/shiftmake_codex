<script lang="ts">
  export type DesignTweakField = 'padding' | 'gap' | 'width' | 'maxWidth' | 'borderRadius' | 'minHeight';
  export type DesignTweaks = Partial<Record<DesignTweakField, string>>;

  export let selectedDesignTargetName: string | null = null;
  export let designTweaksByTarget: Record<string, DesignTweaks> = {};
  export let onClose: () => void;
  export let onUpdateTweak: (field: DesignTweakField, value: string) => void;
  export let onClearSelected: () => void;
  export let onDeselect: () => void;
  export let onResetAll: () => void;

  const DESIGN_TWEAK_FIELDS: Array<{ key: DesignTweakField; label: string; placeholder: string }> = [
    { key: 'padding', label: 'Padding', placeholder: '12px' },
    { key: 'gap', label: 'Gap', placeholder: '12px' },
    { key: 'width', label: 'Width', placeholder: '320px' },
    { key: 'maxWidth', label: 'Max width', placeholder: '420px' },
    { key: 'minHeight', label: 'Min height', placeholder: '120px' },
    { key: 'borderRadius', label: 'Radius', placeholder: '18px' },
  ];

  function inputValue(event: Event): string {
    return (event.currentTarget as HTMLInputElement).value;
  }
</script>

<aside class="design-mode-panel panel" role="dialog" aria-label="Design mode panel">
  <div class="design-mode-panel-header">
    <div>
      <p class="eyebrow">Design Mode</p>
      <h2>{selectedDesignTargetName ?? 'No Element Selected'}</h2>
    </div>
    <button class="ui-debug-target" data-ui-name="Close design mode" on:click={onClose}>Close</button>
  </div>

  <p class="design-mode-help">
    `Ctrl+Shift+D` toggles design mode. Click a labeled UI region to select it. Left Control still shows names even when design mode is off.
  </p>

  {#if selectedDesignTargetName}
    <div class="design-mode-form">
      {#each DESIGN_TWEAK_FIELDS as field}
        <label class="design-mode-field">
          <span>{field.label}</span>
          <input
            type="text"
            value={designTweaksByTarget[selectedDesignTargetName]?.[field.key] ?? ''}
            placeholder={field.placeholder}
            on:input={(event) => onUpdateTweak(field.key, inputValue(event))}
          />
        </label>
      {/each}
    </div>

    <div class="design-mode-actions">
      <button on:click={onClearSelected}>Clear Selected Tweaks</button>
      <button on:click={onDeselect}>Deselect</button>
    </div>
  {:else}
    <p class="design-mode-help">Select any labeled region in the live UI to edit its spacing or sizing here.</p>
  {/if}

  <div class="design-mode-actions">
    <button on:click={onResetAll} disabled={Object.keys(designTweaksByTarget).length === 0}>Reset All Tweaks</button>
    <small>{Object.keys(designTweaksByTarget).length} tweaked element{Object.keys(designTweaksByTarget).length === 1 ? '' : 's'}</small>
  </div>
</aside>

<style>
  .panel {
    display: grid;
    border: 1px solid rgba(126, 157, 181, 0.18);
    border-radius: var(--ui-panel-radius);
    box-shadow: var(--ui-shadow-panel);
  }

  button {
    min-height: var(--ui-space-hit);
    border: 1px solid rgba(126, 157, 181, 0.22);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(18, 27, 39, 0.88);
    color: var(--ui-color-text);
    font: inherit;
    padding: 0.55rem 0.7rem;
    cursor: pointer;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  input {
    width: 100%;
    border: 1px solid rgba(126, 157, 181, 0.25);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(6, 10, 18, 0.72);
    color: var(--ui-color-text);
    padding: var(--ui-space-sm);
    font: inherit;
  }

  .eyebrow {
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ui-color-accent);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }

  .design-mode-panel {
    position: fixed;
    right: 1rem;
    bottom: 1rem;
    z-index: 90;
    width: min(22rem, calc(100vw - 2rem));
    gap: 0.85rem;
    padding: 0.9rem;
    background:
      linear-gradient(160deg, rgba(18, 27, 38, 0.96), rgba(10, 15, 24, 0.98)),
      radial-gradient(circle at top right, rgba(95, 135, 170, 0.15), transparent 36%);
  }

  .design-mode-panel-header,
  .design-mode-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .design-mode-panel-header h2 {
    font-size: 1rem;
    line-height: 1.2;
  }

  .design-mode-help,
  .design-mode-actions small {
    color: var(--ui-color-text-dim);
    font-size: var(--ui-text-label);
    line-height: 1.45;
  }

  .design-mode-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .design-mode-field {
    display: grid;
    gap: 0.25rem;
  }

  .design-mode-field span {
    color: var(--ui-color-text-dim);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }
</style>
