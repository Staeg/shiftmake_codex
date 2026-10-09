import { getTroopEffectiveDefinition, getTroopsAssignedToRift, resolveTroopCombatant } from '../engine/army';
import type { GameState, BattleParticipantKind, BattleOutcome, ContestPlayerId,
  ResolvedCombatantDefinition, RiftInstance, RiftResolutionRecord, SideId, TroopId } from '../engine/types';
export type MiniReplayHealthTone = 'player' | 'neutral' | 'opponent';

export type RiftBattleAnimationSide = {
  label: string;
  kind: BattleParticipantKind;
  playerId?: ContestPlayerId | undefined;
  loses: boolean;
};

export type RiftBattleAnimationPhase = {
  key: string;
  replayId: string;
  delayClass: 'phase-now' | 'phase-late';
  left: RiftBattleAnimationSide;
  leftSource: SideId;
  right: RiftBattleAnimationSide;
  rightSource: SideId;
};

export type RiftBattleAnimationView = {
  riftId: string;
  phases: RiftBattleAnimationPhase[];
};

export type RiftAnimationCombatantGroup = {
  key: string;
  phaseClass: 'phase-now' | 'phase-late' | 'phase-static';
  combatants: ResolvedCombatantDefinition[];
  participant: RiftBattleAnimationSide | null;
  lossClass: 'force-loses-now' | 'force-loses-late' | null;
};


export function getVisibleRiftDefenders(game: GameState, rift: { controller?: string; occupyingTroopIds?: TroopId[]; enemyArmy: ResolvedCombatantDefinition[] }): ResolvedCombatantDefinition[] {
  if (game.gameMode !== 'contest') {
    return rift.enemyArmy;
  }
  if (!rift.controller || rift.controller === 'neutral') {
    return rift.enemyArmy;
  }
  if (rift.controller === 'playerOne' || rift.controller === 'human') {
    return [];
  }
  const playerTwo = game.contest?.players.playerTwo;
  if (!playerTwo) {
    return [];
  }
  const occupyingIds = new Set(rift.occupyingTroopIds ?? []);
  return playerTwo.troops
    .filter((troop) => occupyingIds.has(troop.id))
    .map((troop) => resolveTroopCombatant(playerTwo, troop, 'enemy', null, `player-two-held-${troop.id}`));
}

// Legacy reports can still carry human/ai participant identities.
function isHumanPlayerId(playerId: string | undefined): boolean {
  return playerId === 'playerOne' || playerId === 'human';
}

function isOpponentPlayerId(playerId: string | undefined): boolean {
  return playerId === 'playerTwo' || playerId === 'ai';
}

function isHumanBattleSide(record: RiftResolutionRecord, side: SideId): boolean {
  const participant = record.battleInput.sideParticipants?.[side];
  return participant?.kind === 'player' || isHumanPlayerId(participant?.playerId);
}

function getBattleAnimationSide(
  record: RiftResolutionRecord,
  side: SideId,
  loses: boolean,
  fallbackKind: BattleParticipantKind,
  fallbackLabel: string,
): RiftBattleAnimationSide {
  const participant = record.battleInput.sideParticipants?.[side] ?? { kind: fallbackKind, label: fallbackLabel };
  return {
    label: participant.label,
    kind: participant.kind,
    playerId: participant.playerId,
    loses,
  };
}

function outcomeLoser(outcome: BattleOutcome, side: SideId): boolean {
  if (outcome === 'draw') {
    return true;
  }
  return side === 'player' ? outcome === 'defeat' : outcome === 'victory';
}

export function buildRecordBattlePhase(record: RiftResolutionRecord, delayClass: RiftBattleAnimationPhase['delayClass'], key: string): RiftBattleAnimationPhase {
  const playerSide = getBattleAnimationSide(record, 'player', outcomeLoser(record.outcome, 'player'), 'player', 'Player');
  const enemySide = getBattleAnimationSide(record, 'enemy', outcomeLoser(record.outcome, 'enemy'), 'neutral', 'Neutral Guardians');
  const neutralIsEnemy = enemySide.kind === 'neutral';
  const playerIsRight = isHumanBattleSide(record, 'player') || neutralIsEnemy;
  return {
    key,
    replayId: record.replay.id,
    delayClass,
    left: playerIsRight ? enemySide : playerSide,
    leftSource: playerIsRight ? 'enemy' : 'player',
    right: playerIsRight ? playerSide : enemySide,
    rightSource: playerIsRight ? 'player' : 'enemy',
  };
}

export function getRecordForBattlePhase(records: readonly RiftResolutionRecord[], phase: RiftBattleAnimationPhase): RiftResolutionRecord | null {
  return records.find((entry) => entry.replay.id === phase.replayId) ?? null;
}

export function resultForBattleSource(outcome: BattleOutcome, source: SideId): BattleOutcome {
  if (outcome === 'draw' || source === 'player') {
    return outcome;
  }
  return outcome === 'victory' ? 'defeat' : 'victory';
}

function isHumanAnimationSide(side: RiftBattleAnimationSide): boolean {
  return isHumanPlayerId(side.playerId) || (side.kind === 'player' && !side.playerId);
}

