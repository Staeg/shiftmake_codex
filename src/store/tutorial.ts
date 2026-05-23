import { resolveBattle } from '../engine/battle';
import {
  applyCycleOutcomes,
  assignTroopToRift,
  claimOpeningTroop,
  getOpeningFactionOptionIds,
  getOpeningFactionStarterTroopUnlockIds,
  resolveAssignedRifts,
  startNewGame,
  startOpeningCampaign,
} from '../engine/game';
import type { GameState, ReplayPayloadWrite, TroopUnlockId } from '../engine/types';

export const TUTORIAL_SAVE_ID = 'tutorial' as const;
export const TUTORIAL_CAMPAIGN_SEED = 20_260_522;
export const TUTORIAL_BATTLE_SEED = 20_260_523;

export type TutorialAction =
  | 'watch-battle'
  | 'unit-hover'
  | 'unit-unhover'
  | 'unit-lock'
  | 'unit-unlock'
  | 'speed-hover'
  | 'play'
  | 'pause'
  | 'resume'
  | 'speed-change'
  | 'event-log-show'
  | 'event-select'
  | 'step-next'
  | 'step-previous'
  | 'unit-next-action'
  | 'unit-previous-action'
  | 'ability-hover'
  | 'replay-end'
  | 'singleplayer'
  | 'start-contest'
  | 'faction-select'
  | 'faction-deselect'
  | 'future-select'
  | 'future-deselect'
  | 'starter-pending'
  | 'opening-confirmed'
  | 'begin'
  | 'essence-view'
  | 'reveal-draft'
  | 'draft-troop'
  | 'draft-upgrade'
  | 'rifts-view'
  | 'rift-enemy-lock'
  | 'rift-enemy-unlock'
  | 'mutator-hover'
  | 'assign-troop'
  | 'end-cycle'
  | 'cycle-animation-finished'
  | 'archive-inspect'
  | 'rival-info';

export type TutorialStepId =
  | 'watch-battle'
  | 'battle-layout'
  | 'unit-hover'
  | 'unit-lock'
  | 'speed'
  | 'initiative'
  | 'play'
  | 'overview'
  | 'pause-resume'
  | 'speed-change'
  | 'timeline-show'
  | 'timeline-event'
  | 'manual-steps'
  | 'unit-actions'
  | 'engagement'
  | 'roles'
  | 'ability'
  | 'finish-replay'
  | 'game-start'
  | 'start-contest'
  | 'opening'
  | 'faction-toggle'
  | 'future-toggle'
  | 'starter'
  | 'confirm-openers'
  | 'begin'
  | 'essence'
  | 'reveal-draft'
  | 'choose-draft'
  | 'return-rifts'
  | 'rift-enemies'
  | 'modifiers'
  | 'assign-rift'
  | 'end-cycle'
  | 'contest-results'
  | 'archive-inspect'
  | 'rival-info'
  | 'complete';

export type TutorialSurface = 'archive' | 'replay' | 'main-menu' | 'singleplayer' | 'opening' | 'overworld';

export interface TutorialProgress {
  step: TutorialStepId;
  ready: boolean;
  signals: TutorialAction[];
  completed: boolean;
}

export interface TutorialFixture {
  game: GameState;
  replayWrites: ReplayPayloadWrite[];
}

const TUTORIAL_PROGRESS_KEY = 'shiftmake:tutorial:progress:v1';

const STEP_ORDER: TutorialStepId[] = [
  'watch-battle',
  'battle-layout',
  'unit-hover',
  'unit-lock',
  'speed',
  'initiative',
  'play',
  'overview',
  'pause-resume',
  'speed-change',
  'timeline-show',
  'timeline-event',
  'manual-steps',
  'unit-actions',
  'engagement',
  'roles',
  'ability',
  'finish-replay',
  'game-start',
  'start-contest',
  'opening',
  'faction-toggle',
  'future-toggle',
  'starter',
  'confirm-openers',
  'begin',
  'essence',
  'reveal-draft',
  'choose-draft',
  'return-rifts',
  'rift-enemies',
  'modifiers',
  'assign-rift',
  'end-cycle',
  'contest-results',
  'archive-inspect',
  'rival-info',
  'complete',
];

const CONTINUE_STEPS = new Set<TutorialStepId>([
  'battle-layout',
  'initiative',
  'overview',
  'engagement',
  'roles',
  'opening',
  'contest-results',
  'complete',
]);

