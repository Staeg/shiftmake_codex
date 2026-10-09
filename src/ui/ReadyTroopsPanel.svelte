<script lang="ts" context="module">
  import type { TroopId, UpgradeId } from '../engine/types';
  import type { DetailCard } from './detailCards';
  export interface ReadyTroopPlanning {
    editable: boolean;
    submitted: boolean;
    selectedTroopId: TroopId | null;
    hintTroopId: TroopId | null;
    attention: boolean;
    upgradeId: UpgradeId | null;
    selectTroop(troopId: TroopId, detail: DetailCard): void;
  }
  export interface ReadyTroopInspection {
    preview(detail: DetailCard): void;
    clear(): void;
    highlightedKeys: Set<string>;
  }
</script>
<script lang="ts">
  import type { GameState, RaceId, UnitClassId, ResolvedCombatantDefinition } from '../engine/types';
  import { getTroopEffectiveDefinition } from '../engine/army';
  import { upgradeAffectsTroop } from '../engine/upgrades';
  import { buildResolvedUnitDetail, unitIconCopies, unitIconColumns, unitIconDensityClass } from './detailCards';
  import { isCurrentTroopDropTarget as isCurrentDropTarget, type TroopAssignmentInteraction } from './troopAssignmentInteraction';

  export let game: GameState;
  export let planning: ReadyTroopPlanning;
  export let inspection: ReadyTroopInspection;
  export let interaction: TroopAssignmentInteraction;
  export let getRaceUnitPortrait: (raceId: RaceId, unitClassId: UnitClassId) => string;
  $: readyTroops = game.troops.filter(troop => troop.recoveryCyclesRemaining === 0 && troop.assignmentRiftId === null);
  const previewDetail = (detail: DetailCard) => inspection.preview(detail);
  const clearDetail = () => inspection.clear();
  function troopDetail(definition: ResolvedCombatantDefinition): DetailCard {
    return buildResolvedUnitDetail({ detailKey: `ready:${definition.troopInstanceId}`, label: definition.label,
      raceId: definition.raceId, unitClassId: definition.unitClassId, stats: definition.stats,
      quantity: definition.quantity, description: 'Available troop', abilities: definition.abilities,
      ...(definition.statBreakdowns ? { statBreakdowns: definition.statBreakdowns } : {}), getRaceUnitPortrait });
  }
  function upgradeAffected(game: GameState, troopId: TroopId, upgradeId: UpgradeId | null): boolean {
    const troop = game.troops.find(entry => entry.id === troopId);
    return !!upgradeId && !!troop && upgradeAffectsTroop(upgradeId, troop);
  }
