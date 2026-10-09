<script lang="ts" context="module">
  import type { BattleReplay, ReplayIndexEntry, StoredReplayPayload, BattleOutcome, SideId, RiftInstance, GameState } from '../engine/types';
  import type { MiniReplayHealthTone } from './riftBattlePresentation';
  import type { DetailCard } from './detailCards';
  export interface ArchiveReplayAccess {
    has(id: string): boolean;
    payload(id: string): StoredReplayPayload | null;
    replay(id: string): BattleReplay | null;
  }
  export interface ArchivePresentation {
    visual(entry: ReplayIndexEntry, game: GameState): {
      outcome: BattleOutcome; opponentOutcome: boolean; leftPercent: number; rightPercent: number;
      leftTone: MiniReplayHealthTone; rightTone: MiniReplayHealthTone; ariaLabel: string;
      riftVisualSource: RiftInstance | null;
    };
    style(entry: ReplayIndexEntry): string;
    opponent(entry: ReplayIndexEntry): boolean;
  }
  export interface ArchiveInspection {
    preview(detail: DetailCard): void;
    clear(): void;
    pin(detail: DetailCard): void;
    highlightedKeys: Set<string>;
  }
</script>

<script lang="ts">
  import type { GameState, RaceId, UnitClassId, ResolvedCombatantDefinition, SideId, ReplayIndexEntry } from '../engine/types';
  import type { ArchiveSession } from './archiveSession';
  import { buildArchiveDetails, type ArchiveCombatantPerformance } from './archiveDetails';
  import { getMutator } from '../engine/unitCatalog';
  import { buildResolvedUnitDetail, buildUpgradeDetail, buildMutatorDetail, getUpgradeDetails,
    formatRiftDisplayId, unitIconColumns, unitIconCopies, unitIconDensityClass, type DetailCard } from './detailCards';
  import { getRiftVisual } from './riftVisuals';
  import BattleLogResultToken from './BattleLogResultToken.svelte';
  import GameIcon from './GameIcon.svelte';

  export let game: GameState;
  export let session: ArchiveSession;
  export let visible: boolean;
  export let arrivalActive: boolean;
  export let replays: ArchiveReplayAccess;
  export let presentation: ArchivePresentation;
  export let inspection: ArchiveInspection;
  export let select: (id: string) => void;
  export let open: (id: string) => void;
  export let openSelected: (id: string) => void;
  export let previewRift: (entry: ReplayIndexEntry) => void;
  export let getRaceUnitPortrait: (raceId: RaceId, unitClassId: UnitClassId) => string;

  $: selectedReplayEntry = game.replayIndex.find(entry => entry.replayId === $session.selectedId) ?? null;
  $: selectedReplayAvailable = !!selectedReplayEntry && !selectedReplayEntry.summaryOnly && replays.has(selectedReplayEntry.replayId);
  $: selectedArchivePayload = selectedReplayEntry && !selectedReplayEntry.summaryOnly ? replays.payload(selectedReplayEntry.replayId) : null;
  $: selectedArchiveReplay = selectedReplayEntry && selectedReplayAvailable ? replays.replay(selectedReplayEntry.replayId) : null;
  $: selectedDetails = buildArchiveDetails(selectedReplayEntry, selectedArchivePayload, selectedArchiveReplay);
  $: pagedReplayEntries = game.replayIndex.slice($session.page * $session.pageSize, ($session.page + 1) * $session.pageSize);

  function buildArchiveCombatantDetail(combatant: ResolvedCombatantDefinition, side: SideId, label: string): DetailCard {
    return buildResolvedUnitDetail({ detailKey: `archive:${side}:${combatant.combatantId}`, label: combatant.label,
      raceId: combatant.raceId, unitClassId: combatant.unitClassId, stats: combatant.stats, quantity: combatant.quantity,
      description: `${label} force at battle time.`, abilities: combatant.abilities,
      statBreakdowns: combatant.statBreakdowns, getRaceUnitPortrait });
  }

  function archivePerformanceStyle(performance: ArchiveCombatantPerformance | null): string {
    return `--archive-health-scale:${((performance?.healthPercent ?? 0) / 100).toFixed(3)}; --archive-damage-scale:${((performance?.damagePercent ?? 0) / 100).toFixed(3)};`;
  }

  function decorateArchiveSummary(summary: string): string { return summary.replace(/\s+\d+\s*-\s*\d+\b/g, ''); }
  function archiveResultLabel(entry: ReplayIndexEntry): string {
    return entry.outcome === 'victory' ? presentation.opponent(entry) ? 'Rival victory' : 'Player victory' :
      entry.outcome === 'defeat' ? 'Player defeat' : 'Draw';
  }
  function archiveResultGlyph(entry: ReplayIndexEntry): 'crown' | 'skull' | 'draw' {
    return entry.outcome === 'victory' ? 'crown' : entry.outcome === 'defeat' ? 'skull' : 'draw';
  }
  function archiveResultShowsRivalArrow(entry: ReplayIndexEntry): boolean { return presentation.opponent(entry) && entry.outcome === 'victory'; }