const REPLAY_STEPS = new Set<TutorialStepId>([
  'battle-layout',
  'unit-hover',
  'unit-lock',
  'speed',
  'initiative',
  'play',
  'overview',
  'pause-resume',
  'speed-change',
  'timeline-show',
  'timeline-event',
  'manual-steps',
  'unit-actions',
  'engagement',
  'roles',
  'ability',
  'finish-replay',
]);

const OPENING_STEPS = new Set<TutorialStepId>([
  'opening',
  'faction-toggle',
  'future-toggle',
  'starter',
  'confirm-openers',
  'begin',
]);

const TROOPS_VIEW_STEPS = new Set<TutorialStepId>(['reveal-draft', 'choose-draft']);

const RIFTS_VIEW_STEPS = new Set<TutorialStepId>([
  'return-rifts',
  'rift-enemies',
  'modifiers',
  'assign-rift',
  'end-cycle',
  'contest-results',
  'archive-inspect',
]);

function nextStep(step: TutorialStepId): TutorialStepId {
  return STEP_ORDER[Math.min(STEP_ORDER.indexOf(step) + 1, STEP_ORDER.length - 1)] ?? step;
}

function previousStep(step: TutorialStepId): TutorialStepId {
  return STEP_ORDER[Math.max(STEP_ORDER.indexOf(step) - 1, 0)] ?? step;
}

export function getPreviousTutorialStep(step: TutorialStepId): TutorialStepId {
  return previousStep(step);
}

export function getTutorialStepSurface(step: TutorialStepId): TutorialSurface {
  if (step === 'watch-battle') {
    return 'archive';
  }
  if (REPLAY_STEPS.has(step)) {
    return 'replay';
  }
  if (step === 'game-start') {
    return 'main-menu';
  }
  if (step === 'start-contest') {
    return 'singleplayer';
  }
  if (OPENING_STEPS.has(step)) {
    return 'opening';
  }
  return 'overworld';
}

export function getTutorialStepCenterMode(step: TutorialStepId): 'rifts' | 'troops' | 'contest' {
  if (TROOPS_VIEW_STEPS.has(step)) {
    return 'troops';
  }
  if (step === 'rival-info') {
    return 'contest';
  }
  if (RIFTS_VIEW_STEPS.has(step)) {
    return 'rifts';
  }
  return 'rifts';
}

function withAction(progress: TutorialProgress, action: TutorialAction): TutorialProgress {
  return progress.signals.includes(action) ? progress : { ...progress, signals: [...progress.signals, action] };
}

function advance(progress: TutorialProgress): TutorialProgress {
  const step = nextStep(progress.step);
  return {
    step,
    ready: CONTINUE_STEPS.has(step),
    signals: [],
    completed: step === 'complete',
  };
}

function actionSatisfied(progress: TutorialProgress, ...actions: TutorialAction[]): boolean {
  return actions.every((action) => progress.signals.includes(action));
}

export function makeTutorialProgress(): TutorialProgress {
  return {
    step: 'watch-battle',
    ready: false,
    signals: [],
    completed: false,
  };
}

