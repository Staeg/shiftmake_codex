<script lang="ts">
  import type { ReplayStepExplanationView } from './replayStepExplanation';

  export let view: ReplayStepExplanationView;
  export let compact = false;
</script>

<div class:compact class="explanation-card">
  <p class="eyebrow">{view.eyebrow}</p>
  <h3>{view.title}</h3>
  <div class="sections">
    {#each view.sections as section}
      <section class="section">
        <strong>{section.title}</strong>
        <div class="lines">
          {#each section.lines as line}
            <p>{line}</p>
          {/each}
        </div>
      </section>
    {/each}
  </div>
</div>

<style>
  .explanation-card {
    display: grid;
    gap: 0.65rem;
    align-content: start;
  }

  .eyebrow {
    margin: 0;
    color: #9db2c4;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    line-height: 1.3;
    color: #f4f7fb;
  }

  .sections {
    display: grid;
    gap: 0.55rem;
  }

  .section {
    display: grid;
    gap: 0.28rem;
    padding: 0.65rem 0.75rem;
    border-radius: 14px;
    border: 1px solid rgba(124, 153, 176, 0.16);
    background: rgba(12, 18, 28, 0.62);
  }

  .section strong {
    color: #e9f1f9;
    font-size: 0.82rem;
    letter-spacing: 0.02em;
  }

  .lines {
    display: grid;
    gap: 0.28rem;
  }

  .lines p {
    margin: 0;
    color: #c6d5e3;
    font-size: 0.82rem;
    line-height: 1.42;
  }

  .compact {
    gap: 0.55rem;
  }

  .compact h3 {
    font-size: 0.92rem;
  }

  .compact .section {
    padding: 0.58rem 0.65rem;
  }

  .compact .lines p {
    font-size: 0.78rem;
  }
</style>
