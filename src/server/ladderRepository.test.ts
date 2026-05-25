import { describe, expect, it } from 'vitest';
import { generateBaselineLadderPayload } from '../engine/ladder';
import { MemoryLadderRepository } from './ladderRepository';

describe('MemoryLadderRepository', () => {
  it('seeds baseline sets idempotently and draws only valid unspent records', async () => {
    const repository = new MemoryLadderRepository();
    await repository.init();
    await repository.seedBaseline();
    await repository.seedBaseline();

    const stats = await repository.storageStats();
    expect(stats.totalRows).toBe(50);
    expect(stats.validRows).toBe(50);

    const drawn = await repository.draw(1);
    expect(drawn).toBeTruthy();
    await repository.markSpent(drawn!.id, true);
    await repository.markCompatibility(drawn!.id, 'incompatible', [{ code: 'invalid_payload', path: '$', message: 'test' }]);

    const nextDrawn = await repository.draw(1);
    expect(nextDrawn?.id).not.toBe(drawn!.id);
    expect(nextDrawn?.spent).toBe(false);
    expect(nextDrawn?.compatibilityStatus).toBe('valid');
  });

  it('increments appearances and harvests a child generation', async () => {
    const repository = new MemoryLadderRepository();
    const payload = generateBaselineLadderPayload(1234, 2);
    const parent = await repository.insert({
      id: '00000000-0000-4000-8000-000000000001',
      cycleNumber: 2,
      generation: 3,
      sourceSetId: null,
      appearances: 0,
      spent: false,
      compatibilityStatus: 'valid',
      compatibilityIssues: [],
      payload,
    });

    await repository.incrementAppearances(parent.id);
    const child = await repository.harvestChild(parent.id, payload);
    const parentAfter = (await repository.list({ cycleNumber: 2, limit: 10 })).find((record) => record.id === parent.id);

    expect(parentAfter?.appearances).toBe(1);
    expect(child.generation).toBe(4);
    expect(child.sourceSetId).toBe(parent.id);
    expect(child.appearances).toBe(0);
    expect(child.spent).toBe(false);
  });
});
