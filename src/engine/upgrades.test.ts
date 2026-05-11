import { describe, expect, it } from 'vitest';
import { createTroopInstance } from './army';
import { getFactionNativeTroopUnlockIds } from './unitCatalog';
import { getAvailableTroopUnlockIds } from './upgrades';

describe('troop unlock availability', () => {
  it('includes unowned native and Rift-earned troops for unlocked factions only', () => {
    const ownedNativeTroopUnlockId = 'human/soldier';
    const unownedNativeTroopUnlockId = getFactionNativeTroopUnlockIds('human').find((troopUnlockId) => troopUnlockId !== ownedNativeTroopUnlockId)!;

    const available = getAvailableTroopUnlockIds({
      unlockedFactionIds: ['human'],
      unlockedTroopUnlockIds: ['human/wizard', 'troll/wizard'],
      troops: [createTroopInstance('human', 'soldier')],
    });

    expect(available).toContain(unownedNativeTroopUnlockId);
    expect(available).toContain('human/wizard');
    expect(available).not.toContain(ownedNativeTroopUnlockId);
    expect(available).not.toContain('troll/wizard');
  });
});