export function readTutorialProgress(storage: Storage): TutorialProgress | null {
  const raw = storage.getItem(TUTORIAL_PROGRESS_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as TutorialProgress;
    return STEP_ORDER.includes(parsed.step) &&
      typeof parsed.ready === 'boolean' &&
      typeof parsed.completed === 'boolean' &&
      Array.isArray(parsed.signals)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function writeTutorialProgress(storage: Storage, progress: TutorialProgress | null): void {
  if (!progress) {
    storage.removeItem(TUTORIAL_PROGRESS_KEY);
    return;
  }
  storage.setItem(TUTORIAL_PROGRESS_KEY, JSON.stringify(progress));
}

export function continueTutorial(progress: TutorialProgress): TutorialProgress {
  return progress.ready ? advance(progress) : progress;
}

export function rewindTutorial(progress: TutorialProgress): TutorialProgress {
  const step = previousStep(progress.step);
  return {
    step,
    ready: CONTINUE_STEPS.has(step),
    signals: [],
    completed: false,
  };
}

export function recordTutorialAction(progress: TutorialProgress, action: TutorialAction): TutorialProgress {
  if (progress.completed || progress.step === 'complete') {
    return progress;
  }

  const next = withAction(progress, action);
  switch (next.step) {
    case 'watch-battle':
      return action === 'watch-battle' ? advance(next) : next;
    case 'unit-hover':
      return actionSatisfied(next, 'unit-hover', 'unit-unhover') ? advance(next) : next;
    case 'unit-lock':
      return actionSatisfied(next, 'unit-lock', 'unit-unlock') ? advance(next) : next;
    case 'speed':
      return action === 'speed-hover' ? advance(next) : next;
    case 'play':
      return action === 'play' ? advance(next) : next;
    case 'pause-resume':
      return actionSatisfied(next, 'pause', 'resume') ? advance(next) : next;
    case 'speed-change':
      return action === 'speed-change' ? advance(next) : next;
    case 'timeline-show':
      return action === 'event-log-show' ? advance(next) : next;
    case 'timeline-event':
      return action === 'event-select' ? advance(next) : next;
    case 'manual-steps':
      return actionSatisfied(next, 'step-next', 'step-previous') ? advance(next) : next;
    case 'unit-actions':
      return actionSatisfied(next, 'unit-next-action', 'unit-previous-action') ? advance(next) : next;
    case 'ability':
      return action === 'ability-hover' ? advance(next) : next;
    case 'finish-replay':
      return action === 'replay-end' ? advance(next) : next;
    case 'game-start':
      return action === 'singleplayer' ? advance(next) : next;
    case 'start-contest':
      return action === 'start-contest' ? advance(next) : next;
    case 'faction-toggle':
      return actionSatisfied(next, 'faction-select', 'faction-deselect') ? advance(next) : next;
    case 'future-toggle':
      return actionSatisfied(next, 'future-select', 'future-deselect') ? advance(next) : next;
    case 'starter':
      return action === 'starter-pending' ? advance(next) : next;
    case 'confirm-openers':
      return action === 'opening-confirmed' ? advance(next) : next;
    case 'begin':
      return action === 'begin' ? advance(next) : next;
    case 'essence':
      return action === 'essence-view' ? advance(next) : next;
    case 'reveal-draft':
      return action === 'reveal-draft' ? advance(next) : next;
    case 'choose-draft':
      return actionSatisfied(next, 'draft-troop', 'draft-upgrade') ? advance(next) : next;
    case 'return-rifts':
      return action === 'rifts-view' ? advance(next) : next;
    case 'rift-enemies':
      return actionSatisfied(next, 'rift-enemy-lock', 'rift-enemy-unlock') ? advance(next) : next;
    case 'modifiers':
      return action === 'mutator-hover' ? advance(next) : next;
    case 'assign-rift':
      return action === 'assign-troop' ? advance(next) : next;
    case 'end-cycle':
      return action === 'end-cycle' ? advance(next) : next;
    case 'contest-results':
      return action === 'cycle-animation-finished' ? { ...next, ready: true } : next;
    case 'archive-inspect':
      return action === 'archive-inspect' ? advance(next) : next;
    case 'rival-info':
      return action === 'rival-info' ? advance(next) : next;
    default:
      return next;
  }
}

function chooseOpeningPair(game: GameState): TroopUnlockId[] {
  const starters = getOpeningFactionStarterTroopUnlockIds(game);
  const candidates = getOpeningFactionOptionIds(game).map((factionId) => starters[factionId]);
  const first = candidates[0]!;
  const [firstFactionId, firstUnitTypeId] = first.split('/');
  const second = candidates.find((candidate) => {
    const [factionId, unitTypeId] = candidate.split('/');
    return factionId !== firstFactionId && unitTypeId !== firstUnitTypeId;
  });
  return second ? [first, second] : [first, candidates[1]!];
}

export function buildTutorialReplayFixture(): TutorialFixture {
  let game = startNewGame(TUTORIAL_CAMPAIGN_SEED, 'contest');
  chooseOpeningPair(game).forEach((troopUnlockId) => {
    game = claimOpeningTroop(game, troopUnlockId);
  });
  game = startOpeningCampaign(game);

  const riftId = game.openRifts[0]!.id;
  game.troops.forEach((troop) => {
    game = assignTroopToRift(game, troop.id, riftId);
  });

  const resolution = resolveAssignedRifts(game);
  const tutorialRecord = resolution.records.find(
    (record) => record.riftId === riftId && record.contest?.attackerId === 'human',
  );
  if (!tutorialRecord) {
    throw new Error('Tutorial replay fixture did not resolve the assigned human Rift.');
  }
  tutorialRecord.battleInput = { ...tutorialRecord.battleInput, seed: TUTORIAL_BATTLE_SEED };
  tutorialRecord.replay = resolveBattle(tutorialRecord.battleInput);
  const outcome = applyCycleOutcomes(game, { ...resolution, records: [tutorialRecord] });
  return {
    game: outcome.nextState,
    replayWrites: outcome.replayPayloadWrites,
  };
}

export function buildTutorialOpeningGame(): GameState {
  return startNewGame(TUTORIAL_CAMPAIGN_SEED, 'contest');
}
