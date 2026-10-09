<script lang="ts" context="module">
  import type { DetailCard } from './detailCards';
  export interface RivalInspection {
    preview(detail: DetailCard): void;
    clear(): void;
    pin(detail: DetailCard): void;
    highlightedKeys: Set<string>;
  }
</script>
<script lang="ts">
  import type { GameState, RaceId, UnitClassId, ContestPlayerState, UpgradeId, AbilityDefinition, ExplainedStatKey, StatBreakdown } from '../engine/types';
  import { resolveTroopCombatant } from '../engine/army';
  import { RACES, RACE_UPGRADES, getRace } from '../engine/unitCatalog';
  import { buildRaceDetail, buildUpgradeDetail, buildResolvedUnitDetail as buildResolvedUnitDetailModel,
    getUpgradeDetails, unitIconCopies, unitIconColumns, unitIconDensityClass, type DetailCard } from './detailCards';
  import GameIcon from './GameIcon.svelte';
  export let game: GameState;
  export let inspection: RivalInspection;
  export let getRacePortrait: (raceId: RaceId) => string;
  export let getRaceUnitPortrait: (raceId: RaceId, unitClassId: UnitClassId) => string;
  $: opponentInfo = game.gameMode === 'contest' ? game.contest?.opponentInfo ?? null : null;
  $: opponentInfoAi = opponentInfo?.playerTwo ?? null;
  $: opponentInfoRaceIds = opponentInfoAi ? (Object.keys(RACES) as RaceId[]).filter(id => opponentInfoAi!.unlockedRaceIds.includes(id)) : [];
  $: currentOpponentOccupyingTroopIds = new Set(game.openRifts.filter(rift => rift.occupyingPlayerId === 'playerTwo').flatMap(rift => rift.occupyingTroopIds ?? []));
  const previewDetail = (detail: DetailCard) => inspection.preview(detail);
  const clearDetail = () => inspection.clear();
  const togglePinnedDetail = (detail: DetailCard) => inspection.pin(detail);
  function getOpponentRaceUpgradeIds(opponent: ContestPlayerState, raceId: RaceId): UpgradeId[] {
    return opponent.raceUpgradeIds.filter(id => RACE_UPGRADES[id]?.raceId === raceId);
  }
  function buildResolvedUnitDetail(
    detailKey: string,
    label: string,
    raceId: RaceId,
    unitClassId: UnitClassId,
    stats: { health: number; damage: number; rate: number; move: number; armor: number; range: number; capacity: number; size?: number },
    quantity: number,
    description: string,
    abilities: AbilityDefinition[],
    statBreakdowns?: Partial<Record<ExplainedStatKey | 'quantity', StatBreakdown>>,
  ): DetailCard {
    return buildResolvedUnitDetailModel({
      detailKey,
      label,
      raceId,
      unitClassId,
      stats,
      quantity,
      description,
      abilities,
      statBreakdowns,
      getRaceUnitPortrait,
    });
  }


</script>