</script>

          <div
            class="ready-troops-panel footer-ready-troops-panel ui-debug-target"
            data-ui-name="Available troops panel"
            class:drop-target-active={$interaction.drag?.active && isCurrentDropTarget($interaction.drag.dropTarget, 'ready')}
            role="region"
            aria-label="Available Troops drop zone"
            data-ready-drop-target={planning.editable ? 'true' : undefined}
            on:dragover={interaction.allowNativeDrop}
            on:drop={(event) => interaction.finishNativeDrop(event, { kind: 'ready' })}
          >
            {#if readyTroops.length === 0}
              <p class="assignment-empty">No idle troops are ready right now.</p>
            {:else}
              <div
                class="ready-troops-grid"
                class:roster-count-8={readyTroops.length >= 8}
                class:roster-count-12={readyTroops.length >= 12}
                class:roster-count-16={readyTroops.length >= 16}
              >
                {#each readyTroops as troop}
                  {@const troopDef = getTroopEffectiveDefinition(game, troop.id)}
                  {@const detail = troopDetail(troopDef)}
                    <button
                      class="unit-tile ready-troop-tile draggable-troop-tile ui-debug-target"
                      data-ui-name={`Available troop ${troopDef.label}`}
                      data-tutorial-target="ready-troop"
                      class:selected={planning.selectedTroopId === troop.id || inspection.highlightedKeys.has(detail.detailKey)}
                      class:dragging-source={$interaction.drag?.troopId === troop.id && $interaction.drag.active}
                      class:upgrade-affected={upgradeAffected(game, troop.id, planning.upgradeId)}
                      class:assignment-attention={planning.attention}
                      class:assignment-hint-troop={planning.hintTroopId === troop.id}
                      class:conflict-pulse={$interaction.conflict?.troopId === troop.id || $interaction.conflict?.conflictTroopId === troop.id}
                      class:readonly-plan={planning.submitted}
                      data-assignment-hint-troop={troop.id}
                    aria-label={planning.editable ? `Drag ${troopDef.label} to a Rift` : `Inspect ${troopDef.label}`}
                    on:pointerdown={(event) => {
                      if (planning.editable) {
                        interaction.startPointer(
                          event,
                          troop.id,
                          troop.assignmentRiftId,
                          troopDef.label,
                          getRaceUnitPortrait(troop.raceId, troop.unitClassId),
                        );
                      }
                    }}
                    on:mousedown={(event) => {
                      if (planning.editable) {
                        interaction.startMouse(
                          event,
                          troop.id,
                          troop.assignmentRiftId,
                          troopDef.label,
                          getRaceUnitPortrait(troop.raceId, troop.unitClassId),
                        );
                      }
                    }}
                    on:mouseenter={() => previewDetail(detail)}
                    on:focus={() => previewDetail(detail)}
                    on:mouseleave={clearDetail}
                    on:blur={clearDetail}
                    on:click={() => planning.selectTroop(troop.id, detail)}
                  >
                    <span class={`unit-icon-cluster tile-unit-cluster ${unitIconDensityClass(troopDef.quantity)}`} style={`--unit-cluster-columns:${unitIconColumns(troopDef.quantity)}`} aria-label={`${troopDef.quantity} ${troopDef.label} units`}>
                      {#each unitIconCopies(troopDef.quantity) as copy}
                        <img class="unit-tile-art available-bob-unit" style={`--bob-index:${copy}`} src={getRaceUnitPortrait(troop.raceId, troop.unitClassId)} alt="" aria-hidden={copy === 0 ? 'false' : 'true'} />
                      {/each}
                    </span>
                  </button>
                {/each}
              </div>
            {/if}
          </div>

<style>








.unit-tile {
    transition:
      transform 120ms ease,
      border-color 120ms ease,
      box-shadow 120ms ease,
      background 120ms ease;
  }
.unit-tile:hover {
    transform: none;
    border-color: rgba(213, 178, 116, 0.6);
    box-shadow:
      inset 0 0 0 1px rgba(213, 178, 116, 0.55),
      0 10px 22px rgba(0, 0, 0, 0.22);
  }
.unit-tile.selected {
    background:
      linear-gradient(145deg, rgba(44, 31, 15, 0.96), rgba(17, 22, 30, 0.96)),
      radial-gradient(circle at top left, rgba(212, 173, 115, 0.18), transparent 42%);
    box-shadow:
      inset 0 0 0 2px #d4ad73,
      0 10px 22px rgba(0, 0, 0, 0.22);
  }
.readonly-plan {
    cursor: help;
    opacity: 0.78;
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
.draggable-troop-tile {
    justify-content: stretch;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
.draggable-troop-tile:active {
    cursor: grabbing;
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
.dragging-source {
    opacity: 0.45;
    filter: grayscale(0.35);
  }
.unit-tile.upgrade-affected::after {
    content: '+';
    position: absolute;
    top: -0.35rem;
    right: -0.35rem;
    width: 1.35rem;
    height: 1.35rem;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: rgba(128, 229, 161, 0.28);
    border: 1px solid rgba(156, 244, 185, 0.72);
    color: #c8ffd5;
    font-weight: 900;
  }
.conflict-pulse {
    animation: conflict-pulse 680ms ease-out 0s 2;
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
.drop-target-active {
    border-color: rgba(218, 190, 140, 0.78);
    box-shadow:
      inset 0 0 0 2px rgba(218, 190, 140, 0.42),
      0 0 28px rgba(218, 190, 140, 0.18);
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
.assignment-empty {
    color: #a7b8c8;
  }
.ready-troop-tile.upgrade-affected {
    position: relative;
  }
.ready-troop-tile.upgrade-affected::after {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    content: '+';
    color: rgba(154, 255, 180, 0.72);
    font-size: 2.6rem;
    font-weight: 900;
    line-height: 1;
    pointer-events: none;
    text-shadow: 0 0 12px rgba(70, 211, 111, 0.44);
  }
.ready-troops-panel {
    gap: 0.55rem;
    padding: 0.25rem 0.4rem;
    border: 0;
    background: transparent;
    box-shadow: none;
  }
.footer-ready-troops-panel {
    width: min(620px, 100%);
    grid-column: 2;
    grid-row: 2;
    justify-self: center;
  }
.ready-troops-grid {
    display: grid;
    gap: 0.72rem;
    grid-template-columns: repeat(auto-fit, minmax(5.1rem, 6.3rem));
    align-items: start;
    justify-content: center;
    padding-bottom: 0.15rem;
  }
.ready-troop-tile {
    width: 6.3rem;
    height: 6.3rem;
    min-height: 0;
    padding: 0.55rem;
  }
.ready-troop-tile.assignment-attention {
    border-color: rgba(211, 176, 255, 0.72);
    animation: assignment-attention-pulse 800ms ease-in-out 0s 3;
    box-shadow:
      0 0 0 2px rgba(211, 176, 255, 0.2),
      0 0 28px rgba(155, 95, 220, 0.34),
      var(--ui-shadow-panel);
  }
.ready-troop-tile.assignment-hint-troop {
    border-color: rgba(150, 220, 184, 0.86);
    box-shadow:
      0 0 0 2px rgba(150, 220, 184, 0.24),
      0 0 24px rgba(76, 190, 135, 0.36),
      var(--ui-shadow-panel);
  }
.ready-troop-tile .available-bob-unit {
    animation: available-unit-bob calc(1450ms + (var(--bob-index) * 47ms)) ease-in-out infinite;
    animation-delay: calc(var(--bob-index) * -83ms);
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
.ready-troops-grid.roster-count-8 {
    grid-template-columns: repeat(auto-fit, minmax(4.6rem, 5.55rem));
  }
.ready-troops-grid.roster-count-8 .ready-troop-tile {
    width: 5.55rem;
    height: 5.55rem;
    padding: 0.45rem;
  }
.ready-troops-grid.roster-count-12 {
    grid-template-columns: repeat(auto-fit, minmax(4rem, 4.85rem));
  }
.ready-troops-grid.roster-count-12 .ready-troop-tile {
    width: 4.85rem;
    height: 4.85rem;
    padding: 0.35rem;
  }
.ready-troops-grid.roster-count-16 {
    grid-template-columns: repeat(auto-fit, minmax(3.45rem, 4.15rem));
  }
.ready-troops-grid.roster-count-16 .ready-troop-tile {
    width: 4.15rem;
    height: 4.15rem;
    padding: 0.26rem;
  }
.ready-troops-grid.roster-count-12 .unit-tile-art {
    width: 1.85rem;
    height: 1.85rem;
  }
.ready-troops-grid.roster-count-16 .unit-tile-art {
    width: 1.55rem;
    height: 1.55rem;
  }
@media (max-width: 820px) {.footer-ready-troops-panel {
      grid-column: 1;
    }
.footer-ready-troops-panel {
      justify-self: stretch;
    }}
</style>