export function healthToneForAnimationSide(side: RiftBattleAnimationSide): MiniReplayHealthTone {
  if (isHumanAnimationSide(side)) {
    return 'player';
  }
  if (side.kind === 'neutral') {
    return 'neutral';
  }
  return 'opponent';
}

export function phaseResultSource(phase: RiftBattleAnimationPhase): { source: SideId; opponentOutcome: boolean } {
  if (isHumanAnimationSide(phase.left)) {
    return { source: phase.leftSource, opponentOutcome: false };
  }
  if (isHumanAnimationSide(phase.right)) {
    return { source: phase.rightSource, opponentOutcome: false };
  }
  if (isOpponentPlayerId(phase.left.playerId) || phase.left.kind === 'opponent') {
    return { source: phase.leftSource, opponentOutcome: true };
  }
  if (isOpponentPlayerId(phase.right.playerId) || phase.right.kind === 'opponent') {
    return { source: phase.rightSource, opponentOutcome: true };
  }
  return { source: phase.rightSource, opponentOutcome: true };
}

function battleParticipantKey(participant: RiftBattleAnimationSide | null): string {
  if (!participant) {
    return 'static';
  }
  return participant.playerId ? `player:${participant.playerId}` : `${participant.kind}:${participant.label}`;
}

function getAnimationCombatantsForSide(records: readonly RiftResolutionRecord[], phase: RiftBattleAnimationPhase, side: 'left' | 'right'): ResolvedCombatantDefinition[] {
  const record = getRecordForBattlePhase(records, phase);
  if (!record) {
    return [];
  }
  const source = side === 'left' ? phase.leftSource : phase.rightSource;
  return source === 'player' ? record.battleInput.playerCombatants : record.battleInput.enemyCombatants;
}

function getAssignedRiftCombatants(game: GameState, rift: RiftInstance): ResolvedCombatantDefinition[] {
  return getTroopsAssignedToRift(game, rift.id).map((troop) => getTroopEffectiveDefinition(game, troop.id));
}

function getAnimationCombatantGroupsForSide(
  game: GameState,
  records: readonly RiftResolutionRecord[],
  rift: RiftInstance,
  animation: RiftBattleAnimationView | null,
  side: 'left' | 'right',
): RiftAnimationCombatantGroup[] {
  if (animation?.phases.length) {
    const groups: RiftAnimationCombatantGroup[] = [];
    animation.phases.forEach((phase) => {
      const participant = phase[side];
      const combatants = getAnimationCombatantsForSide(records, phase, side);
      if (combatants.length === 0) {
        return;
      }
      const key = battleParticipantKey(participant);
      let group = groups.find((entry) => battleParticipantKey(entry.participant) === key);
      if (!group) {
        group = {
          key: `${animation.riftId}:${side}:${phase.delayClass}:${key}`,
          phaseClass: phase.delayClass,
          combatants,
          participant,
          lossClass: null,
        };
        groups.push(group);
      }
      if (participant.loses) {
        group.lossClass = phase.delayClass === 'phase-late' ? 'force-loses-late' : 'force-loses-now';
      }
    });
    if (groups.length > 0) {
      return groups;
    }
  }
  return [
    {
      key: `${rift.id}:${side}:static`,
      phaseClass: 'phase-static',
      combatants: side === 'left' ? getVisibleRiftDefenders(game, rift) : getAssignedRiftCombatants(game, rift),
      participant: null,
      lossClass: null,
    },
  ];
}

export function getAnimationLeftCombatantGroups(game: GameState, records: readonly RiftResolutionRecord[], rift: RiftInstance, animation: RiftBattleAnimationView | null): RiftAnimationCombatantGroup[] {
  return getAnimationCombatantGroupsForSide(game, records, rift, animation, 'left');
}

export function getAnimationRightCombatantGroups(game: GameState, records: readonly RiftResolutionRecord[], rift: RiftInstance, animation: RiftBattleAnimationView | null): RiftAnimationCombatantGroup[] {
  return getAnimationCombatantGroupsForSide(game, records, rift, animation, 'right');
}

export function getRiftBattleAnimationView(allRecords: readonly RiftResolutionRecord[], rift: RiftInstance): RiftBattleAnimationView | null {
  const records = allRecords.filter((record) => record.riftId === rift.id);
  if (records.length === 0) {
    return null;
  }

  const pvp = records.find((record) => record.contest?.kind === 'pvp') ?? null;
  if (pvp) {
    const humanGuardian =
      records.find(
        (record) =>
          record.contest?.kind === 'guardian' &&
          isHumanPlayerId(record.contest.attackerId),
      ) ?? null;
    return {
      riftId: rift.id,
      phases: [
        buildRecordBattlePhase(humanGuardian ?? pvp, 'phase-now', `${rift.id}:guardian`),
        buildRecordBattlePhase(pvp, 'phase-late', `${rift.id}:pvp`),
      ],
    };
  }

  const preferredRecords = records.filter((record) => record.contest?.kind !== 'pvp');

  return {
    riftId: rift.id,
    phases: preferredRecords.map((record, index) => buildRecordBattlePhase(record, 'phase-now', `${rift.id}:${index}:${record.replay.id}`)),
  };
}