</script>

      {#if visible && selectedReplayEntry}
        <div class="panel selected-archive-panel ui-debug-target" data-ui-name="Selected archive entry">
          <button class="archive-back-button ui-debug-target" data-ui-name="Back to archive" on:click={() => (session.select(null))} aria-label="Back to archive">
            <span aria-hidden="true">&larr;</span>
          </button>
          <div class="archive-inspect-heading">
            <span
              class="archive-result-mark"
              class:rival-result={archiveResultShowsRivalArrow(selectedReplayEntry)}
              class:defeat-result={archiveResultGlyph(selectedReplayEntry) === 'skull'}
              aria-label={archiveResultLabel(selectedReplayEntry)}
              title={archiveResultLabel(selectedReplayEntry)}
            >
              {#if archiveResultShowsRivalArrow(selectedReplayEntry)}
                <span class="archive-rival-arrow" aria-hidden="true">&lt;-&gt;</span>
              {/if}
              {#if archiveResultGlyph(selectedReplayEntry) === 'crown'}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3.5 8.2 8.4 12l3.6-7 3.6 7 4.9-3.8-2.1 10H5.6L3.5 8.2Z" />
                  <path d="M6.2 20h11.6" />
                </svg>
              {:else if archiveResultGlyph(selectedReplayEntry) === 'skull'}
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 11.2C6 6.9 8.5 4.4 12 4.4s6 2.5 6 6.8c0 2.3-.7 4-2 5.1V20H8v-3.7c-1.3-1.1-2-2.8-2-5.1Z" />
                  <circle cx="9.7" cy="11.5" r="1.25" />
                  <circle cx="14.3" cy="11.5" r="1.25" />
                  <path d="M12 14.1v2.1" />
                </svg>
              {:else}
                <span class="archive-draw-mark" aria-hidden="true">=</span>
              {/if}
            </span>
            <button
              type="button"
              class="archive-watch-button archive-inspect-watch-button"
              aria-label={selectedReplayAvailable ? 'Watch Battle' : 'Replay unavailable'}
              title={selectedReplayAvailable ? 'Watch Battle' : 'Replay unavailable'}
              disabled={!selectedReplayAvailable}
              on:click={() => openSelected(selectedReplayEntry.replayId)}
            >
              <svg class="archive-watch-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M2.2 12s3.4-6.1 9.8-6.1 9.8 6.1 9.8 6.1-3.4 6.1-9.8 6.1S2.2 12 2.2 12Z" />
                <circle cx="12" cy="12" r="3.25" />
              </svg>
            </button>
          </div>
          {#if selectedReplayEntry.riftLabel || selectedReplayEntry.riftId}
            <p class="archive-rift-id">Rift {selectedReplayEntry.riftLabel ?? formatRiftDisplayId(selectedReplayEntry.riftId ?? '')}</p>
          {/if}
          {#if selectedReplayEntry.resultDrift}
            <div class="archive-drift-note">
              <strong>Rules changed this replay.</strong>
              <span>It now resolves as {decorateArchiveSummary(selectedReplayEntry.resultDrift.currentSummary)}; archived result was {decorateArchiveSummary(selectedReplayEntry.resultDrift.originalSummary)}.</span>
            </div>
          {/if}
          <div class="ability-row">
            <span>Mutators</span>
            <div class="ability-list">
              {#if selectedReplayEntry.mutatorIds.length === 0}
                <span class="mutator-chip empty">None</span>
              {:else}
                {#each selectedReplayEntry.mutatorIds as mutatorId}
                  <button
                    class="mutator-chip"
                    class:selected={inspection.highlightedKeys.has(buildMutatorDetail(mutatorId).detailKey)}
                    on:mouseenter={() => inspection.preview(buildMutatorDetail(mutatorId))}
                    on:focus={() => inspection.preview(buildMutatorDetail(mutatorId))}
                    on:mouseleave={inspection.clear}
                    on:blur={inspection.clear}
                    on:click={() => inspection.pin(buildMutatorDetail(mutatorId))}
                  >
                    <span class="icon-label"><GameIcon kind="mutator" id={mutatorId} label={getMutator(mutatorId).label} /><span>{getMutator(mutatorId).label}</span></span>
                  </button>
                {/each}
              {/if}
            </div>
          </div>

          {#if selectedArchivePayload}
            <div class="archive-force-block">
              <span class={`assignment-label archive-side-label ${`archive-${selectedDetails.participants.player.kind}`}`}>{`${selectedDetails.participants.player.label} Forces`}</span>
              <div class="assigned-strip archive-force-strip">
                {#each selectedDetails.combatants.player as combatant}
                  {@const combatantDetail = buildArchiveCombatantDetail(combatant, 'player', selectedDetails.participants.player.label)}
                  {@const performance = selectedDetails.performance.get(`player:${combatant.label}`) ?? null}
                  <button
                    class="unit-tile assigned-summary-tile archive-performance-tile ui-debug-target"
                    data-ui-name={`Archive player force ${combatant.label}`}
                    class:selected={inspection.highlightedKeys.has(combatantDetail.detailKey)}
                    class:has-archive-performance={!!performance}
                    style={archivePerformanceStyle(performance)}
                    on:mouseenter={() => inspection.preview(combatantDetail)}
                    on:focus={() => inspection.preview(combatantDetail)}
                    on:mouseleave={inspection.clear}
                    on:blur={inspection.clear}
                    on:click={() => inspection.pin(combatantDetail)}
                  >
                    <span class="archive-health-indicator" aria-hidden="true"></span>
                    <span class="archive-damage-indicator" aria-hidden="true"></span>
                    <span class={`unit-icon-cluster tile-unit-cluster ${unitIconDensityClass(combatant.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(combatant.quantity)}`} aria-label={`${combatant.quantity} ${combatant.label} units`}>
                      {#each unitIconCopies(combatant.quantity) as copy}
                        <img class="unit-tile-art" src={getRaceUnitPortrait(combatant.raceId, combatant.unitClassId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                      {/each}
                    </span>
                  </button>
                {/each}
              </div>
              <div class="unlock-row archive-upgrade-row">
                {#if selectedDetails.upgrades.player.length > 0}
                  {#each selectedDetails.upgrades.player as upgradeId}
                    {@const upgradeDetail = buildUpgradeDetail(upgradeId)}
                    <button
                      class="list-button archive-upgrade-chip"
                      class:selected={inspection.highlightedKeys.has(upgradeDetail.detailKey)}
                      on:mouseenter={() => inspection.preview(upgradeDetail)}
                      on:focus={() => inspection.preview(upgradeDetail)}
                      on:mouseleave={inspection.clear}
                      on:blur={inspection.clear}
                      on:click={() => inspection.pin(upgradeDetail)}
                    >
                      <span class="icon-label"><GameIcon kind="upgrade" id={upgradeId} label={getUpgradeDetails(upgradeId).label} /><span>{getUpgradeDetails(upgradeId).label}</span></span>
                    </button>
                  {/each}
                {/if}
              </div>
            </div>

            <div class="archive-force-block">
              <span class={`assignment-label archive-side-label ${`archive-${selectedDetails.participants.enemy.kind}`}`}>{`${selectedDetails.participants.enemy.label} Forces`}</span>
              <div class="assigned-strip enemy-strip archive-force-strip">
                {#each selectedDetails.combatants.enemy as combatant}
                  {@const combatantDetail = buildArchiveCombatantDetail(combatant, 'enemy', selectedDetails.participants.enemy.label)}
                  {@const performance = selectedDetails.performance.get(`enemy:${combatant.label}`) ?? null}
                  <button
                    class="unit-tile enemy-tile archive-performance-tile ui-debug-target"
                    data-ui-name={`Archive enemy force ${combatant.label}`}
                    class:selected={inspection.highlightedKeys.has(combatantDetail.detailKey)}
                    class:has-archive-performance={!!performance}
                    style={archivePerformanceStyle(performance)}
                    on:mouseenter={() => inspection.preview(combatantDetail)}
                    on:focus={() => inspection.preview(combatantDetail)}
                    on:mouseleave={inspection.clear}
                    on:blur={inspection.clear}
                    on:click={() => inspection.pin(combatantDetail)}
                  >
                    <span class="archive-health-indicator" aria-hidden="true"></span>
                    <span class="archive-damage-indicator" aria-hidden="true"></span>
                    <span class={`unit-icon-cluster tile-unit-cluster ${unitIconDensityClass(combatant.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(combatant.quantity)}`} aria-label={`${combatant.quantity} ${combatant.label} units`}>
                      {#each unitIconCopies(combatant.quantity) as copy}
                        <img class="unit-tile-art" src={getRaceUnitPortrait(combatant.raceId, combatant.unitClassId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                      {/each}
                    </span>
                  </button>
                {/each}
              </div>
              {#if selectedDetails.upgrades.enemy.length > 0}
                <div class="unlock-row archive-upgrade-row">
                  {#each selectedDetails.upgrades.enemy as upgradeId}
                    {@const upgradeDetail = buildUpgradeDetail(upgradeId)}
                    <button
                      class="list-button archive-upgrade-chip"
                      class:selected={inspection.highlightedKeys.has(upgradeDetail.detailKey)}
                      on:mouseenter={() => inspection.preview(upgradeDetail)}
                      on:focus={() => inspection.preview(upgradeDetail)}
                      on:mouseleave={inspection.clear}
                      on:blur={inspection.clear}
                      on:click={() => inspection.pin(upgradeDetail)}
                    >
                      <span class="icon-label"><GameIcon kind="upgrade" id={upgradeId} label={getUpgradeDetails(upgradeId).label} /><span>{getUpgradeDetails(upgradeId).label}</span></span>
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          {:else}
            <div class="compact-list">
              <div>
                <span>Troops Sent</span>
                <strong>{selectedReplayEntry.playerTroopLabels.join(', ') || 'Unknown troop'}</strong>
              </div>
              <div>
                <span>Replay Status</span>
                <strong>{selectedReplayEntry.summaryOnly ? 'Summary only' : selectedReplayAvailable ? 'Replay available' : 'Replay missing'}</strong>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      {#if visible && !selectedReplayEntry}
        <div class="panel archive-panel ui-debug-target" data-ui-name="Battle archive panel">
          {#if game.replayIndex.length === 0 && !arrivalActive}
            <p>No archived battles yet.</p>
          {:else}
            <div class="archive-list">
              <slot name="incoming" />
              {#each pagedReplayEntries as replayEntry}
                {@const archiveVisual = presentation.visual(replayEntry, game)}
                {@const archiveRiftVisual = archiveVisual.riftVisualSource ? getRiftVisual(archiveVisual.riftVisualSource) : null}
                <div class="archive-card-row" class:archive-opponent-record={presentation.opponent(replayEntry)}>
                  <button
                    class="archive-card ui-debug-target"
                    data-ui-name={`Archive entry ${replayEntry.summary}`}
                    data-tutorial-target="archive-card"
                    class:selected={$session.selectedId === replayEntry.replayId}
                    style={presentation.style(replayEntry)}
                    on:mouseenter={() => previewRift(replayEntry)}
                    on:focus={() => previewRift(replayEntry)}
                    on:click={() => select(replayEntry.replayId)}
                    aria-label={archiveVisual.ariaLabel}
                  >
                    {#if archiveRiftVisual}
                      <span class="archive-rift-thumbnail" style={`--rift-tint:${archiveRiftVisual.tint}; --rift-glow:${archiveRiftVisual.glow}; --rift-rotation:${archiveRiftVisual.rotationDeg}deg;`}>
                        <img src={archiveRiftVisual.imageUrl} alt="" aria-hidden="true" style={`filter:${archiveRiftVisual.filter};`} />
                      </span>
                    {/if}
                    <BattleLogResultToken
                      outcome={archiveVisual.outcome}
                      opponentOutcome={archiveVisual.opponentOutcome}
                      leftPercent={archiveVisual.leftPercent}
                      rightPercent={archiveVisual.rightPercent}
                      leftTone={archiveVisual.leftTone}
                      rightTone={archiveVisual.rightTone}
                    />
                  </button>
                  <button
                    type="button"
                    class="archive-watch-button"
                    aria-label={replayEntry.summaryOnly || !replays.has(replayEntry.replayId) ? 'Replay unavailable' : 'Watch Battle'}
                    title={replayEntry.summaryOnly || !replays.has(replayEntry.replayId) ? 'Replay unavailable' : 'Watch Battle'}
                    disabled={replayEntry.summaryOnly || !replays.has(replayEntry.replayId)}
                    on:click={() => open(replayEntry.replayId)}
                  >
                    <svg class="archive-watch-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M2.2 12s3.4-6.1 9.8-6.1 9.8 6.1 9.8 6.1-3.4 6.1-9.8 6.1S2.2 12 2.2 12Z" />
                      <circle cx="12" cy="12" r="3.25" />
                    </svg>
                  </button>
                </div>
              {/each}
            </div>
            {#if $session.pageCount > 1}
              <div class="archive-pagination">
                <button type="button" aria-label="Previous archive page" disabled={$session.page === 0} on:click={() => session.setPage($session.page - 1)}>&lt;</button>
                <span>Page {$session.page + 1} / {$session.pageCount}</span>
                <button type="button" aria-label="Next archive page" disabled={$session.page >= $session.pageCount - 1} on:click={() => session.setPage($session.page + 1)}>&gt;</button>
              </div>
            {/if}
          {/if}
        </div>
      {/if}

<style>







  :global(.overworld-shell) {
    height: 100dvh;
    overflow: hidden;
  }

  :global(.overworld-shell) {
    width: min(1700px, 100%);
    grid-template-columns: minmax(250px, 282px) minmax(760px, 1fr) minmax(260px, 320px);
    gap: 0.75rem;
    padding-block: 0.75rem;
  }

  :global(.overworld-shell):global(.rifts-mode) {
    grid-template-rows: auto minmax(0, 1fr) auto;
  }

  .compact-list div {
    display: grid;
    gap: 0.15rem;
    padding: var(--ui-space-sm);
    border: 1px solid rgba(124, 153, 176, 0.15);
    border-radius: var(--ui-panel-radius-tight);
    background: var(--ui-color-surface-soft);
  }

  .compact-list span {
    color: var(--ui-color-text-dim);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }

  .compact-list strong {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    min-width: 0;
    white-space: nowrap;
  }

  @container (max-width: 520px) {

    .compact-list strong {
      gap: 0.18rem;
      font-size: clamp(0.68rem, 16cqw, 0.95rem);
    }
  }

  .unlock-row button,
.archive-card {
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: var(--ui-panel-radius-tight);
    background: var(--ui-color-surface-interactive);
    color: var(--ui-color-text);
    padding: var(--ui-space-sm);
    font: inherit;
  }



  :global(.right-column) {
    min-height: 0;
    display: grid;
    gap: 0.75rem;
    align-content: start;
    overflow: auto;
    padding-right: 0.2rem;
  }





  .archive-list,
  .unlock-row,
  .assigned-strip,
  .ability-list {
    display: grid;
    gap: var(--ui-space-sm);
  }

  .assigned-strip {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .ability-list {
    display: flex;
    flex-wrap: wrap;
  }

  .archive-card,
  .list-button {
    text-align: left;
  }

  .list-button {
    display: grid;
    gap: 0.25rem;
    align-items: center;
  }

  .list-button:has(:global(.game-icon)) {
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 0.45rem;
  }

  .icon-label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }

  .icon-label > span {
    min-width: 0;
  }

  .archive-card,
  .list-button,
  .unit-tile {
    transition:
      transform 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease,
      background 120ms ease;
  }

  .archive-card:hover,
  .list-button:hover,
  .unit-tile:hover,
  .mutator-chip:hover {
    transform: none;
    border-color: rgba(213, 178, 116, 0.6);
    box-shadow:
      inset 0 0 0 1px rgba(213, 178, 116, 0.55),
      0 10px 22px rgba(0, 0, 0, 0.22);
  }

  .archive-card.selected,
  .list-button.selected,
  .mutator-chip.selected,
  .unit-tile.selected {
    background:
      linear-gradient(145deg, rgba(44, 31, 15, 0.96), rgba(17, 22, 30, 0.96)),
      radial-gradient(circle at top left, rgba(212, 173, 115, 0.18), transparent 42%);
    box-shadow:
      inset 0 0 0 2px #d4ad73,
      0 10px 22px rgba(0, 0, 0, 0.22);
  }

  .mutator-chip {
    display: inline-flex;
    align-items: center;
    justify-content: stretch;
    gap: 0.35rem;
    border: 1px solid rgba(124, 153, 176, 0.2);
    border-radius: 999px;
    padding: 0.3rem 0.6rem;
    background: rgba(20, 28, 38, 0.76);
    color: inherit;
    font: inherit;
    line-height: 1.1;
  }

  .mutator-chip :global(.game-icon),
  .list-button :global(.game-icon) {
    --game-icon-size: 1.05rem;
  }

  .mutator-chip.empty {
    color: #95a9ba;
  }

  .archive-drift-note {
    display: grid;
    gap: 0.2rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid rgba(213, 178, 116, 0.34);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(50, 33, 17, 0.62);
    color: #f0d4a6;
  }

  .archive-drift-note span {
    color: #d7c3a4;
    font-size: 0.78rem;
  }

  .archive-card {
    --archive-victory: rgba(74, 193, 111, 0.58);
    --archive-defeat: rgba(213, 75, 82, 0.58);
    --archive-draw: rgba(213, 178, 116, 0.52);
    --archive-neutral: rgba(143, 153, 164, 0.52);
    --archive-left-color: var(--archive-victory);
    --archive-right-color: var(--archive-neutral);
    position: relative;
    min-height: 3rem;
    overflow: hidden;
    background:
      linear-gradient(
        90deg,
        color-mix(in srgb, var(--archive-left-color) 34%, transparent),
        color-mix(in srgb, var(--archive-left-color) 12%, var(--archive-right-color) 12%) 48%,
        color-mix(in srgb, var(--archive-right-color) 34%, transparent)
      ),
      var(--ui-color-surface-interactive);
  }

  .archive-card::before {
    content: '';
    position: absolute;
    inset: 0;
    border-left: 3px solid var(--archive-left-color);
    border-right: 3px solid var(--archive-right-color);
    pointer-events: none;
  }

  .archive-force-block {
    display: grid;
    gap: var(--ui-space-sm);
  }

  .selected-archive-panel {
    position: relative;
    padding-top: 2.55rem;
  }

  .archive-back-button {
    position: absolute;
    top: 0.6rem;
    left: 0.6rem;
    width: 2rem;
    height: 2rem;
    padding: 0;
    display: inline-grid;
    place-items: center;
    border-radius: 999px;
    font-size: 1rem;
    line-height: 1;
    background: rgba(38, 38, 52, 0.94);
    border: 1px solid rgba(190, 184, 205, 0.72);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  }

  .archive-back-button span {
    display: block;
    width: 0.66rem;
    height: 0.66rem;
    overflow: hidden;
    color: transparent;
    border-left: 2px solid #f4f0ff;
    border-bottom: 2px solid #f4f0ff;
    transform: translateX(0.1rem) rotate(45deg);
  }

  .archive-back-button:not(:disabled):active {
    transform: none;
    filter: brightness(0.92);
  }

  .archive-force-strip {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .archive-upgrade-row {
    display: flex;
    flex-wrap: wrap;
  }

  .archive-upgrade-chip {
    min-width: 0;
    padding: 0.35rem 0.5rem;
    font-size: 0.74rem;
  }

  .unit-tile {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.9rem;
  }

  .unit-tile {
    position: relative;
    width: var(--troop-icon-box-size, 3.8rem);
    height: var(--troop-icon-box-size, 3.8rem);
    min-height: 0;
    aspect-ratio: 1;
    display: grid;
    place-items: stretch;
    justify-content: center;
    padding: 0.45rem;
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: 14px;
    background: rgba(22, 31, 42, 0.82);
    color: inherit;
    overflow: hidden;
  }

  .unit-tile.selected {
    border-color: rgba(237, 197, 111, 0.82);
    box-shadow:
      inset 0 0 0 2px rgba(237, 197, 111, 0.45),
      0 0 0 1px rgba(237, 197, 111, 0.2);
  }

  .unit-tile:focus-visible {
    outline: 2px dotted rgba(244, 247, 251, 0.86);
    outline-offset: 3px;
  }

  .assigned-summary-tile {
    border-color: rgba(185, 195, 203, 0.54);
    background:
      linear-gradient(145deg, rgba(78, 84, 92, 0.9), rgba(32, 37, 44, 0.96)),
      radial-gradient(circle at 30% 15%, rgba(234, 239, 242, 0.18), transparent 52%);
    box-shadow: inset 0 0 0 1px rgba(238, 243, 246, 0.16);
  }

  .unit-tile.assigned-summary-tile.selected {
    border-color: rgba(218, 190, 140, 0.72);
    background:
      linear-gradient(145deg, rgba(86, 93, 102, 0.94), rgba(35, 40, 47, 0.98)),
      radial-gradient(circle at 28% 12%, rgba(246, 249, 250, 0.22), transparent 54%);
    box-shadow:
      inset 0 0 0 2px rgba(218, 190, 140, 0.45),
      0 10px 22px rgba(0, 0, 0, 0.24);
  }

  .archive-performance-tile {
    --archive-health-scale: 0;
    --archive-damage-scale: 0;
  }

  .archive-performance-tile.has-archive-performance::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
    pointer-events: none;
    z-index: 6;
  }

  .archive-health-indicator,
  .archive-damage-indicator {
    position: absolute;
    bottom: 0.32rem;
    width: 0.2rem;
    top: 0.32rem;
    height: auto;
    min-height: 0;
    border-radius: 999px;
    opacity: 0;
    pointer-events: none;
    transform: scaleY(var(--archive-health-scale));
    transform-origin: bottom;
    z-index: 7;
  }

  .archive-health-indicator {
    left: 0.32rem;
    background: linear-gradient(180deg, #a7f0a0, #48bd6c);
    box-shadow: 0 0 0.38rem rgba(88, 220, 117, 0.34);
  }

  .archive-damage-indicator {
    right: 0.32rem;
    transform: scaleY(var(--archive-damage-scale));
    background: linear-gradient(180deg, #ff9a82, #d84c43);
    box-shadow: 0 0 0.38rem rgba(232, 72, 61, 0.34);
  }

  .has-archive-performance .archive-health-indicator,
  .has-archive-performance .archive-damage-indicator {
    opacity: 0.96;
  }

  .enemy-tile {
    justify-content: stretch;
  }

  .unit-tile-art {
    image-rendering: pixelated;
    object-fit: contain;
    filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.28));
  }

  .unit-tile-art {
    width: 2.2rem;
    height: 2.2rem;
    flex: 0 0 auto;
    display: block;
    margin: auto;
  }

  .unit-tile:has(.unit-icon-cluster) {
    justify-content: stretch;
    justify-items: stretch;
    place-items: stretch;
  }

  .archive-card-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 2.45rem;
    gap: 0.4rem;
    align-items: stretch;
  }

  .archive-card-row.archive-opponent-record {
    grid-template-columns: 2.45rem minmax(0, 1fr);
  }

  .archive-card-row.archive-opponent-record .archive-watch-button {
    grid-column: 1;
    grid-row: 1;
  }

  .archive-card-row.archive-opponent-record .archive-card {
    grid-column: 2;
    grid-row: 1;
  }

  .archive-card {
    display: grid;
    align-items: center;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.55rem;
    text-align: left;
  }

  .archive-inspect-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .archive-result-mark {
    display: inline-flex;
    align-items: center;
    gap: 0.42rem;
    min-height: 3rem;
    color: #f4e6ba;
  }

  .archive-result-mark svg {
    width: 2.65rem;
    height: 2.65rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.7;
    filter: drop-shadow(0 0 0.5rem rgba(235, 190, 86, 0.26));
  }

  .archive-result-mark:not(.rival-result) svg {
    width: 3.05rem;
    height: 3.05rem;
  }

  .archive-result-mark.defeat-result {
    color: #ff9a82;
  }

  .archive-result-mark.defeat-result svg {
    filter: drop-shadow(0 0 0.5rem rgba(232, 72, 61, 0.28));
  }

  .archive-result-mark .archive-rival-arrow {
    color: #9eb4c7;
    font-family: var(--ui-font-mono);
    font-size: 0.78rem;
    font-weight: 900;
  }

  .archive-result-mark .archive-draw-mark {
    display: inline-grid;
    width: 2.65rem;
    height: 2.65rem;
    place-items: center;
    border: 1px solid rgba(213, 178, 116, 0.48);
    border-radius: 999px;
    color: #e6c88d;
    font-family: var(--ui-font-mono);
    font-size: 1.6rem;
    font-weight: 900;
  }

  .archive-rift-id {
    color: #9db2c4;
    font-size: 0.8rem;
    text-transform: uppercase;
  }

  .archive-rift-thumbnail {
    width: 2.55rem;
    height: 2.55rem;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--rift-tint) 56%, transparent);
    border-radius: var(--ui-panel-radius-tight);
    background: radial-gradient(circle, var(--rift-glow), rgba(10, 14, 20, 0.84) 68%);
    overflow: hidden;
  }

  .archive-rift-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transform: rotate(var(--rift-rotation));
  }

  .archive-watch-button {
    display: grid;
    min-height: 2.45rem;
    min-width: 0;
    place-items: center;
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(20, 29, 39, 0.9);
    color: #f4e6ba;
    font-size: 0;
    font-weight: 800;
  }

  .archive-watch-icon {
    width: 1.25rem;
    height: 1.25rem;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 1.8;
  }

  .archive-inspect-watch-button {
    width: 2.8rem;
    border-color: rgba(229, 188, 88, 0.82);
    box-shadow: inset 0 0 0 1px rgba(255, 220, 125, 0.18), 0 0 0.85rem rgba(217, 164, 48, 0.24);
  }

  .ability-row {
    display: grid;
    gap: 0.45rem;
  }

  :global(.right-column) {
    grid-auto-rows: min-content;
  }

  :global(.overworld-shell):global(.rifts-mode) :global(.right-column) {
    grid-column: 3;
    grid-row: 2 / 4;
    grid-template-rows: minmax(0, 1fr);
    grid-auto-rows: minmax(0, 1fr);
    align-content: stretch;
    overflow: hidden;
    padding-bottom: 8.6rem;
  }

  .compact-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .archive-panel,
  .selected-archive-panel {
    min-width: 0;
    min-height: 0;
    height: 100%;
  }

  .archive-panel {
    grid-template-rows: minmax(0, 1fr) auto;
    align-content: stretch;
    overflow: hidden;
  }

  .archive-panel > p {
    align-self: start;
  }

  .archive-list {
    min-height: 0;
    align-content: start;
    overflow: auto;
    padding-right: 0.15rem;
  }

  .selected-archive-panel {
    align-content: start;
    overflow: auto;
  }

  .archive-pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .archive-pagination button {
    width: 2rem;
    height: 2rem;
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: 999px;
    background: rgba(20, 28, 38, 0.82);
    color: #f1f4f8;
    font: inherit;
  }

  .archive-pagination span {
    color: #a7b8c8;
    font-family: var(--ui-font-mono);
    font-size: 0.74rem;
  }

  .enemy-strip {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.35rem;
  }

  .enemy-strip .unit-tile {
    gap: 0.4rem;
    place-items: stretch;
    padding: 0.4rem 0.3rem;
  }

  .enemy-strip .unit-tile-art {
    width: 1.8rem;
    height: 1.8rem;
  }

  @media (max-width: 1280px) {

    :global(.overworld-shell) {
      height: auto;
      min-height: 100dvh;
      overflow: visible;
    }

    :global(.overworld-shell):global(.rifts-mode) {
      height: 100dvh;
      min-height: 100dvh;
      grid-template-rows: auto minmax(0, 1fr) auto;
      overflow: hidden;
    }

    :global(.overworld-shell):global(.rifts-mode) :global(.right-column) {
      display: none;
    }

    :global(.overworld-shell) :global(.right-column) {
      overflow: visible;
    }
  }

  @media (max-width: 820px) {
    .assigned-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .compact-list {
      grid-template-columns: 1fr;
    }
  }

</style>
