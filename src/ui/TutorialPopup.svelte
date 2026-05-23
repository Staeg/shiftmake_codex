<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { TutorialProgress, TutorialStepId } from '../store/tutorial';

  export let progress: TutorialProgress;
  export let onBack: () => void;
  export let onContinue: () => void;

  type TutorialCopy = {
    title: string;
    body: string[];
    task?: string;
    placement: 'overworld-left' | 'replay-top' | 'replay-low' | 'menu-left' | 'opening-top';
    targets: string[];
  };

  const COPY: Record<TutorialStepId, TutorialCopy> = {
    'watch-battle': {
      title: 'Archived Battle',
      body: ['This archive entry shows fight details without replay playback.'],
      task: 'Click Watch Battle.',
      placement: 'overworld-left',
      targets: ['button[aria-label="Watch Battle"]'],
    },
    'unit-hover': {
      title: 'Unit Inspect',
      body: ['The inspect panel shows the focused Unit.'],
      task: 'Hover a Unit, then move the pointer away.',
      placement: 'replay-top',
      targets: ['button[data-ui-name^="Health overview"]', '[data-tutorial-target="battlefield-unit"]'],
    },
    'unit-lock': {
      title: 'Unit Lock',
      body: ['Clicking a Unit locks inspection until it is clicked again.'],
      task: 'Lock a Unit, then unlock it.',
      placement: 'replay-top',
      targets: ['button[data-ui-name^="Health overview"]', '[data-tutorial-target="battlefield-unit"]'],
    },
    stats: {
      title: 'Stats',
      body: ['Stats describe how a Unit resolves battle actions. Hover a stat to inspect its breakdown.'],
      placement: 'replay-top',
      targets: ['[data-ui-name="Replay focus panel"]'],
    },
    speed: {
      title: 'Speed',
      body: ['Speed is one stat example. Each Troop Type has a baseline. Its Faction modifies most stats.'],
      task: "Hover the focused Unit's Speed.",
      placement: 'replay-top',
      targets: ['button[aria-label="Speed details"]'],
    },
    initiative: {
      title: 'Initiative',
      body: ['Speed adds Initiative on each battle beat. A Unit acts after Initiative reaches 100 and then spends 100 Initiative.'],
      placement: 'replay-top',
      targets: ['.replay-initiative-row'],
    },
    play: {
      title: 'Playback',
      body: ['The replay is set to 1x for this step.'],
      task: 'Click Play.',
      placement: 'replay-low',
      targets: ['[data-tutorial-target="replay-play"]'],
    },
    overview: {
      title: 'Health Overview',
      body: ['The collapsed Event Log view shows each Unit health bar and Initiative bar during playback.'],
      placement: 'replay-low',
      targets: ['[data-ui-name="Collapsed event log health overview"]'],
    },
    'pause-resume': {
      title: 'Pause and Resume',
      body: ['Replay playback can stop and resume at the current step.'],
      task: 'Pause the replay, then resume it.',
      placement: 'replay-low',
      targets: ['[data-tutorial-target="replay-play"]'],
    },
    'speed-change': {
      title: 'Replay Speed',
      body: ['Replay speed changes automatic playback rate. Normal replay playback defaults to 64x.'],
      task: 'Choose a different speed.',
      placement: 'replay-low',
      targets: ['[data-tutorial-target="replay-speed"]'],
    },
    'timeline-show': {
      title: 'Live Timeline',
      body: ['The Event Log expands into the Live Timeline.'],
      task: 'Click Show on the Event Log.',
      placement: 'replay-low',
      targets: ['[data-ui-name="Toggle event log"]'],
    },
    'timeline-event': {
      title: 'Timeline Event',
      body: ['A timeline event selects its replay step.'],
      task: 'Click Event #101 in the Live Timeline.',
      placement: 'replay-low',
      targets: ['.event-log-wrap button[data-step="100"]'],
    },
    'manual-steps': {
      title: 'Manual Replay',
      body: ['Step controls move through replay events manually.'],
      task: 'Use Next Step and Previous Step.',
      placement: 'replay-low',
      targets: ['[data-tutorial-target="replay-next-step"]', '[data-tutorial-target="replay-previous-step"]'],
    },
    'unit-actions': {
      title: 'Unit Actions',
      body: ['Locked Unit action buttons jump to that Unit action steps.'],
      task: "Select a Unit, then use Unit's Next Action and Unit's Previous Action.",
      placement: 'replay-low',
      targets: [
        '[data-tutorial-target="unit-next-action"]',
        '[data-tutorial-target="unit-previous-action"]',
        '[data-tutorial-target="battlefield-unit"]',
      ],
    },
    engagement: {
      title: 'Engagement',
      body: ['Capacity limits the enemy Size a Unit can engage. Engagement links Units in melee until it is cleared.'],
      placement: 'replay-top',
      targets: ['[data-ui-name="Replay focus panel"]'],
    },
    roles: {
      title: 'Roles',
      body: [
        'Frontline Units block and engage first.',
        'Chaff Units seek access to enemy backline.',
        'Backline Units attack at range and preserve distance when possible.',
      ],
      placement: 'replay-top',
      targets: ['.focus-panel .inspect-chip', '[data-ui-name="Replay focus panel"]'],
    },
    ability: {
      title: 'Abilities',
      body: ['Abilities add conditional battle behavior. Inspect their chips on a Unit.'],
      task: 'Find a Unit with an ability and hover that ability.',
      placement: 'replay-top',
      targets: ['.focus-panel .ability-chip', 'button[data-ui-name^="Health overview"]', '[data-tutorial-target="battlefield-unit"]'],
    },
    'finish-replay': {
      title: 'Replay End',
      body: ['Finish the battle at any pace. 64x automatic playback is recommended.'],
      task: 'Reach the final replay step.',
      placement: 'replay-low',
      targets: ['[data-tutorial-target="replay-play"]', '[data-tutorial-target="replay-speed"]'],
    },
    'game-start': {
      title: 'Game Start',
      body: ['The tutorial started with a finished battle to establish replay context. A run starts from Singleplayer.'],
      placement: 'menu-left',
      targets: ['.slot-grid'],
    },
    'start-contest': {
      title: 'Contest vs AI',
      body: ['The guided start uses Contest vs AI and stores it in the tutorial save.'],
      task: 'Click Contest vs AI or Replace Contest vs AI.',
      placement: 'menu-left',
      targets: ['button[data-ui-name^="Start Contest vs AI"]', 'button[data-ui-name^="Replace Contest vs AI"]'],
    },
    opening: {
      title: 'Opening Selection',
      body: ['Choose two Factions. Each shown Faction includes one predetermined starter Troop. Future Unlock troops are previews.'],
      placement: 'opening-top',
      targets: ['.draft-grid'],
    },
    'faction-toggle': {
      title: 'Faction Selection',
      body: ['Faction selection stages its included starter Troop.'],
      task: 'Select a Faction, then deselect it.',
      placement: 'opening-top',
      targets: ['.opening-card-select-button'],
    },
    'future-toggle': {
      title: 'Future Unlocks',
      body: ['Future Unlock troops can be inspected before they are available.'],
      task: 'Select a Future Unlock troop preview, then deselect it.',
      placement: 'opening-top',
      targets: ['.opening-future-tile'],
    },
    starter: {
      title: 'Included Starter',
      body: ['An Included Starter tile stages the shown starter Troop for confirmation.'],
      task: 'Select an Included Starter troop and inspect the Confirm action at the bottom right.',
      placement: 'opening-top',
      targets: ['.opening-starter-tile', '.opening-confirm-troop-button'],
    },
    'confirm-openers': {
      title: 'Two Starters',
      body: ['Confirm two starter Factions and their included Troops.'],
      task: 'Confirm two opening Troops.',
      placement: 'opening-top',
      targets: ['.opening-confirm-troop-button', '.opening-starter-tile'],
    },
    begin: {
      title: 'Begin',
      body: ['The opening is ready after two starter Troops are confirmed.'],
      task: 'Click Begin.',
      placement: 'opening-top',
      targets: ['[data-ui-name="Begin campaign button"]'],
    },
    complete: {
      title: 'Tutorial Coverage Complete',
      body: ['This tutorial stops after game start. Later coverage will address the remaining overworld systems.'],
      placement: 'overworld-left',
      targets: ['[data-ui-name="Show rifts view"]'],
    },
  };

  $: copy = COPY[progress.step];

  type Rect = { left: number; right: number; top: number; bottom: number; width: number; height: number };
  type Arrow = { x1: number; y1: number; x2: number; y2: number };

  let popupEl: HTMLElement;
  let popupStyle = '';
  let popupBox: Rect | null = null;
  let targetRects: Rect[] = [];
  let mounted = false;

  function rectOf(element: Element): Rect {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    };
  }

  function center(rect: Rect): { x: number; y: number } {
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function distance(a: Rect, b: Rect): number {
    const ac = center(a);
    const bc = center(b);
    return Math.hypot(ac.x - bc.x, ac.y - bc.y);
  }

  function visibleTargetGroups(): Rect[][] {
    if (typeof document === 'undefined') {
      return [];
    }

    const seen = new Set<Element>();
    return copy.targets.map((selector) =>
      [...document.querySelectorAll(selector)]
        .filter((element) => {
          if (seen.has(element)) {
            return false;
          }
          seen.add(element);
          return true;
        })
        .map(rectOf)
        .filter((rect) => rect.width > 4 && rect.height > 4 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth),
    );
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function overlapArea(a: Rect, b: Rect): number {
    const overlapWidth = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const overlapHeight = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return overlapWidth * overlapHeight;
  }

  function obstacleRects(): Rect[] {
    return [...document.querySelectorAll('button, select, input')]
      .map(rectOf)
      .filter((rect) => rect.width > 4 && rect.height > 4 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth);
  }

  function placeNearTarget(target: Rect, popupWidth: number, popupHeight: number, obstacles: Rect[]): Rect {
    const gap = 18;
    const margin = 8;
    const tc = center(target);
    const rawCandidates = [
      { left: target.left - popupWidth - gap, top: tc.y - popupHeight / 2 },
      { left: target.right + gap, top: tc.y - popupHeight / 2 },
      { left: tc.x - popupWidth / 2, top: target.bottom + gap },
      { left: tc.x - popupWidth / 2, top: target.top - popupHeight - gap },
    ];
    const candidates = rawCandidates.map((raw) => ({
      left: clamp(raw.left, margin, innerWidth - popupWidth - margin),
      top: clamp(raw.top, margin, innerHeight - popupHeight - margin),
    }));
    const scored = candidates.map((candidate, index) => {
      const rect = {
        left: candidate.left,
        right: candidate.left + popupWidth,
        top: candidate.top,
        bottom: candidate.top + popupHeight,
        width: popupWidth,
        height: popupHeight,
      };
      const moved = Math.hypot(candidate.left - rawCandidates[index]!.left, candidate.top - rawCandidates[index]!.top);
      const controlOverlap = obstacles
        .filter((obstacle) => overlapArea(obstacle, target) < obstacle.width * obstacle.height * 0.8)
        .reduce((total, obstacle) => total + overlapArea(rect, obstacle), 0);
      return { rect, score: overlapArea(rect, target) * 20 + controlOverlap * 2 + moved };
    });
    scored.sort((a, b) => a.score - b.score);
    return scored[0]!.rect;
  }

  async function updateAnchor(): Promise<void> {
    if (!mounted) {
      return;
    }
    await tick();
    const visibleGroups = visibleTargetGroups();
    const visible = visibleGroups.flat();
    const primaryGroup = visibleGroups.find((group) => group.length > 0);
    if (!popupEl || visible.length === 0 || !primaryGroup) {
      targetRects = [];
      popupBox = null;
      popupStyle = '';
      return;
    }
    const viewCenter = {
      left: innerWidth / 2,
      right: innerWidth / 2,
      top: innerHeight / 2,
      bottom: innerHeight / 2,
      width: 0,
      height: 0,
    };
    const primary = [...primaryGroup].sort((a, b) => distance(a, viewCenter) - distance(b, viewCenter))[0]!;
    popupBox = placeNearTarget(primary, popupEl.offsetWidth, popupEl.offsetHeight, obstacleRects());
    const targetIsClear = (target: Rect) => !popupBox || overlapArea(target, popupBox) < target.width * target.height * 0.15;
    const nearestPerGroup = visibleGroups
      .filter((group) => group.length > 0)
      .map((group) => {
        const nearest = [...group].sort((a, b) => distance(a, primary) - distance(b, primary));
        return nearest.find(targetIsClear) ?? nearest[0]!;
      });
    const minimumTargets = Math.max(3, nearestPerGroup.length);
    targetRects = [...nearestPerGroup];
    [...visible]
      .sort((a, b) => distance(a, primary) - distance(b, primary))
      .forEach((target) => {
        if (targetRects.length < minimumTargets && targetIsClear(target) && !targetRects.includes(target)) {
          targetRects = [...targetRects, target];
        }
      });
    popupStyle = `left:${popupBox.left}px; right:auto; top:${popupBox.top}px; bottom:auto; transform:none;`;
  }

  function arrowStart(target: Rect): { x: number; y: number } {
    if (!popupBox) {
      return { x: 0, y: 0 };
    }
    return nearestEdgePoint(popupBox, center(target));
  }

  function nearestEdgePoint(rect: Rect, point: { x: number; y: number }): { x: number; y: number } {
    const clamped = {
      x: clamp(point.x, rect.left, rect.right),
      y: clamp(point.y, rect.top, rect.bottom),
    };
    if (clamped.x !== point.x || clamped.y !== point.y) {
      return clamped;
    }

    const edges = [
      { distance: Math.abs(point.x - rect.left), x: rect.left, y: point.y },
      { distance: Math.abs(point.x - rect.right), x: rect.right, y: point.y },
      { distance: Math.abs(point.y - rect.top), x: point.x, y: rect.top },
      { distance: Math.abs(point.y - rect.bottom), x: point.x, y: rect.bottom },
    ];
    edges.sort((a, b) => a.distance - b.distance);
    return { x: edges[0]!.x, y: edges[0]!.y };
  }

  $: arrows = targetRects.map((target): Arrow => {
    const start = arrowStart(target);
    const end = nearestEdgePoint(target, start);
    return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  });

  $: if (copy && mounted) {
    void updateAnchor();
  }

  onMount(() => {
    mounted = true;
    void updateAnchor();
    const handleViewportChange = () => void updateAnchor();
    const observer = new MutationObserver(() => void updateAnchor());
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      mounted = false;
      observer.disconnect();
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  });
</script>

{#if arrows.length > 0}
  <svg class="tutorial-arrows" aria-hidden="true">
    <defs>
      <marker id="tutorial-arrowhead" markerWidth="8" markerHeight="8" refX="6.6" refY="3.5" orient="auto">
        <path d="M0,0 L7,3.5 L0,7 Z"></path>
      </marker>
    </defs>
    {#each arrows as arrow}
      <line x1={arrow.x1} y1={arrow.y1} x2={arrow.x2} y2={arrow.y2} marker-end="url(#tutorial-arrowhead)"></line>
    {/each}
  </svg>
{/if}

<aside bind:this={popupEl} style={popupStyle} class={`tutorial-popup ${copy.placement}`} aria-live="polite" data-ui-name={`Tutorial step ${progress.step}`}>
  <button class="tutorial-back" type="button" aria-label="Previous tutorial step" on:click={onBack}>&lt;-</button>
  <div class="tutorial-copy">
    <p>Tutorial</p>
    <h2>{copy.title}</h2>
    {#each copy.body as line}
      <span>{line}</span>
    {/each}
    {#if copy.task}
      <strong>{copy.task}</strong>
    {/if}
  </div>
  {#if progress.ready && progress.step !== 'complete'}
    <button class="tutorial-continue" type="button" on:click={onContinue}>Continue</button>
  {/if}
</aside>

<style>
  .tutorial-arrows {
    position: fixed;
    inset: 0;
    z-index: 29;
    width: 100vw;
    height: 100vh;
    overflow: visible;
    pointer-events: none;
  }

  .tutorial-arrows line {
    stroke: #edc56f;
    stroke-width: 1.5;
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.9));
  }

  .tutorial-arrows marker path {
    fill: #edc56f;
  }

  .tutorial-popup {
    position: fixed;
    z-index: 30;
    width: min(23rem, calc(100vw - 1rem));
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.55rem;
    padding: 0.72rem;
    border: 1px solid rgba(237, 197, 111, 0.78);
    border-radius: 8px;
    background: rgba(9, 13, 20, 0.96);
    color: #f5f1e6;
    box-shadow: 0 16px 38px rgba(0, 0, 0, 0.48);
    pointer-events: none;
  }

  .overworld-left,
  .menu-left {
    left: 0.7rem;
    bottom: 0.7rem;
  }

  .replay-top {
    left: 50%;
    top: 0.65rem;
    transform: translateX(-50%);
  }

  .replay-low {
    left: 50%;
    bottom: 0.65rem;
    transform: translateX(-50%);
  }

  .opening-top {
    left: 0.7rem;
    bottom: 0.7rem;
  }

  .tutorial-copy {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }

  p,
  h2 {
    margin: 0;
  }

  p {
    color: #d0ad67;
    font-size: 0.63rem;
    font-weight: 800;
    text-transform: uppercase;
  }

  h2 {
    font-size: 0.98rem;
    letter-spacing: 0;
  }

  span,
  strong {
    font-size: 0.78rem;
    line-height: 1.32;
  }

  strong {
    color: #ffe1a1;
  }

  button {
    border: 1px solid #4b5d70;
    border-radius: 6px;
    background: #1c2631;
    color: inherit;
    cursor: pointer;
    font: inherit;
    pointer-events: auto;
  }

  .tutorial-back {
    align-self: start;
    width: 1.7rem;
    height: 1.7rem;
    padding: 0;
    font-weight: 800;
  }

  .tutorial-continue {
    grid-column: 2;
    justify-self: end;
    min-height: 1.9rem;
    padding: 0.25rem 0.65rem;
    border-color: rgba(237, 197, 111, 0.72);
    background: #9a611e;
    font-weight: 800;
  }

  @media (max-width: 720px) {
    .tutorial-popup {
      left: 0.5rem;
      right: auto;
      top: auto;
      bottom: 0.5rem;
      transform: none;
      width: calc(100vw - 1rem);
    }

    .tutorial-popup.replay-top,
    .tutorial-popup.replay-low {
      top: 21rem;
      bottom: auto;
    }
  }
</style>
