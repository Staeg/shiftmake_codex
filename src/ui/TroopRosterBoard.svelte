<script lang="ts" context="module">
  import type { DetailCard } from './detailCards';
  export interface RosterInspection {
    preview(detail: DetailCard): void;
    clear(): void;
    pin(detail: DetailCard): void;
    highlightedKeys: Set<string>;
  }
</script>
<script lang="ts">
  import type { GameState, RaceId, TroopId, UnitClassId, TroopUnlockId, AbilityDefinition, ExplainedStatKey, StatBreakdown } from '../engine/types';
  import { getRaceTroops, getTroopEffectiveDefinition } from '../engine/army';
  import { RACES, RACE_UPGRADES, TROOP_CATALOG, getRace } from '../engine/unitCatalog';
  import { getAvailableTroopUnlockIds } from '../engine/upgrades';
  import { buildRaceDetail, buildUpgradeDetail, buildResolvedUnitDetail as buildResolvedUnitDetailModel,
    getUpgradeDetails, parseTroopUnlockId, unitIconCopies, unitIconColumns, unitIconDensityClass, type DetailCard } from './detailCards';
  import GameIcon from './GameIcon.svelte';
  export let game: GameState;
  export let selectedRaceId: RaceId | null;
  export let selectedTroopId: TroopId | null;
  export let inspection: RosterInspection;
  export let getRacePortrait: (raceId: RaceId) => string;
  export let getRaceUnitPortrait: (raceId: RaceId, unitClassId: UnitClassId) => string;
  export let selectRace: (raceId: RaceId, detail: DetailCard) => void;
  export let selectTroop: (troopId: TroopId, detail: DetailCard) => void;
  $: raceRosterIds = (Object.keys(RACES) as RaceId[]).filter(id => game.unlockedRaceIds.includes(id));
  const previewDetail = (detail: DetailCard) => inspection.preview(detail);
  const clearDetail = () => inspection.clear();
  const togglePinnedDetail = (detail: DetailCard) => inspection.pin(detail);
  const handleRaceHeaderClick = (id: RaceId, detail: DetailCard) => selectRace(id, detail);
  const handleRosterTroopClick = (id: TroopId, detail: DetailCard) => selectTroop(id, detail);
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


  function getAvailableRaceTroopUnlockIds(game: GameState, raceId: RaceId): TroopUnlockId[] {
    return getAvailableTroopUnlockIds(game).filter((troopUnlockId) => parseTroopUnlockId(troopUnlockId)[0] === raceId);
  }

</script>

