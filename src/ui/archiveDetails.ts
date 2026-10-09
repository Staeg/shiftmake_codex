import type { BattleReplay, BattleParticipantKind, ReplayIndexEntry, StoredReplayPayload, SideId, UpgradeId } from '../engine/types';
import { RACE_UPGRADES, TROOP_CLASS_UPGRADES } from '../engine/unitCatalog';
import { buildBattleRecap } from './battleRecap';
export interface ArchiveCombatantPerformance { healthPercent: number; damagePercent: number; damageDone: number; }
const archivePerformanceKey = (side: SideId, troopLabel: string): string => `${side}:${troopLabel}`;
export const ARCHIVE_PARTICIPANT_FALLBACK: Record<SideId, { kind: BattleParticipantKind; label: string }> = {
    player: { kind: 'player', label: 'Player' },
    enemy: { kind: 'neutral', label: 'Neutral Guardians' },
  };
export function healthPercent(current?: number, max?: number, alive?: number): number {
    if (typeof current === 'number' && typeof max === 'number' && max > 0) {
      return Math.max(0, Math.min(100, (current / max) * 100));
    }
    if (typeof alive === 'number') {
      return alive > 0 ? 100 : 0;
    }
    return 0;
  }

export function buildArchivePerformanceMap(replay: BattleReplay | null): Map<string, ArchiveCombatantPerformance> {
    const map = new Map<string, ArchiveCombatantPerformance>();
    if (!replay) {
      return map;
    }

    const finalUnits = replay.steps[replay.steps.length - 1]?.snapshot.units ?? replay.initial.units;
    const damageByKey = new Map<string, number>();
    buildBattleRecap(replay).forEach((troop) => {
      damageByKey.set(archivePerformanceKey(troop.side, troop.troopLabel), troop.damageDone);
    });
    const maxDamage = Math.max(1, ...damageByKey.values());
    const knownKeys = new Set<string>();

    replay.initial.units.forEach((unit) => {
      const key = archivePerformanceKey(unit.side, unit.troopLabel);
      if (knownKeys.has(key)) {
        return;
      }
      knownKeys.add(key);
      const matchingFinalUnits = finalUnits.filter((entry) => entry.side === unit.side && entry.troopLabel === unit.troopLabel);
      const currentHp = matchingFinalUnits.reduce((sum, entry) => sum + (entry.alive ? Math.max(0, entry.hp) : 0), 0);
      const maxHp = matchingFinalUnits.reduce((sum, entry) => sum + entry.maxHp, 0);
      const damageDone = damageByKey.get(key) ?? 0;
      map.set(key, {
        healthPercent: healthPercent(currentHp, maxHp),
        damagePercent: damageDone > 0 ? Math.max(8, Math.min(100, (damageDone / maxDamage) * 100)) : 0,
        damageDone,
      });
    });

    return map;
  }

export function getRelevantArchiveUpgradeIds(payload: StoredReplayPayload | null, side: SideId): UpgradeId[] {
    if (!payload) {
      return [];
    }

    const raceUpgradeIds = side === 'player' ? payload.input.playerRaceUpgradeIds ?? [] : payload.input.enemyRaceUpgradeIds ?? [];
    const troopClassUpgradeIds = side === 'player' ? payload.input.playerTroopClassUpgradeIds ?? [] : payload.input.enemyTroopClassUpgradeIds ?? [];
    const fallbackCombatants = side === 'player' ? payload.input.playerCombatants : payload.input.enemyCombatants;
    const relevantRaces = new Set(fallbackCombatants.map((entry) => entry.raceId));
    const relevantTroopClasses = new Set(fallbackCombatants.map((entry) => entry.unitClassId));

    return [...raceUpgradeIds, ...troopClassUpgradeIds].filter((upgradeId) => {
      if (upgradeId in RACE_UPGRADES) {
        return relevantRaces.has(RACE_UPGRADES[upgradeId]!.raceId);
      }
      const troopClassUpgrade = TROOP_CLASS_UPGRADES[upgradeId];
      return troopClassUpgrade ? relevantTroopClasses.has(troopClassUpgrade.unitClassId) : false;
    });
  }


export function buildArchiveDetails(entry: ReplayIndexEntry | null, payload: StoredReplayPayload | null, replay: BattleReplay | null) {
  const combatants = (side: SideId) => (side === 'player' ? payload?.input.playerCombatants ?? [] : payload?.input.enemyCombatants ?? [])
    .map(combatant => ({ ...combatant, quantity: Number.isFinite(combatant.quantity) && combatant.quantity > 0 ? combatant.quantity : 1 }));
  return {
    participants: {
      player: payload?.input.sideParticipants?.player ?? entry?.sideParticipants?.player ?? ARCHIVE_PARTICIPANT_FALLBACK.player,
      enemy: payload?.input.sideParticipants?.enemy ?? entry?.sideParticipants?.enemy ?? ARCHIVE_PARTICIPANT_FALLBACK.enemy,
    },
    combatants: { player: combatants('player'), enemy: combatants('enemy') },
    performance: buildArchivePerformanceMap(replay),
    upgrades: { player: getRelevantArchiveUpgradeIds(payload, 'player'), enemy: getRelevantArchiveUpgradeIds(payload, 'enemy') },
  };
}
