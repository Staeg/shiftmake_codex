import { createTroopInstance, resolveTroopCombatant } from '../../engine/army';
import { buildResolvedUnitDetail } from '../detailCards';

export function inspectionFixture() {
  const troop = createTroopInstance('human', 'beastmaster');
  const definition = resolveTroopCombatant({ raceUpgradeIds: [], troopClassUpgradeIds: [] }, troop, 'player');
  const portrait = (race: string, unitClass: string) => `/unit/${race}/${unitClass}.png`;
  const detail = buildResolvedUnitDetail({ detailKey: 'ready:beastmaster', label: definition.label,
    raceId: troop.raceId, unitClassId: troop.unitClassId, stats: definition.stats, quantity: definition.quantity,
    description: 'Available troop', abilities: definition.abilities,
    ...(definition.statBreakdowns ? { statBreakdowns: definition.statBreakdowns } : {}),
    getRaceUnitPortrait: portrait });
  return { troop, definition, detail, portrait };
}
