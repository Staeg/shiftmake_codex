<script lang="ts">
  import { onMount, tick } from 'svelte';
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
      body: ['This panel shows each Unit health bar and its Initiative bar below the health.'],
      placement: 'replay-low',
      targets: ['[data-ui-name="Collapsed event log health overview"]'],
    },
    'pause-resume': {
      title: 'Pause and Resume',
      body: ['You can control the playback.'],
      task: 'Pause the replay, then resume it.',
      placement: 'replay-low',
      targets: ['[data-tutorial-target="replay-play"]'],
    },
    'speed-change': {
      title: 'Replay Speed',
      body: ['Replay speed changes automatic playback rate. Default playback rate is 64x.'],
      task: 'Choose a different speed.',
      placement: 'replay-low',
      targets: ['[data-tutorial-target="replay-speed"]'],
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
    'manual-steps': {
      title: 'Manual Replay',
      body: ['Step controls move through replay events one by one.'],
      task: 'Use Next Step and Previous Step.',
      placement: 'replay-low',
      targets: ['[data-tutorial-target="replay-next-step"]', '[data-tutorial-target="replay-previous-step"]'],
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
    engagement: {
      title: 'Engagement',
      body: ['Engagement begins when a Unit enters melee with an enemy who is not yet bogged down, usually by moving into the same hex.'],
      placement: 'replay-top',
      targets: ['[data-ui-name="Replay focus panel"]'],
    },
    roles: {
      title: 'Roles',
      body: [
        'Frontline Units engage as many enemies as possible and hold ground.',
        'Chaff Units seek access to enemy backline by running past saturated enemy frontlines.',
        'Backline Units attack at range and preserve distance when possible.',
      ],
      placement: 'replay-top',
      targets: ['.focus-panel .inspect-chip', '[data-ui-name="Replay focus panel"]'],
      preferHigher: true,
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
      body: ['You start by picking two Faction and Troop Type combinations. Each shown Faction includes one predetermined starter Troop. Future Unlock troops are previews for options you might find later.'],
      placement: 'opening-top',
      targets: ['.draft-grid'],
    },
    'faction-toggle': {
      title: 'Faction Selection',
      body: ['Factions modify the stats of all their Troops. Take a look at the bonuses and minuses.'],
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
      body: ['Browse the offered Faction and Troop combinations and select one.'],
      task: 'Select an Included Starter troop and click the Confirm action at the bottom right.',
      placement: 'opening-top',
      targets: ['.opening-starter-tile', '.opening-confirm-troop-button'],
    },
    'confirm-openers': {
      title: 'Two Starters',
      body: ['Now select another one.'],
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
    essence: {
      title: 'Essence',
      body: ['Essence is the primary progress resource. It is usually spent in batches of 2, to unlock both a new Troop and an Upgrade.'],
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
      task: 'Lock an enemy Troop, then unlock it.',
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
        'Assigning Troops is usually pure upside, but it is not mandatory.',
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
  type Edge = 'left' | 'right' | 'top' | 'bottom';
  type EdgePoint = Point & { edge: Edge };
  type Arrow = { d: string };

  let popupEl: HTMLElement;
  let popupStyle = '';
  let popupBox: Rect | null = null;
  let targetRects: Rect[] = [];
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

  function visibleTargetGroups(): Rect[][] {
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
    return !!target?.closest('.tutorial-popup, .tutorial-arrows');
  }

  function arrowStart(target: Rect): EdgePoint {
    if (!popupBox) {
      return { x: 0, y: 0, edge: 'left' };
    }
    return nearestEdgePoint(popupBox, center(target));
  }

  function nearestEdgePoint(rect: Rect, point: Point): EdgePoint {
    const clamped = {
      x: clamp(point.x, rect.left, rect.right),
      y: clamp(point.y, rect.top, rect.bottom),
    };
    if (clamped.x !== point.x || clamped.y !== point.y) {
      const horizontalEdge = clamped.x === rect.left ? 'left' : clamped.x === rect.right ? 'right' : null;
      const verticalEdge = clamped.y === rect.top ? 'top' : clamped.y === rect.bottom ? 'bottom' : null;
      if (horizontalEdge && verticalEdge) {
        const horizontalDistance = Math.abs(point.x - clamped.x);
        const verticalDistance = Math.abs(point.y - clamped.y);
        return { ...clamped, edge: horizontalDistance >= verticalDistance ? horizontalEdge : verticalEdge };
      }
      return { ...clamped, edge: horizontalEdge ?? verticalEdge ?? 'left' };
    }

    const edges = [
      { distance: Math.abs(point.x - rect.left), x: rect.left, y: point.y, edge: 'left' as const },
      { distance: Math.abs(point.x - rect.right), x: rect.right, y: point.y, edge: 'right' as const },
      { distance: Math.abs(point.y - rect.top), x: point.x, y: rect.top, edge: 'top' as const },
      { distance: Math.abs(point.y - rect.bottom), x: point.x, y: rect.bottom, edge: 'bottom' as const },
    ];
    edges.sort((a, b) => a.distance - b.distance);
    return edges[0]!;
  }

  function edgeAxis(edge: Edge): 'x' | 'y' {
    return edge === 'left' || edge === 'right' ? 'y' : 'x';
  }

  function edgeRange(rect: Rect, edge: Edge): { min: number; max: number } {
    const padding = 14;
    return edgeAxis(edge) === 'y'
      ? { min: rect.top + padding, max: rect.bottom - padding }
      : { min: rect.left + padding, max: rect.right - padding };
  }

  function spreadEdgeValues(points: EdgePoint[], rectForPoint: (point: EdgePoint) => Rect, gap: number): EdgePoint[] {
    const byEdge = new Map<Edge, EdgePoint[]>();
    points.forEach((point) => byEdge.set(point.edge, [...(byEdge.get(point.edge) ?? []), point]));

    byEdge.forEach((group, edge) => {
      const axis = edgeAxis(edge);
      const ordered = [...group].sort((a, b) => a[axis] - b[axis]);
      ordered.forEach((point, index) => {
        const { min, max } = edgeRange(rectForPoint(point), edge);
        point[axis] = clamp(point[axis], min, max);
        if (index > 0) {
          point[axis] = Math.max(point[axis], ordered[index - 1]![axis] + gap);
        }
      });
      for (let index = ordered.length - 2; index >= 0; index -= 1) {
        const point = ordered[index]!;
        const { min, max } = edgeRange(rectForPoint(point), edge);
        point[axis] = clamp(Math.min(point[axis], ordered[index + 1]![axis] - gap), min, max);
      }
      ordered.forEach((point) => {
        const { min, max } = edgeRange(rectForPoint(point), edge);
        point[axis] = clamp(point[axis], min, max);
      });
    });

    return points;
  }

  function routeArrow(start: EdgePoint, end: EdgePoint): string {
    const horizontalOpposites =
      (start.edge === 'left' && end.edge === 'right') || (start.edge === 'right' && end.edge === 'left');
    if (horizontalOpposites) {
      const laneX = (start.x + end.x) / 2;
      return `M ${start.x} ${start.y} L ${laneX} ${start.y} L ${laneX} ${end.y} L ${end.x} ${end.y}`;
    }

    const verticalOpposites =
      (start.edge === 'top' && end.edge === 'bottom') || (start.edge === 'bottom' && end.edge === 'top');
    if (verticalOpposites) {
      const laneY = (start.y + end.y) / 2;
      return `M ${start.x} ${start.y} L ${start.x} ${laneY} L ${end.x} ${laneY} L ${end.x} ${end.y}`;
    }

    const stub = 16;
    const startOut =
      start.edge === 'left'
        ? { x: start.x - stub, y: start.y }
        : start.edge === 'right'
          ? { x: start.x + stub, y: start.y }
          : start.edge === 'top'
            ? { x: start.x, y: start.y - stub }
            : { x: start.x, y: start.y + stub };
    const endOut =
      end.edge === 'left'
        ? { x: end.x - stub, y: end.y }
        : end.edge === 'right'
          ? { x: end.x + stub, y: end.y }
          : end.edge === 'top'
            ? { x: end.x, y: end.y - stub }
            : { x: end.x, y: end.y + stub };

    const midpoint =
      start.edge === 'left' || start.edge === 'right'
        ? { x: startOut.x, y: endOut.y }
        : { x: endOut.x, y: startOut.y };

    return `M ${start.x} ${start.y} L ${startOut.x} ${startOut.y} L ${midpoint.x} ${midpoint.y} L ${endOut.x} ${endOut.y} L ${end.x} ${end.y}`;
  }

  $: arrows = (() => {
    const pairs = targetRects.map((target) => ({ target, start: arrowStart(target), end: nearestEdgePoint(target, arrowStart(target)) }));
    const starts = spreadEdgeValues(
      pairs.map((pair) => pair.start),
      () => popupBox ?? { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 },
      28,
    );
    const ends = spreadEdgeValues(
      pairs.map((pair) => pair.end),
      (point) => pairs.find((pair) => pair.end === point)?.target ?? { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 },
      16,
    );
    return pairs.map((pair, index): Arrow => ({ d: routeArrow(starts[index]!, ends[index]!) }));
  })();

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
      if (anchorFrame !== null) {
        cancelAnimationFrame(anchorFrame);
        anchorFrame = null;
      }
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
      <path d={arrow.d} marker-end="url(#tutorial-arrowhead)"></path>
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
  {#if progress.step === 'complete'}
    <button class="tutorial-continue" type="button" on:click={onFinish}>Finish Tutorial</button>
  {:else if !copy.task}
    <button class="tutorial-continue" type="button" on:click={onContinue} disabled={!progress.ready}>Continue</button>
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

  .tutorial-arrows > path {
    fill: none;
    stroke: #edc56f;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
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
