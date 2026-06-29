import { planContestAiForWorker, type ContestAiWorkerRequest, type ContestAiWorkerResponse } from './contestAiPlanner';

self.onmessage = (event: MessageEvent<ContestAiWorkerRequest>) => {
  const request = event.data;
  if (request.kind !== 'plan-contest-ai') {
    return;
  }

  const response: ContestAiWorkerResponse = {
    kind: 'contest-ai-plan',
    key: request.key,
    playerTwo: planContestAiForWorker(request.game),
  };
  self.postMessage(response);
};
