<script lang="ts">
  import { gameStore } from '../store/gameStore';
  import type { SaveSlotId } from '../store/saveSlots';
  import type { BattleReportDiagnostic, CampaignReportPayload, CampaignReportUiContext, TroopId } from '../engine/types';
  import type { CenterMode, ScreenMode } from '../store/gameStore';

  export let mode: 'menu' | 'campaign-button' | 'battle-button' = 'menu';
  export let selectedTroopId: TroopId | null = null;
  export let selectedReplayId: string | null = null;
  export let selectedRiftId: string | null = null;
  export let rendererDiagnostics: BattleReportDiagnostic[] = [];
  export let onCampaignImport: (selectedTroopId: TroopId | null, selectedReplayId: string | null) => void = () => {};

  let battleReportImportText = '';
  let battleReportMessage: string | null = null;
  let campaignReportImportText = '';
  let campaignReportMessage: string | null = null;
  let campaignReportPreview: CampaignReportPayload | null = null;
  let campaignReportImportSlotId: SaveSlotId = 1;
  let campaignReportOverwriteConfirmed = false;
  let ladderViewerMessage: string | null = null;
  let ladderRecords: Array<Record<string, any>> = [];
  let ladderStats: Record<string, any> | null = null;
  let ladderCycleFilter = '';
  let ladderGenerationFilter = '';
  let ladderSpentFilter = '';
  let ladderCompatibilityFilter = '';

  function slotPhaseLabel(phase?: string | null): string {
    return phase ? phase.replace(/_/g, ' ') : 'planning';
  }

  function diagnosticsForReplay(replayId: string | null | undefined): BattleReportDiagnostic[] {
    return rendererDiagnostics.filter((diagnostic) => !diagnostic.replayId || diagnostic.replayId === replayId);
  }

  function currentCampaignReportUiContext(): CampaignReportUiContext {
    return {
      screen: $gameStore.screen as ScreenMode,
      centerMode: $gameStore.centerMode as CenterMode,
      selectedRiftId,
      selectedTroopId,
      selectedReplayId,
      currentReplayStep: $gameStore.screen === 'replay' ? $gameStore.currentStep : null,
      systemMessage: $gameStore.systemMessage,
      validationMessages: [...$gameStore.validationMessages],
    };
  }

  function createCampaignReportString(): string | null {
    return gameStore.createCampaignReport(currentCampaignReportUiContext());
  }

  async function copyText(report: string | null, missingMessage: string, setMessage: (message: string) => void): Promise<void> {
    if (!report) {
      setMessage(missingMessage);
      return;
    }

    try {
      await navigator.clipboard.writeText(report);
      setMessage('Report copied. Paste it into an issue or share it with another agent.');
    } catch (error) {
      setMessage(error instanceof Error ? `Unable to copy report: ${error.message}` : 'Unable to copy report.');
    }
  }

  async function copyCampaignReport(): Promise<void> {
    await copyText(createCampaignReportString(), 'No active campaign is loaded to report.', (message) => {
      campaignReportMessage = message;
    });
  }

  async function copyLoadedReplayReport(): Promise<void> {
    const report = gameStore.createLoadedBattleReport($gameStore.currentStep, diagnosticsForReplay($gameStore.loadedReplay?.id));
    await copyText(report, 'Exact battle report is unavailable for this archived battle.', (message) => {
      battleReportMessage = message;
    });
  }

  function importBattleReport(): void {
    const result = gameStore.importBattleReport(battleReportImportText);
    if (!result.ok) {
      battleReportMessage = result.message;
      return;
    }
    battleReportMessage = `Imported battle report ${result.reportId}.`;
    battleReportImportText = '';
  }

  function previewCampaignReportImport(): void {
    const result = gameStore.previewCampaignReport(campaignReportImportText);
    if (!result.ok) {
      campaignReportPreview = null;
      campaignReportOverwriteConfirmed = false;
      campaignReportMessage = result.message;
      return;
    }

    campaignReportPreview = result.payload;
    campaignReportOverwriteConfirmed = false;
    campaignReportMessage = `Ready to import campaign report ${result.payload.reportId}.`;
  }

  function importCampaignReport(): void {
    if (!campaignReportPreview || !campaignReportOverwriteConfirmed) {
      campaignReportMessage = 'Preview the campaign report and confirm overwrite before importing.';
      return;
    }

    const result = gameStore.importCampaignReport(campaignReportImportText, campaignReportImportSlotId);
    if (!result.ok) {
      campaignReportMessage = result.message;
      return;
    }

    onCampaignImport(campaignReportPreview.uiContext.selectedTroopId, campaignReportPreview.uiContext.selectedReplayId);
    campaignReportMessage = `Imported campaign report ${result.reportId} into Slot ${campaignReportImportSlotId}.`;
    campaignReportImportText = '';
    campaignReportPreview = null;
    campaignReportOverwriteConfirmed = false;
  }

  function setCampaignReportImportSlot(event: Event): void {
    campaignReportImportSlotId = Number((event.currentTarget as HTMLSelectElement).value) as SaveSlotId;
    campaignReportOverwriteConfirmed = false;
  }

  async function uploadCampaignReport(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    campaignReportImportText = await file.text();
    previewCampaignReportImport();
    input.value = '';
  }

  function resetCampaignPreview(): void {
    campaignReportPreview = null;
    campaignReportOverwriteConfirmed = false;
  }

  function ladderBaseUrl(): string {
    return 'http://localhost:8787';
  }

  async function loadLadderRecords(): Promise<void> {
    const params = new URLSearchParams();
    if (ladderCycleFilter) params.set('cycleNumber', ladderCycleFilter);
    if (ladderGenerationFilter) params.set('generation', ladderGenerationFilter);
    if (ladderSpentFilter) params.set('spent', ladderSpentFilter);
    if (ladderCompatibilityFilter) params.set('compatibilityStatus', ladderCompatibilityFilter);
    params.set('limit', '50');
    try {
      const [listResponse, statsResponse] = await Promise.all([
        fetch(`${ladderBaseUrl()}/ladder/list?${params.toString()}`),
        fetch(`${ladderBaseUrl()}/ladder/stats`),
      ]);
      const listPayload = await listResponse.json();
      const statsPayload = await statsResponse.json();
      if (!listResponse.ok || !statsResponse.ok) {
        throw new Error(listPayload.error ?? statsPayload.error ?? 'Ladder viewer request failed.');
      }
      ladderRecords = listPayload.records ?? [];
      ladderStats = statsPayload;
      ladderViewerMessage = `Loaded ${ladderRecords.length} Ladder Rift-sets.`;
    } catch (error) {
      ladderViewerMessage = error instanceof Error ? error.message : 'Unable to load Ladder records.';
    }
  }
