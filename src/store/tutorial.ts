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
  | 'start-contest'
  | 'faction-select'
  | 'faction-deselect'
  | 'future-select'
  | 'future-deselect'
  | 'starter-pending'
  | 'opening-confirmed'
  | 'begin';

export type TutorialStepId =
  | 'watch-battle'
  | 'unit-hover'
  | 'unit-lock'
  | 'stats'
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
  | 'complete';

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
  'unit-hover',
  'unit-lock',
  'stats',
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
  'complete',
];

const CONTINUE_STEPS = new Set<TutorialStepId>(['stats', 'initiative', 'overview', 'engagement', 'roles', 'game-start', 'opening']);

function nextStep(step: TutorialStepId): TutorialStepId {
  return STEP_ORDER[Math.min(STEP_ORDER.indexOf(step) + 1, STEP_ORDER.length - 1)] ?? step;
}

function previousStep(step: TutorialStepId): TutorialStepId {
  return STEP_ORDER[Math.max(STEP_ORDER.indexOf(step) - 1, 0)] ?? step;
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
      return actionSatisfied(next, 'unit-hover', 'unit-unhover') ? { ...next, ready: true } : next;
    case 'unit-lock':
      return actionSatisfied(next, 'unit-lock', 'unit-unlock') ? { ...next, ready: true } : next;
    case 'speed':
      return action === 'speed-hover' ? { ...next, ready: true } : next;
    case 'play':
      return action === 'play' ? { ...next, ready: true } : next;
    case 'pause-resume':
      return actionSatisfied(next, 'pause', 'resume') ? { ...next, ready: true } : next;
    case 'speed-change':
      return action === 'speed-change' ? { ...next, ready: true } : next;
    case 'timeline-show':
      return action === 'event-log-show' ? { ...next, ready: true } : next;
    case 'timeline-event':
      return action === 'event-select' ? { ...next, ready: true } : next;
    case 'manual-steps':
      return actionSatisfied(next, 'step-next', 'step-previous') ? { ...next, ready: true } : next;
    case 'unit-actions':
      return actionSatisfied(next, 'unit-next-action', 'unit-previous-action') ? { ...next, ready: true } : next;
    case 'ability':
      return action === 'ability-hover' ? { ...next, ready: true } : next;
    case 'finish-replay':
      return action === 'replay-end' ? advance(next) : next;
    case 'start-contest':
      return action === 'start-contest' ? advance(next) : next;
    case 'faction-toggle':
      return actionSatisfied(next, 'faction-select', 'faction-deselect') ? { ...next, ready: true } : next;
    case 'future-toggle':
      return actionSatisfied(next, 'future-select', 'future-deselect') ? { ...next, ready: true } : next;
    case 'starter':
      return action === 'starter-pending' ? { ...next, ready: true } : next;
    case 'confirm-openers':
      return action === 'opening-confirmed' ? { ...next, ready: true } : next;
    case 'begin':
      return action === 'begin' ? advance(next) : next;
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