<div class="race-grid troop-race-grid troops-mode">
          {#each raceRosterIds as raceId}
            {@const race = getRace(raceId)}
            {@const raceDetail = buildRaceDetail(raceId)}
            {@const raceUpgradeIds = game.raceUpgradeIds.filter((upgradeId) => RACE_UPGRADES[upgradeId]?.raceId === raceId)}
            <section class="race-card panel ui-debug-target" data-ui-name={`Race card ${race.label}`}>
              <header class="race-card-top">
                <button
                  class="title-button race-name-button ui-debug-target"
                  data-ui-name={`Race header ${race.label}`}
                  class:selected={inspection.highlightedKeys.has(raceDetail.detailKey) || selectedRaceId === raceId}
                  on:mouseenter={() => previewDetail(raceDetail)}
                  on:focus={() => previewDetail(raceDetail)}
                  on:mouseleave={clearDetail}
                  on:blur={clearDetail}
                  on:click={() => handleRaceHeaderClick(raceId, raceDetail)}
                >
                  <span>{race.label}</span>
                  <img class="race-name-art" src={getRacePortrait(raceId)} alt="" aria-hidden="true" />
                </button>

                {#if raceUpgradeIds.length > 0}
                  <div class="unlock-row race-card-upgrades">
                    {#each raceUpgradeIds as upgradeId}
                      {@const upgradeDetail = buildUpgradeDetail(upgradeId)}
                      <button
                        class="list-button ui-debug-target"
                        data-ui-name={`Race upgrade ${getUpgradeDetails(upgradeId).label}`}
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
                {/if}
              </header>

              <div class="troop-list race-troop-list">
                {#each getRaceTroops(game, raceId) as troop}
                  {@const troopDef = getTroopEffectiveDefinition(game, troop.id)}
                  {@const troopDetail = buildResolvedUnitDetail(
                    `troop:${troop.id}`,
                    troopDef.label,
                    troop.raceId,
                    troop.unitClassId,
                    troopDef.stats,
                    troopDef.quantity,
                    troop.assignmentRiftId
                      ? `Assigned to ${troop.assignmentRiftId}`
                      : troop.recoveryCyclesRemaining > 0
                        ? `Recovering ${troop.recoveryCyclesRemaining}`
                        : 'Available',
                    troopDef.abilities,
                    troopDef.statBreakdowns,
                  )}
                  <button
                    class="troop-chip ui-debug-target"
                    data-ui-name={`Troop chip ${troopDef.label}`}
                    class:selected={selectedTroopId === troop.id || inspection.highlightedKeys.has(troopDetail.detailKey)}
                    aria-label={`Inspect troop ${troopDef.label}`}
                    on:click={() => handleRosterTroopClick(troop.id, troopDetail)}
                    on:mouseenter={() => previewDetail(troopDetail)}
                    on:focus={() => previewDetail(troopDetail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                  >
                    <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
                      {#each unitIconCopies(troopDef.quantity) as copy}
                        <img class="unit-button-art" src={getRaceUnitPortrait(troop.raceId, troop.unitClassId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                      {/each}
                    </span>
                  </button>
                {/each}
              </div>

              {#if (selectedRaceId === raceId || inspection.highlightedKeys.has(raceDetail.detailKey)) && getAvailableRaceTroopUnlockIds(game, raceId).length > 0}
                <div class="available-troop-block">
                  <span class="assignment-label">Available Troop Classes</span>
                  <div class="troop-list race-troop-list">
                    {#each getAvailableRaceTroopUnlockIds(game, raceId) as troopUnlockId}
                      {@const [availableRaceId, unitClassId] = parseTroopUnlockId(troopUnlockId)}
                      {@const troopDef = TROOP_CATALOG[troopUnlockId]}
                      {@const troopDetail = buildResolvedUnitDetail(
                        `available:${troopUnlockId}`,
                        troopDef.label,
                        availableRaceId,
                        unitClassId,
                        troopDef.stats,
                        troopDef.quantity,
                        'Available for future troop drafts.',
                        troopDef.abilities,
                      )}
                      <button
                        class="troop-chip available-troop-chip ui-debug-target"
                        data-ui-name={`Available troop class ${troopDef.label}`}
                        class:selected={inspection.highlightedKeys.has(troopDetail.detailKey)}
                        aria-label={`Inspect available troop ${troopDef.label}`}
                        on:mouseenter={() => previewDetail(troopDetail)}
                        on:focus={() => previewDetail(troopDetail)}
                        on:mouseleave={clearDetail}
                        on:blur={clearDetail}
                        on:click={() => togglePinnedDetail(troopDetail)}
                      >
                        <span class={`unit-icon-cluster chip-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
                          {#each unitIconCopies(troopDef.quantity) as copy}
                            <img class="unit-button-art" src={getRaceUnitPortrait(availableRaceId, unitClassId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                          {/each}
                        </span>
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            </section>
          {/each}
        </div>

<style>






.assignment-label {
    color: var(--ui-color-text-dim);
    font-size: var(--ui-text-label);
    line-height: var(--ui-line-label);
  }

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
.list-button:hover {
    transform: none;
    border-color: rgba(213, 178, 116, 0.6);
    box-shadow:
      inset 0 0 0 1px rgba(213, 178, 116, 0.55),
      0 10px 22px rgba(0, 0, 0, 0.22);
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

.unit-button-art,
.race-name-art {
    image-rendering: pixelated;
    object-fit: contain;
    filter: drop-shadow(0 0 8px rgba(0, 0, 0, 0.28));
  }

.unit-button-art {
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

.race-grid {
    min-height: 100%;
  }

.troop-race-grid {
    min-height: 0;
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

.troop-race-grid {
    grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
    gap: 0.65rem;
    align-content: start;
  }

.race-card {
    padding: var(--ui-space-sm);
  }

.troops-mode .race-card {
    gap: 0.55rem;
    padding: 0.7rem;
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

.available-troop-block {
    display: grid;
    gap: 0.4rem;
    padding-top: 0.15rem;
  }

.available-troop-chip {
    border-style: dashed;
    opacity: 0.82;
  }

.troop-chip {
    padding: var(--ui-space-sm);
  }

.troops-mode .troop-list,
.troops-mode .unlock-row {
    gap: 0.45rem;
  }

.troops-mode .troop-list {
    grid-template-columns: repeat(auto-fit, var(--troop-icon-box-size, 3.8rem));
    justify-content: start;
  }

.troops-mode .race-card {
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
  }

.troops-mode .troop-chip,
.troops-mode .list-button {
    padding: 0.55rem 0.65rem;
  }

.troops-mode .troop-chip {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    place-items: center;
    width: var(--troop-icon-box-size, 3.8rem);
    height: var(--troop-icon-box-size, 3.8rem);
    aspect-ratio: 1;
    justify-content: center;
    min-height: 0;
  }

.troops-mode .unit-button-art {
    width: 2.2rem;
    height: 2.2rem;
  }
</style>