</script>

{#if mode === 'campaign-button'}
  <button
    class="debug-icon-button ui-debug-target"
    data-ui-name="Copy campaign report"
    on:click={() => void copyCampaignReport()}
    disabled={!$gameStore.activeSlotId}
    title="Copy current campaign state to report"
    aria-label="Copy current campaign state to report"
  >
    DBG
  </button>
{:else if mode === 'battle-button'}
  <button
    class="debug-icon-button ui-debug-target"
    data-ui-name="Copy battle report"
    on:click={() => void copyLoadedReplayReport()}
    disabled={!$gameStore.loadedReplayPayload}
    title="Copy current battle state to report"
    aria-label="Copy current battle state to report"
  >
    DBG
  </button>
{:else}
  <details class="debug-dropdown ui-debug-target" data-ui-name="Debug tools">
    <summary>Debug</summary>
    <div class="debug-dropdown-panel panel">
      <section class="debug-report-section">
        <p class="eyebrow">Campaign Report Import</p>
        <h2>Import Campaign</h2>
        <p>Paste or upload an SMCR1 campaign report, preview it, then choose which save slot to overwrite.</p>
        <textarea
          bind:value={campaignReportImportText}
          rows="4"
          placeholder="Paste an SMCR1 campaign report string here."
          on:input={resetCampaignPreview}
        ></textarea>
        <div class="actions-grid compact-actions">
          <button on:click={previewCampaignReportImport} disabled={campaignReportImportText.trim().length === 0}>Preview Campaign Report</button>
          <label class="file-button">
            Upload Report File
            <input type="file" accept=".txt,text/plain" on:change={(event) => void uploadCampaignReport(event)} />
          </label>
        </div>
        {#if campaignReportPreview}
          <div class="compact-list">
            <div>
              <span>Report</span>
              <strong>{campaignReportPreview.reportId}</strong>
            </div>
            <div>
              <span>Created</span>
              <strong>{new Date(campaignReportPreview.createdAt).toLocaleString()}</strong>
            </div>
            <div>
              <span>Campaign</span>
              <strong>Seed {campaignReportPreview.summary.campaignSeed} / Cycle {campaignReportPreview.summary.cycleNumber}</strong>
            </div>
            <div>
              <span>State</span>
              <strong>{slotPhaseLabel(campaignReportPreview.summary.phase)} / {campaignReportPreview.summary.victoryPoints} VP</strong>
            </div>
            <div>
              <span>Replays</span>
              <strong>{campaignReportPreview.summary.replayPayloadCount} bundled / {campaignReportPreview.summary.missingReplayCount} missing</strong>
            </div>
          </div>
          <div class="actions-grid compact-actions">
            <label>
              Import Into Slot
              <select value={campaignReportImportSlotId} on:change={setCampaignReportImportSlot}>
                <option value={1}>Slot 1</option>
                <option value={2}>Slot 2</option>
                <option value={3}>Slot 3</option>
              </select>
            </label>
            <label class="confirm-row">
              <input type="checkbox" bind:checked={campaignReportOverwriteConfirmed} />
              Overwrite Slot {campaignReportImportSlotId}
            </label>
            <button class="primary" on:click={importCampaignReport} disabled={!campaignReportOverwriteConfirmed}>
              Import Campaign Report
            </button>
          </div>
        {/if}
        {#if campaignReportMessage}
          <p class="system-message">{campaignReportMessage}</p>
        {/if}
      </section>

      <section class="debug-report-section">
        <p class="eyebrow">Battle Report Import</p>
        <h2>Inspect Battle</h2>
        <textarea
          bind:value={battleReportImportText}
          rows="3"
          placeholder="Paste an SMBR1 battle report string here to inspect an exact external battle."
        ></textarea>
        <button on:click={importBattleReport} disabled={battleReportImportText.trim().length === 0}>Import Battle Report</button>
        {#if battleReportMessage}
          <p class="system-message">{battleReportMessage}</p>
        {/if}
      </section>

      <section class="debug-report-section">
        <p class="eyebrow">Ladder Database</p>
        <h2>Inspect Rift-Sets</h2>
        <div class="actions-grid compact-actions">
          <label>
            Cycle
            <input bind:value={ladderCycleFilter} inputmode="numeric" placeholder="Any" />
          </label>
          <label>
            Generation
            <input bind:value={ladderGenerationFilter} inputmode="numeric" placeholder="Any" />
          </label>
          <label>
            Spent
            <select bind:value={ladderSpentFilter}>
              <option value="">Any</option>
              <option value="false">Unspent</option>
              <option value="true">Spent</option>
            </select>
          </label>
          <label>
            Compatibility
            <select bind:value={ladderCompatibilityFilter}>
              <option value="">Any</option>
              <option value="valid">Valid</option>
              <option value="incompatible">Incompatible</option>
            </select>
          </label>
          <button on:click={() => void loadLadderRecords()}>Load Ladder Records</button>
        </div>
        {#if ladderStats}
          <div class="compact-list">
            <div><span>Total</span><strong>{ladderStats.totalRows}</strong></div>
            <div><span>Valid</span><strong>{ladderStats.validRows}</strong></div>
            <div><span>Spent</span><strong>{ladderStats.spentRows}</strong></div>
            <div><span>Incompatible</span><strong>{ladderStats.incompatibleRows}</strong></div>
            <div><span>Payload Bytes</span><strong>{ladderStats.approximatePayloadBytes}</strong></div>
          </div>
        {/if}
        {#each ladderRecords as record}
          <details class="ladder-record">
            <summary>{record.id} / C{record.cycleNumber} / G{record.generation} / {record.compatibilityStatus}</summary>
            <div class="compact-list">
              <div><span>Source</span><strong>{record.sourceSetId ?? 'baseline'}</strong></div>
              <div><span>Appearances</span><strong>{record.appearances}</strong></div>
              <div><span>Spent</span><strong>{record.spent ? 'yes' : 'no'}</strong></div>
              <div><span>Issues</span><strong>{record.compatibilityIssues?.length ?? 0}</strong></div>
            </div>
            {#if record.compatibilityIssues?.length}
              <pre>{JSON.stringify(record.compatibilityIssues, null, 2)}</pre>
            {/if}
            {#each record.payload?.rifts ?? [] as rift}
              <details class="ladder-rift">
                <summary>{rift.id} / Tier {rift.tier} / VP {rift.victoryPoints}</summary>
                <pre>{JSON.stringify(rift, null, 2)}</pre>
              </details>
            {/each}
          </details>
        {/each}
        {#if ladderViewerMessage}
          <p class="system-message">{ladderViewerMessage}</p>
        {/if}
      </section>
    </div>
  </details>
{/if}

{#if mode === 'campaign-button' && campaignReportMessage}
  <p class="system-message campaign-report-message">{campaignReportMessage}</p>
{/if}

{#if mode === 'battle-button' && battleReportMessage}
  <p class="system-message replay-report-message">{battleReportMessage}</p>
{/if}

<style>
  .panel {
    display: grid;
    gap: var(--ui-space-md);
    border: 1px solid rgba(126, 157, 181, 0.18);
    border-radius: var(--ui-panel-radius);
    background: rgba(12, 18, 28, 0.96);
    padding: var(--ui-space-md);
    box-shadow: var(--ui-shadow-panel);
  }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
    gap: var(--ui-space-sm);
    align-items: end;
  }

  .compact-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--ui-space-sm);
  }

  .compact-list div {
    min-width: 0;
    display: grid;
    gap: 0.15rem;
    padding: 0.55rem 0.65rem;
    border: 1px solid rgba(126, 157, 181, 0.15);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(8, 13, 21, 0.56);
  }

  .compact-list span {
    color: var(--ui-color-text-dim);
    font-size: var(--ui-text-label);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .compact-list strong {
    overflow-wrap: anywhere;
  }

  textarea,
  select,
  input {
    width: 100%;
    border: 1px solid rgba(126, 157, 181, 0.25);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(6, 10, 18, 0.72);
    color: var(--ui-color-text);
    padding: var(--ui-space-sm);
    font: inherit;
  }

  pre {
    max-height: 16rem;
    overflow: auto;
    border: 1px solid rgba(126, 157, 181, 0.15);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(5, 8, 13, 0.72);
    padding: var(--ui-space-sm);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .ladder-record,
  .ladder-rift {
    display: grid;
    gap: var(--ui-space-sm);
    border: 1px solid rgba(126, 157, 181, 0.15);
    border-radius: var(--ui-panel-radius-tight);
    padding: var(--ui-space-sm);
  }

  textarea {
    min-height: 5rem;
    resize: vertical;
  }

  button,
  .file-button {
    min-height: var(--ui-space-hit);
    border: 1px solid rgba(126, 157, 181, 0.22);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(18, 27, 39, 0.88);
    color: var(--ui-color-text);
    font: inherit;
    padding: 0.55rem 0.7rem;
    cursor: pointer;
  }

  button.primary {
    border-color: rgba(213, 178, 116, 0.6);
    background: linear-gradient(135deg, var(--ui-color-accent-strong), var(--ui-color-accent-deep));
    color: #111;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  .file-button,
  .confirm-row {
    display: inline-flex;
    align-items: center;
    gap: var(--ui-space-xs);
  }

  .file-button input[type='file'] {
    display: none;
  }

  .system-message {
    padding: 0.65rem 0.75rem;
    border: 1px solid rgba(213, 178, 116, 0.25);
    border-radius: var(--ui-panel-radius-tight);
    background: rgba(26, 22, 15, 0.72);
    color: var(--ui-color-text);
  }

  .eyebrow {
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ui-color-accent);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }

  .debug-dropdown {
    position: relative;
    z-index: 20;
  }

  .debug-dropdown summary {
    list-style: none;
    min-height: 2.35rem;
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.52rem 0.8rem;
    border: 1px solid rgba(213, 178, 116, 0.32);
    border-radius: var(--ui-panel-radius-pill);
    background:
      linear-gradient(135deg, rgba(20, 27, 38, 0.92), rgba(9, 13, 21, 0.94)),
      radial-gradient(circle at top right, rgba(213, 178, 116, 0.18), transparent 44%);
    color: var(--ui-color-text);
    cursor: pointer;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-size: var(--ui-text-label);
  }

  .debug-dropdown summary::-webkit-details-marker {
    display: none;
  }

  .debug-dropdown summary::before {
    content: 'DBG';
    letter-spacing: 0;
  }

  .debug-dropdown-panel {
    position: absolute;
    top: calc(100% + 0.6rem);
    right: 0;
    width: min(620px, calc(100vw - 2rem));
    max-height: min(78vh, 760px);
    overflow: auto;
  }

  .debug-report-section {
    display: grid;
    gap: var(--ui-space-sm);
  }

  .debug-report-section + .debug-report-section {
    margin-top: var(--ui-space-xs);
    padding-top: var(--ui-space-md);
    border-top: 1px solid rgba(124, 153, 176, 0.18);
  }

  .debug-report-section h2 {
    font-size: 1.05rem;
  }

  .debug-report-section p {
    color: #a7b8c8;
  }

  .compact-actions {
    gap: var(--ui-space-xs);
  }

  .debug-icon-button {
    min-width: 2rem;
    min-height: 2rem;
    display: inline-grid;
    place-items: center;
    padding: 0 0.35rem;
    border: 1px solid rgba(213, 178, 116, 0.38);
    border-radius: 999px;
    background:
      radial-gradient(circle at 35% 25%, rgba(213, 178, 116, 0.28), transparent 44%),
      rgba(13, 19, 28, 0.88);
    color: #f4f7fb;
    font: inherit;
    font-size: 0.68rem;
    line-height: 1;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.03);
  }

  .debug-icon-button:hover:not(:disabled) {
    transform: translateY(-1px);
    border-color: rgba(236, 196, 123, 0.72);
    box-shadow:
      0 10px 18px rgba(0, 0, 0, 0.24),
      0 0 18px rgba(213, 178, 116, 0.12);
  }

  .debug-icon-button:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  @media (max-width: 820px) {
    .debug-dropdown,
    .debug-dropdown-panel {
      width: 100%;
    }

    .debug-dropdown-panel {
      position: static;
      margin-top: var(--ui-space-sm);
    }
  }
</style>