<div class="opponent-info-board">
          {#if !opponentInfo || !opponentInfoAi}
            <div class="opponent-empty-state panel ui-debug-target" data-ui-name="Opponent info unknown">
              <p class="eyebrow">Rival Info</p>
              <h2>No Intel Yet</h2>
              <p>Contest details appear after the rival has completed a cycle.</p>
            </div>
          {:else}
            {#if opponentInfoAi.troopClassUpgradeIds.length > 0}
              <section class="panel opponent-upgrades-panel ui-debug-target" data-ui-name="Opponent troop class upgrades">
                <p class="eyebrow">Troop Class Upgrades</p>
                <div class="unlock-row opponent-upgrade-row">
                  {#each opponentInfoAi.troopClassUpgradeIds as upgradeId}
                    {@const upgradeDetail = buildUpgradeDetail(upgradeId)}
                    <button
                      class="list-button opponent-upgrade-chip"
                      class:selected={inspection.highlightedKeys.has(upgradeDetail.detailKey)}
                      on:mouseenter={() => previewDetail(upgradeDetail)}
                      on:focus={() => previewDetail(upgradeDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => togglePinnedDetail(upgradeDetail)}
                    >
                      <span class="icon-label"><GameIcon kind="upgrade" id={upgradeId} label={getUpgradeDetails(upgradeId).label} /><span>{getUpgradeDetails(upgradeId).label}</span></span>
                    </button>
                  {/each}
                </div>
              </section>
            {/if}

            <div class="race-grid opponent-race-grid">
              {#each opponentInfoRaceIds as raceId}
                {@const race = getRace(raceId)}
                {@const raceDetail = buildRaceDetail(raceId)}
                {@const raceUpgradeIds = getOpponentRaceUpgradeIds(opponentInfoAi, raceId)}
                {@const raceTroops = opponentInfoAi.troops.filter((troop) => troop.raceId === raceId)}
                <section class="race-card panel opponent-race-card ui-debug-target" data-ui-name={`Opponent race card ${race.label}`}>
                  <header class="race-card-top opponent-race-card-top">
                    <button
                      class="title-button race-name-button ui-debug-target"
                      data-ui-name={`Opponent race header ${race.label}`}
                      class:selected={inspection.highlightedKeys.has(raceDetail.detailKey)}
                      on:mouseenter={() => previewDetail(raceDetail)}
                      on:focus={() => previewDetail(raceDetail)}
                      on:mouseleave={clearDetail}
                      on:blur={clearDetail}
                      on:click={() => togglePinnedDetail(raceDetail)}
                    >
                      <span>{race.label}</span>
                      <img class="race-name-art" src={getRacePortrait(raceId)} alt="" aria-hidden="true" />
                    </button>

                    <div class="unlock-row race-card-upgrades">
                      {#if raceUpgradeIds.length === 0}
                        <span class="mutator-chip empty">No known race upgrades</span>
                      {:else}
                        {#each raceUpgradeIds as upgradeId}
                          {@const upgradeDetail = buildUpgradeDetail(upgradeId)}
                          <button
                            class="list-button ui-debug-target"
                            data-ui-name={`Opponent race upgrade ${getUpgradeDetails(upgradeId).label}`}
                            class:selected={inspection.highlightedKeys.has(upgradeDetail.detailKey)}
                            on:mouseenter={() => previewDetail(upgradeDetail)}
                            on:focus={() => previewDetail(upgradeDetail)}
                            on:mouseleave={clearDetail}
                            on:blur={clearDetail}
                            on:click={() => togglePinnedDetail(upgradeDetail)}
                          >
                            <span class="icon-label"><GameIcon kind="upgrade" id={upgradeId} label={getUpgradeDetails(upgradeId).label} /><span>{getUpgradeDetails(upgradeId).label}</span></span>
                          </button>
                        {/each}
                      {/if}
                    </div>
                  </header>

                  <div class="troop-list race-troop-list opponent-troop-list">
                    {#each raceTroops as troop}
                      {@const troopDef = resolveTroopCombatant(opponentInfoAi, troop, 'enemy', null, `known-player-two:${troop.id}`)}
                      {@const isMobileThreat = !currentOpponentOccupyingTroopIds.has(troop.id)}
                      {@const troopDetail = buildResolvedUnitDetail(
                        `opponent:${opponentInfo.cycleNumber}:${troop.id}`,
                        troopDef.label,
                        troop.raceId,
                        troop.unitClassId,
                        troopDef.stats,
                        troopDef.quantity,
                        isMobileThreat ? 'Known opponent troop not currently holding any Rift.' : 'Known opponent troop currently holding a Rift.',
                        troopDef.abilities,
                        troopDef.statBreakdowns,
                      )}
                      <button
                        class="troop-chip opponent-troop-chip ui-debug-target"
                        class:opponent-threat={isMobileThreat}
                        data-ui-name={`Opponent troop ${troopDef.label}`}
                        class:selected={inspection.highlightedKeys.has(troopDetail.detailKey)}
                        aria-label={`Inspect opponent troop ${troopDef.label}`}
                        on:mouseenter={() => previewDetail(troopDetail)}
                        on:focus={() => previewDetail(troopDetail)}
                        on:mouseleave={clearDetail}
                        on:blur={clearDetail}
                        on:click={() => togglePinnedDetail(troopDetail)}
                      >
                        <span class={`unit-icon-cluster tile-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
                          {#each unitIconCopies(troopDef.quantity) as copy}
                            <img class="unit-tile-art" src={getRaceUnitPortrait(troop.raceId, troop.unitClassId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                          {/each}
                        </span>
                      </button>
                    {/each}
                  </div>
                </section>
              {/each}
            </div>
          {/if}
        </div>

<style>










.unlock-row button {
    border: 1px solid rgba(126, 157, 181, 0.2);
    border-radius: var(--ui-panel-radius-tight);
    background: var(--ui-color-surface-interactive);
    color: var(--ui-color-text);
    padding: var(--ui-space-sm);
    font: inherit;
  }

@keyframes rifts-button-attention {
    0%,
100% {
      box-shadow:
        0 0 0 0 rgba(244, 205, 118, 0.16),
        inset 0 0 0 1px rgba(244, 205, 118, 0.14);
    }
    50% {
      box-shadow:
        0 0 0 3px rgba(244, 205, 118, 0.14),
        0 0 16px rgba(244, 205, 118, 0.18),
        inset 0 0 0 1px rgba(244, 205, 118, 0.34);
    }
  }







@keyframes tutorial-target-pulse {
    0%,
100% {
      outline-color: rgba(119, 185, 255, 0.56);
      filter: drop-shadow(0 0 4px rgba(103, 179, 255, 0.36));
    }

    50% {
      outline-color: rgba(151, 207, 255, 0.96);
      filter: drop-shadow(0 0 12px rgba(103, 179, 255, 0.7));
    }
  }

.center-column {
    min-height: 0;
    display: grid;
    gap: 0.75rem;
    align-content: start;
    overflow: auto;
    padding-right: 0.2rem;
  }





.race-grid {
    display: grid;
    gap: var(--ui-space-md);
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

.troop-list,
.unlock-row {
    display: grid;
    gap: var(--ui-space-sm);
  }

.troop-chip,
.title-button,
.list-button {
    text-align: left;
  }

.list-button {
    display: grid;
    gap: 0.25rem;
    align-items: center;
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

.troop-chip,
.list-button {
    transition:
      transform 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease,
      background 120ms ease;
  }

.troop-chip:hover,
.list-button:hover,
.mutator-chip:hover {
    transform: none;
    border-color: rgba(213, 178, 116, 0.6);
    box-shadow:
      inset 0 0 0 1px rgba(213, 178, 116, 0.55),
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

.mutator-chip.empty {
    color: #95a9ba;
  }

.race-card {
    display: grid;
    gap: var(--ui-space-sm);
    align-content: start;
  }

@keyframes rift-force-group-now {
    0%,
100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

@keyframes rift-force-group-now-loses {
    0%,
56.8% {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: none;
    }
    100% {
      opacity: 0;
      transform: translateY(0.35rem) scale(0.86);
      filter: grayscale(1) brightness(0.68);
    }
  }

@keyframes rift-force-group-now-loses-late {
    0%,
59.5% {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: none;
    }
    100% {
      opacity: 0;
      transform: translateY(0.35rem) scale(0.86);
      filter: grayscale(1) brightness(0.68);
    }
  }

@keyframes rift-force-group-late {
    0%,
32.4% {
      opacity: 0;
      transform: translateY(-0.15rem) scale(0.9);
    }
    39.2%,
100% {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

@keyframes rift-force-group-late-loses {
    0%,
32.4% {
      opacity: 0;
      transform: translateY(-0.15rem) scale(0.9);
      filter: none;
    }
    39.2%,
59.5% {
      opacity: 1;
      transform: translateY(0) scale(1);
      filter: none;
    }
    100% {
      opacity: 0;
      transform: translateY(0.35rem) scale(0.86);
      filter: grayscale(1) brightness(0.68);
    }
  }

@keyframes rift-mini-phase-late {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

.title-button {
    width: 100%;
  }

.troop-chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.9rem;
  }

@keyframes conflict-pulse {
    0%,
100% {
      box-shadow: inset 0 0 0 1px rgba(238, 243, 246, 0.16);
    }
    45% {
      box-shadow:
        inset 0 0 0 3px rgba(255, 96, 96, 0.74),
        0 0 24px rgba(255, 80, 80, 0.34);
    }
  }

.unit-tile-art,
.race-name-art {
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

.race-name-art {
    width: 2.6rem;
    height: 2.6rem;
  }

.race-name-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
  }

@keyframes incoming-archive-row-expand {
    from {
      height: 0;
      margin-top: 0;
      margin-bottom: 0;
    }
    to {
      height: calc(var(--battle-log-row-height, 3.35rem));
      margin-top: 0;
      margin-bottom: 0;
    }
  }

@keyframes incoming-archive-card-fly {
    0% {
      width: var(--flight-from-width, 8rem);
      height: var(--flight-from-height, 3rem);
      opacity: 1;
      transform: translate(var(--flight-from-x), var(--flight-from-y));
      filter: brightness(1.18) saturate(1.12);
    }
    58% {
      width: var(--flight-from-width, 8rem);
      height: var(--flight-from-height, 3rem);
    }
    82% {
      width: var(--flight-to-width, 15rem);
      height: var(--flight-to-height, 3.35rem);
      transform: translate(var(--flight-to-x), var(--flight-to-y));
      filter: brightness(1.12) saturate(1.08);
    }
    100% {
      width: var(--flight-to-width, 15rem);
      height: var(--flight-to-height, 3.35rem);
      opacity: 1;
      transform: translate(var(--flight-to-x), var(--flight-to-y));
      filter: none;
    }
  }

@keyframes incoming-flight-mini-fade {
    0%,
54% {
      opacity: 1;
    }
    86%,
100% {
      opacity: 0;
    }
  }

@keyframes incoming-flight-archive-fade {
    0%,
54% {
      opacity: 0;
    }
    86%,
100% {
      opacity: 1;
    }
  }

@keyframes copy-indicator-pop {
    from {
      opacity: 0;
      transform: translateY(0.18rem) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

.race-card > header {
    display: grid;
    gap: var(--ui-space-xs);
  }

.center-column {
    min-width: 0;
    grid-auto-rows: minmax(0, 1fr);
    align-content: stretch;
  }

:global(.race-grid),
.opponent-info-board {
    min-height: 100%;
  }

@keyframes available-unit-bob {
    0%,
100% {
      translate: 0 0;
    }
    50% {
      translate: 0 -5px;
    }
  }

@keyframes assignment-arrow-flow {
    to {
      stroke-dashoffset: -24;
    }
  }

@keyframes assignment-attention-pulse {
    0%,
100% {
      border-color: rgba(211, 176, 255, 0.54);
      box-shadow:
        0 0 0 1px rgba(211, 176, 255, 0.14),
        0 0 14px rgba(155, 95, 220, 0.2),
        var(--ui-shadow-panel);
    }
    50% {
      border-color: rgba(238, 216, 255, 0.94);
      box-shadow:
        0 0 0 3px rgba(211, 176, 255, 0.28),
        0 0 32px rgba(184, 108, 255, 0.5),
        var(--ui-shadow-panel);
    }
  }

.race-grid {
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    align-items: start;
  }

.opponent-info-board {
    display: grid;
    gap: var(--ui-space-md);
    align-content: start;
  }

.opponent-upgrades-panel {
    align-content: start;
  }

.opponent-empty-state {
    min-height: 100%;
  }

.opponent-upgrade-row {
    display: flex;
    flex-wrap: wrap;
  }

.opponent-upgrade-chip {
    min-width: 0;
  }

.opponent-race-grid {
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 0.65rem;
  }

.opponent-race-card-top {
    grid-template-columns: minmax(140px, 0.85fr) minmax(170px, 1.15fr);
  }

.opponent-troop-list {
    grid-template-columns: repeat(auto-fit, var(--troop-icon-box-size, 3.8rem));
    justify-content: start;
  }

.opponent-troop-chip {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    place-items: stretch;
    width: var(--troop-icon-box-size, 3.8rem);
    height: var(--troop-icon-box-size, 3.8rem);
    min-height: 0;
    aspect-ratio: 1;
    gap: 0;
  }

.opponent-troop-chip.opponent-threat {
    border-color: rgba(221, 106, 94, 0.72);
    background:
      linear-gradient(145deg, rgba(48, 20, 18, 0.92), rgba(17, 22, 30, 0.96)),
      radial-gradient(circle at top left, rgba(221, 106, 94, 0.18), transparent 42%);
    box-shadow: inset 0 0 0 1px rgba(221, 106, 94, 0.24);
  }

.race-card {
    padding: var(--ui-space-sm);
  }

.race-name-button {
    width: 100%;
  }

.race-card-top {
    display: grid;
    grid-template-columns: minmax(150px, 0.9fr) minmax(170px, 1.1fr);
    gap: 0.55rem;
    align-items: stretch;
  }

.race-card-top .race-name-button {
    min-height: 4.5rem;
  }

.race-card-upgrades {
    gap: 0.35rem;
  }

.race-card-upgrades .list-button {
    min-height: 2rem;
  }

.race-troop-list {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 0.45rem;
  }

.troop-chip {
    padding: var(--ui-space-sm);
  }
</style>
