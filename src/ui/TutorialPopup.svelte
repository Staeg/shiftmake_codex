<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import type { TutorialProgress, TutorialStepId } from '../store/tutorial';

  export let progress: TutorialProgress;
  export let onBack: () => void;
  export let onContinue: () => void;
  export let onFinish: () => void;

  type TutorialCopy = {
    title: string;
    body: string[];
    task?: string;
    placement: 'overworld-left' | 'replay-top' | 'replay-low' | 'menu-left' | 'opening-top';
    targets: string[];
    fallbackTargets?: string[];
    preferHigher?: boolean;
    avoidSelectors?: string[];
  };

  const COPY: Record<TutorialStepId, TutorialCopy> = {
    'watch-battle': {
      title: 'Archived Battle',
      body: ["The core part of the game is a battle. Let's jump straight into one to look at what's happening."],
      task: 'Click Watch Battle.',
      placement: 'overworld-left',
      targets: ['button[aria-label="Watch Battle"]'],
    },
    'battle-layout': {
      title: 'The Battlefield',
      body: [
        'Your units are on the left. The enemy is on the right.',
        'Battles resolve automatically. The replay is paused at the start so you can look around before anything moves.',
      ],
      placement: 'replay-top',
      targets: [],
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
    speed: {
      title: 'Stats',
      body: [
        'Each Troop Type has a baseline for each stat, and its Faction modifies most of them.',
        'Speed is one example. Hover it to inspect the breakdown and what the stat does.',
      ],
      task: "Hover the focused Unit's Speed.",
      placement: 'replay-top',
      targets: ['button[aria-label="Speed details"]'],
    },
    initiative: {
      title: 'Initiative',
      body: ['Each Unit starts battle with a small random amount of initiative. Then a usually invisible mechanism called Beats occur, adding the speed of each Unit to its Initiative, until any Unit has 100 or more. Then all Units with 100 or more Initiative take a turn in random order. Then Beats resume.'],
      task: "Hover a Unit's Initiative bar.",
      placement: 'replay-top',
      targets: ['.replay-initiative-row'],
    },
    play: {
      title: 'Playback',
      body: ['The replay is set to 1x for this step.'],
      task: 'Click Play, then Pause.',
      placement: 'replay-low',
      targets: ['[data-tutorial-target="replay-play"]'],
    },
    'timeline-show': {
      title: 'Live Timeline',
      body: ['Clicking the top of the Event Log changes the view to the Live Timeline.'],
      task: 'Click Show (or the surrounding area) on the Event Log.',
      placement: 'replay-low',
      targets: ['[data-ui-name="Toggle event log"]'],
    },
    'timeline-event': {
      title: 'Timeline Event',
      body: ['Clicking a step changes the battle map to what the battle looks like at that step.'],
      task: 'Click Event #101 in the Live Timeline.',
      placement: 'replay-low',
      targets: ['.event-log-wrap button[data-step="100"]'],
      fallbackTargets: ['[data-ui-name="Toggle event log"]'],
    },
    'unit-actions': {
      title: 'Unit Actions',
      body: ['While having selected a Unit, you can see the next and previous time its Initiative had reached 100 and it took a turn.'],
      task: "Select a Unit, then use Unit's Next Action and Unit's Previous Action.",
      placement: 'replay-low',
      targets: [
        '[data-tutorial-target="unit-next-action"]',
        '[data-tutorial-target="unit-previous-action"]',
        '[data-tutorial-target="battlefield-unit"]',
      ],
    },
    ability: {
      title: 'Abilities',
      body: ['Abilities add either active battle behavior or passive benefits.'],
      task: 'Find a Unit with an ability and hover that ability.',
      placement: 'replay-top',
      targets: ['.focus-panel .ability-chip'],
      fallbackTargets: ['button[data-tutorial-has-abilities="true"]', '[data-tutorial-target="battlefield-unit"][data-tutorial-has-abilities="true"]'],
      preferHigher: true,
      avoidSelectors: ['.focus-panel .inspect-tooltip'],
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
      body: ['The tutorial started with a finished battle to establish context - ultimately all choices are geared towards winning more battles with the smallest possible commitment. A run starts from the main menu.'],
      task: 'Click Singleplayer.',
      placement: 'menu-left',
      targets: ['button[data-ui-name="Main menu Singleplayer"]'],
    },
    'start-contest': {
      title: 'Contest vs AI',
      body: ['The guided start uses one particular mode, Contest vs AI, and stores it in a special tutorial save slot which you can access via selecting Tutorial from the main menu.'],
      task: 'Click Contest vs AI or Replace Contest vs AI.',
      placement: 'menu-left',
      targets: ['button[data-ui-name^="Start Contest vs AI"]', 'button[data-ui-name^="Replace Contest vs AI"]'],
    },
    opening: {
      title: 'Opening Selection',
      body: [
        'Troops are Faction + Troop Type packages: the Faction changes stats and abilities, while the Troop Type defines the battlefield role.',
        'Pick two different packages to begin your Contest roster.',
      ],
      task: 'Select two Faction + Troop packages, then click Begin Contest.',
      placement: 'opening-top',
      targets: ['.opening-starter-tile', '.opening-confirm-troop-button', '[data-ui-name="Begin campaign button"]'],
    },
    essence: {
      title: 'Essence',
      body: ['Essence is the primary progress resource. Spending Essence is necessary to grow your roster; it usually reveals a linked Troop and Upgrade draft for 2 Essence.'],
      task: 'Click Essence.',
      placement: 'overworld-left',
      targets: ['[data-tutorial-target="essence-counter"]'],
    },
    'reveal-draft': {
      title: 'Unlock Draft',
      body: ['Essence reveals linked Troop and Upgrade choices.'],
      task: 'Click Reveal Unlock Draft.',
      placement: 'overworld-left',
      targets: ['[data-tutorial-target="reveal-draft-button"]'],
    },
    'choose-draft': {
      title: 'Draft Choices',
      body: [
        'Select one Troop and one Upgrade.',
        'Some Upgrades affect Troops of one Type. Others affect all Troops of one Faction.',
        'Small icons on the right side of Upgrades show affected owned Troops, including the greyed out options you can pick in the current draft.',
      ],
      task: 'Confirm one Troop and one Upgrade.',
      placement: 'overworld-left',
      targets: [
        '[data-tutorial-target="draft-troop-option"]',
        '[data-tutorial-target="confirm-draft-troop"]',
        '[data-tutorial-target="draft-upgrade-option"]',
        '[data-tutorial-target="confirm-draft-upgrade"]',
      ],
    },
    'return-rifts': {
      title: 'Rifts',
      body: ['Return to the Rift board.'],
      task: 'Click Rifts.',
      placement: 'overworld-left',
      targets: ['[data-tutorial-target="rifts-view-button"]'],
    },
    'rift-enemies': {
      title: 'Rift Troops',
      body: ['Rifts show the neutral Guardians you must beat before you can establish control.'],
      task: 'Hover an enemy Troop.',
      placement: 'overworld-left',
      targets: ['[data-tutorial-target="rift-enemy"]'],
    },
    modifiers: {
      title: 'Modifiers',
      body: ['Modifiers change battle rules for that Rift. Inspect them before assigning Troops.'],
      task: 'Hover a Modifier.',
      placement: 'overworld-left',
      targets: ['[data-tutorial-target="rift-mutator"]'],
    },
    'assign-rift': {
      title: 'Assign Troops',
      body: [
        'A single Rift cannot take more than one Troop of the same Type or one Troop of the same Faction.',
      ],
      task: 'Drag any ready Troop to any Rift.',
      placement: 'overworld-left',
      targets: ['[data-tutorial-target="ready-troop"]', '[data-tutorial-target="rift-card"]'],
    },
    'end-cycle': {
      title: 'End Cycle',
      body: [
        'Every ready Troop must be assigned to a Rift before the Cycle can end.',
        'In Contest, held Rifts award Victory Points each Cycle equal to their Tier. All of these are Tier 1 Rifts.',
      ],
      task: 'Click End Cycle when ready.',
      placement: 'overworld-left',
      targets: ['[data-tutorial-target="end-cycle-button"]'],
    },
    'contest-results': {
      title: 'Contest Battles',
      body: [
        'If both you and your opponent (currently AI) attack the same Rift and beat the neutral Guardians, they fight each other.',
        'The final victor holds the Rift for VP each Cycle, but those forces cannot move until defeated.',
      ],
      placement: 'overworld-left',
      targets: ['[data-tutorial-target="archive-card"]', '[data-ui-name="Contest score counter"]'],
    },
    'archive-inspect': {
      title: 'Battle Details',
      body: ['Battle Archive entries can be inspected by clicking their non-eye area. You will be able to watch what happened in the battles by clicking the eye right after the tutorial.'],
      task: 'Click the non-eye part of an Archive entry.',
      placement: 'overworld-left',
      targets: ['[data-tutorial-target="archive-card"]'],
    },
    'rival-info': {
      title: 'Rival Info',
      body: ['The Rival Info tab shows known opponent Troops, Upgrades, and Rift commitments from the end of the last Cycle. Beware that the enemy will have access to a new Troop and Upgrade just like you.'],
      task: 'Click Rival Info.',
      placement: 'overworld-left',
      targets: ['[data-tutorial-target="rival-info-button"]'],
    },
    complete: {
      title: 'Tutorial Complete',
      body: [
        'Nice work. Campaign mode was not covered, and a couple of mechanisms (such as the unlocking of a new Faction during Cycle 3 and Cycle 7) were not covered.',
        'You can keep playing this Contest run; a good next step is opening a Replay from the finished battles.',
        'Or use Main Menu when you want to leave the tutorial save.',
      ],
      placement: 'overworld-left',
      targets: ['[data-tutorial-target="archive-card"]', '[data-ui-name="Return to main menu"]'],
    },
  };

  $: copy = COPY[progress.step];

  type Rect = { left: number; right: number; top: number; bottom: number; width: number; height: number };
  type Point = { x: number; y: number };
  const TUTORIAL_HIGHLIGHT_CLASS = 'tutorial-target-glow';

  let popupEl: HTMLElement;
  let popupStyle = '';
  let popupBox: Rect | null = null;
  let highlightedElements: Element[] = [];
  let mounted = false;
  let anchorFrame: number | null = null;
  let anchorStep: TutorialStepId | null = null;
  let lastPrimaryCenter: Point | null = null;

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

  function visibleTargetElementGroups(): Element[][] {
    if (typeof document === 'undefined') {
      return [];
    }

    const seen = new Set<Element>();
    const selectors = copy.targets.some((selector) => document.querySelector(selector))
      ? copy.targets
      : copy.fallbackTargets ?? copy.targets;

    return selectors.map((selector) =>
      [...document.querySelectorAll(selector)]
        .filter((element) => {
          if (seen.has(element)) {
            return false;
          }
          seen.add(element);
          return true;
        })
        .filter((element) => {
          const rect = rectOf(element);
          return rect.width > 4 && rect.height > 4 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
        }),
    );
  }

  function clearTutorialHighlights(): void {
    highlightedElements.forEach((element) => element.classList.remove(TUTORIAL_HIGHLIGHT_CLASS));
    highlightedElements = [];
  }

  function setTutorialHighlights(elements: Element[]): void {
    const next = [...new Set(elements)];
    highlightedElements
      .filter((element) => !next.includes(element))
      .forEach((element) => element.classList.remove(TUTORIAL_HIGHLIGHT_CLASS));
    next
      .filter((element) => !highlightedElements.includes(element))
      .forEach((element) => element.classList.add(TUTORIAL_HIGHLIGHT_CLASS));
    highlightedElements = next;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function overlapArea(a: Rect, b: Rect): number {
    const overlapWidth = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
    const overlapHeight = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return overlapWidth * overlapHeight;
  }

  function rectFitsViewport(rect: Rect): boolean {
    return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
  }

  function obstacleRects(): Rect[] {
    return [...document.querySelectorAll(['button', 'select', 'input', ...(copy.avoidSelectors ?? [])].join(','))]
      .map(rectOf)
      .filter((rect) => rect.width > 4 && rect.height > 4 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth);
  }

  function placeNearTarget(target: Rect, popupWidth: number, popupHeight: number, obstacles: Rect[]): Rect {
    const gap = 32;
    const margin = 8;
    const tc = center(target);
    const highTop = Math.max(margin, target.top - popupHeight - gap - 140);
    const rawCandidates = [
      { left: target.left - popupWidth - gap, top: tc.y - popupHeight / 2 },
      { left: target.right + gap, top: tc.y - popupHeight / 2 },
      { left: tc.x - popupWidth / 2, top: target.bottom + gap },
      { left: tc.x - popupWidth / 2, top: target.top - popupHeight - gap },
      ...(copy.avoidSelectors?.length
        ? [
            { left: innerWidth - popupWidth - margin, top: margin },
            { left: innerWidth - popupWidth - margin, top: innerHeight - popupHeight - margin },
            { left: margin, top: margin },
            { left: margin, top: innerHeight - popupHeight - margin },
          ]
        : []),
      ...(copy.preferHigher
        ? [
            { left: target.left - popupWidth - gap, top: highTop },
            { left: target.right + gap, top: highTop },
            { left: tc.x - popupWidth / 2, top: margin + 12 },
          ]
        : []),
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
      const lowerPenalty = copy.preferHigher && rect.top > target.top ? 9000 : 0;
      const higherBonus = copy.preferHigher && rect.bottom <= target.top ? -1800 : 0;
      return { rect, score: overlapArea(rect, target) * 20 + controlOverlap * 2 + moved + lowerPenalty + higherBonus };
    });
    scored.sort((a, b) => a.score - b.score);
    return scored[0]!.rect;
  }

  async function updateAnchor(): Promise<void> {
    if (!mounted) {
      return;
    }
    await tick();
    const visibleElementGroups = visibleTargetElementGroups();
    const visibleGroups = visibleElementGroups.map((group) => group.map(rectOf));
    const visible = visibleGroups.flat();
    const primaryGroup = visibleGroups.find((group) => group.length > 0);
    if (!popupEl || visible.length === 0 || !primaryGroup) {
      clearTutorialHighlights();
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
    const primaryCenter = center(primary);
    const primaryMovement = lastPrimaryCenter ? Math.hypot(primaryCenter.x - lastPrimaryCenter.x, primaryCenter.y - lastPrimaryCenter.y) : Number.POSITIVE_INFINITY;
    const canKeepPopup =
      anchorStep === progress.step &&
      popupBox &&
      rectFitsViewport(popupBox) &&
      primaryMovement < 24 &&
      overlapArea(popupBox, primary) === 0;
    if (!canKeepPopup) {
      popupBox = placeNearTarget(primary, popupEl.offsetWidth, popupEl.offsetHeight, obstacleRects());
    }
    anchorStep = progress.step;
    lastPrimaryCenter = primaryCenter;
    const targetIsClear = (target: Rect) => !popupBox || overlapArea(target, popupBox) === 0;
    const nearestPerGroupElements = visibleElementGroups
      .filter((group) => group.length > 0)
      .map((group) => {
        const nearest = [...group].sort((a, b) => distance(rectOf(a), primary) - distance(rectOf(b), primary));
        return nearest.find((target) => targetIsClear(rectOf(target))) ?? nearest[0]!;
    });
    const selectedElements = [...nearestPerGroupElements];
    setTutorialHighlights(selectedElements);
    popupStyle = `left:${popupBox.left}px; right:auto; top:${popupBox.top}px; bottom:auto; transform:none;`;
  }

  function scheduleAnchorUpdate(): void {
    if (!mounted || anchorFrame !== null) {
      return;
    }
    anchorFrame = requestAnimationFrame(() => {
      anchorFrame = null;
      void updateAnchor();
    });
  }

  function mutationBelongsToTutorial(mutation: MutationRecord): boolean {
    const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
    return !!target?.closest('.tutorial-popup') || target?.classList.contains(TUTORIAL_HIGHLIGHT_CLASS);
  }

  $: if (copy && mounted) {
    if (anchorStep !== progress.step) {
      anchorStep = null;
      lastPrimaryCenter = null;
    }
    scheduleAnchorUpdate();
  }

  onMount(() => {
    mounted = true;
    scheduleAnchorUpdate();
    const handleViewportChange = () => {
      anchorStep = null;
      scheduleAnchorUpdate();
    };
    const observer = new MutationObserver((mutations) => {
      if (mutations.every(mutationBelongsToTutorial)) {
        return;
      }
      scheduleAnchorUpdate();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);
    return () => {
      mounted = false;
      clearTutorialHighlights();
      if (anchorFrame !== null) {
        cancelAnimationFrame(anchorFrame);
        anchorFrame = null;
      }
      observer.disconnect();
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  });

  onDestroy(() => {
    clearTutorialHighlights();
  });
</script>

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
  {#if progress.step === 'complete'}
    <button class="tutorial-continue" type="button" on:click={onFinish}>Finish Tutorial</button>
  {:else if !copy.task}
    <button class="tutorial-continue" type="button" on:click={onContinue} disabled={!progress.ready}>Continue</button>
  {/if}
</aside>

<style>
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
    font-family: var(--ui-font-readable);
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
    color: #d9bd82;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  h2 {
    font-size: 1rem;
    font-weight: 700;
    letter-spacing: 0;
  }

  span,
  strong {
    font-size: 0.82rem;
    line-height: 1.38;
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

  .tutorial-continue:disabled {
    border-color: rgba(126, 157, 181, 0.32);
    background: #202a35;
    color: #8796a5;
    opacity: 0.72;
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
