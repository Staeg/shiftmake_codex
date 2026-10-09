<script lang="ts" context="module">
  export interface CycleActionPresentation {
    visible: boolean;
    label: string;
    blocked: boolean;
    disabled: boolean;
    tooltip: string | null;
    hovered: boolean;
    enter(): void;
    leave(): void;
    submit(): void;
  }
  export interface PlanningNotice {
    message: string | null;
    unspentEssence: boolean;
    dismiss(): void;
    focusEssence(): void;
  }
</script>
<script lang="ts">
  export let cycle: CycleActionPresentation;
  export let notice: PlanningNotice;
  export let empty = false;
</script>

<footer class="action-rail" class:empty-action-rail={empty}>
  <slot name="draft" />
        {#if notice.message}
          <div class="panel warning-panel system-message-popover ui-debug-target" data-ui-name="System message panel">
            <button type="button" class="system-message-close ui-debug-target" data-ui-name="Dismiss system message" aria-label="Dismiss system message" on:click={notice.dismiss}>X</button>
            <p class="eyebrow">System Message</p>
            <h2>System Notice</h2>
            <p>{notice.message}</p>
            {#if notice.unspentEssence}
              <button type="button" class="primary" on:click={notice.focusEssence}>Spend Essence</button>
            {/if}
          </div>
        {/if}

  <slot name="ready" />
  <slot name="tutorial" />
        {#if cycle.visible}
          <div
            class="end-cycle-action"
            class:blocking={cycle.blocked}
            role="presentation"
            on:mouseenter={cycle.enter}
            on:focusin={cycle.enter}
            on:mouseleave={cycle.leave}
            on:focusout={cycle.leave}
          >
            <button
              class="primary large end-cycle-button ui-debug-target"
              class:blocking={cycle.blocked}
              data-ui-name="End cycle button"
              data-tutorial-target="end-cycle-button"
              aria-disabled={cycle.blocked ? 'true' : 'false'}
              aria-describedby={cycle.tooltip ? 'end-cycle-tooltip' : undefined}
              title={cycle.tooltip ?? undefined}
              on:click={cycle.submit}
              disabled={cycle.disabled}
            >
              {cycle.label}
            </button>
            {#if cycle.tooltip}
              <div id="end-cycle-tooltip" class="end-cycle-tooltip" class:visible={cycle.blocked || cycle.hovered} role="tooltip">{cycle.tooltip}</div>
            {/if}
          </div>
        {/if}

</footer>
<style>











.warning-panel p {
    color: #a7b8c8;
  }
.warning-panel {
    padding-top: var(--ui-space-xs);
  }
.warning-panel {
    background:
      linear-gradient(160deg, rgba(46, 25, 23, 0.96), rgba(17, 14, 18, 0.96)),
      radial-gradient(circle at top right, rgba(170, 95, 95, 0.18), transparent 36%);
  }
.system-message-popover {
    position: fixed;
    right: var(--ui-space-md);
    bottom: 5.35rem;
    width: min(360px, 100%);
    padding-right: 2.65rem;
    z-index: 12;
  }
.system-message-close {
    position: absolute;
    top: 0.45rem;
    right: 0.45rem;
    width: 1.55rem;
    height: 1.55rem;
    display: grid;
    place-items: center;
    padding: 0;
    border: 1px solid rgba(255, 153, 153, 0.38);
    border-radius: 999px;
    background: rgba(111, 24, 29, 0.92);
    color: #ffdada;
    font: inherit;
    font-size: 0.75rem;
    line-height: 1;
  }
.action-rail {
    pointer-events: none;
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: minmax(260px, max-content) minmax(0, 1fr) auto;
    grid-auto-rows: auto;
    align-items: end;
    justify-items: start;
    gap: 0.75rem;
    min-height: 8.6rem;
    padding-bottom: 0.4rem;
  }
.action-rail > :global(*) {
    pointer-events: auto;
  }
.action-rail:has(:global(.footer-essence-draft-panel)) {
    min-height: 6.4rem;
  }
.action-rail:not(:has(:global(.footer-ready-troops-panel))):not(:has(:global(.footer-essence-draft-panel))):not(:has(.system-message-popover)):not(:has(:global(.archive-actions-stack))) {
    min-height: 3.5rem;
  }
.action-rail.empty-action-rail {
    display: none;
    min-height: 0;
    padding: 0;
    gap: 0;
  }
.action-rail > .end-cycle-action:only-child {
    grid-column: 3;
  }
.end-cycle-action {
    grid-column: 3;
    grid-row: 2;
    justify-self: end;
    align-self: end;
    position: relative;
    z-index: 1;
  }
.end-cycle-button {
    width: 100%;
  }
.end-cycle-button.blocking {
    border-color: rgba(126, 157, 181, 0.2);
    background: linear-gradient(135deg, rgba(62, 69, 76, 0.86), rgba(32, 38, 45, 0.92));
    color: #b6c2cc;
    box-shadow: none;
    cursor: not-allowed;
  }
.end-cycle-action.blocking:hover .end-cycle-button,
.end-cycle-action.blocking:focus-within .end-cycle-button {
    border-color: rgba(213, 178, 116, 0.52);
    box-shadow:
      0 0 0 2px rgba(213, 178, 116, 0.14),
      0 0 18px rgba(213, 178, 116, 0.18);
  }
.end-cycle-tooltip {
    position: absolute;
    right: 0;
    bottom: calc(100% + 0.45rem);
    z-index: 24;
    width: min(18rem, calc(100vw - 2rem));
    padding: 0.55rem 0.65rem;
    border: 1px solid rgba(213, 178, 116, 0.38);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(9, 13, 19, 0.97);
    color: #f2ebd6;
    box-shadow: var(--ui-shadow-panel);
    font-size: 0.78rem;
    line-height: 1.35;
    pointer-events: none;
    opacity: 0;
    visibility: hidden;
    transform: translateY(0.18rem);
    transition:
      opacity 0.14s ease,
      transform 0.14s ease,
      visibility 0.14s ease;
  }
.end-cycle-action.blocking:hover .end-cycle-tooltip,
.end-cycle-action.blocking:focus-within .end-cycle-tooltip,
.end-cycle-tooltip.visible {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }
.large {
    min-width: 220px;
    padding: 0.9rem 1.2rem;
    font-size: 1rem;
  }
.warning-panel {
    gap: var(--ui-space-sm);
  }
@media (max-width: 1280px) {.action-rail {
      min-height: 0;
    }}
@media (max-width: 820px) {.action-rail {
      grid-template-columns: 1fr;
    }
.end-cycle-button,
.system-message-popover {
      grid-column: 1;
    }
.system-message-popover,
.end-cycle-button {
      justify-self: stretch;
    }
.end-cycle-button {
      width: 100%;
    }
.system-message-popover {
      right: 0.75rem;
      bottom: 5.15rem;
      width: calc(100% - 1.5rem);
    }}
</style>
