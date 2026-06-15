import { getTroopStartingQuantity } from './unitCatalog';
import type { ArmyDebugSelection } from './debugTypes';
import type { TroopTypeId } from './types';

export interface AbilityVerificationSignal {
  id: string;
  label: string;
  match: string;
}

export interface AbilityVerificationScenario {
  id: string;
  group: string;
  label: string;
  summary: string;
  seed: number;
  player: ArmyDebugSelection;
  enemy: ArmyDebugSelection;
  playerFactionUpgradeIds: string[];
  playerTroopTypeUpgradeIds: string[];
  enemyFactionUpgradeIds: string[];
  enemyTroopTypeUpgradeIds: string[];
  coveredAbilityIds: string[];
  signals: AbilityVerificationSignal[];
  manualChecks: string[];
}

function selection(entries: Partial<Record<TroopTypeId, number>>): ArmyDebugSelection {
  return { ...entries };
}

function startCount(troopId: TroopTypeId, multiplier = 1): number {
  return getTroopStartingQuantity(troopId) * multiplier;
}

export const REQUIRED_ABILITY_VERIFICATION_IDS = [
  'shield-drill',
  'pinning-volley',
  'blood-oath',
  'packmasters-whistle',
  'shapeshift-bear-2',
  'thornhide',
  'arc-conductor',
  'retaliate',
  'rabble-rush',
  'early-riser',
  'carrion-choir',
  'mercy-before-dawn',
  'skirmishers-step',
  'heartseeker',
  'war-drums',
  'spell-echo',
  'tubthumping',
  'fade-into-shadow',
  'long-shot-doctrine',
  'snatch-the-moment',
  'stoneblood',
  'crushing-sweep',
] as const;

export const ABILITY_VERIFICATION_SCENARIOS: AbilityVerificationScenario[] = [
  {
    id: 'archer-pinning-volley',
    group: 'Attack Modifiers',
    label: 'Pinning Volley',
    summary: 'Single upgraded archer should permanently slow its target on hit.',
    seed: 24,
    player: selection({ 'human/archer': startCount('human/archer') }),
    enemy: selection({ 'human/soldier': startCount('human/soldier') }),
    playerFactionUpgradeIds: [],
    playerTroopTypeUpgradeIds: ['archer-pinning-volley'],
    enemyFactionUpgradeIds: [],
    enemyTroopTypeUpgradeIds: [],
    coveredAbilityIds: ['pinning-volley'],
    signals: [{ id: 'slow', label: 'Speed reduction applied', match: 'loses 1 speed' }],
    manualChecks: ['Confirm the speed loss persists on later turns rather than expiring immediately.'],
  },
  {
    id: 'human-tubthumping',
    group: 'Attack Modifiers',
    label: 'Tubthumping',
    summary: 'Human units should flip harmful speed reductions into +1 speed.',
    seed: 48,
    player: selection({ 'human/archer': startCount('human/archer') }),
    enemy: selection({ 'human/archer': startCount('human/archer') }),
    playerFactionUpgradeIds: ['human-tubthumping'],
    playerTroopTypeUpgradeIds: [],
    enemyFactionUpgradeIds: [],
    enemyTroopTypeUpgradeIds: ['archer-pinning-volley'],
    coveredAbilityIds: ['tubthumping'],
    signals: [{ id: 'flip', label: 'Debuff inverted into buff', match: 'Human Archer gains +1 speed.' }],
    manualChecks: ['Confirm the protected Human unit never receives the matching "loses 1 speed" event.'],
  },
  {
    id: 'soldier-shield-drill',
    group: 'Protection And Redirects',
    label: 'Shield Drill',
    summary: 'A Soldier should cap ranged damage taken after accepting its armor sidegrade.',
    seed: 66,
    player: selection({
      'human/soldier': startCount('human/soldier'),
      'human/archer': startCount('human/archer'),
    }),
    enemy: selection({ 'elf/archer': startCount('elf/archer', 2) }),
    playerFactionUpgradeIds: [],
    playerTroopTypeUpgradeIds: ['soldier-shield-drill'],
    enemyFactionUpgradeIds: [],
    enemyTroopTypeUpgradeIds: [],
    coveredAbilityIds: ['shield-drill'],
    signals: [],
    manualChecks: [
      'Use the attack log and board state together; this protection is expressed through capped ranged damage, not a separate buff event.',
      'Confirm ranged attacks against Soldiers deal at most 1 damage after all modifiers.',
    ],
  },
  {
    id: 'avenger-blood-oath',
    group: 'Death Responses',
    label: 'Blood Oath',
    summary: 'The Avenger should spike to 100 initiative after a nearby ally falls.',
    seed: 72,
    player: selection({
      'troll/avenger': startCount('troll/avenger'),
      'human/militia': startCount('human/militia'),
    }),
    enemy: selection({ 'human/knight': startCount('human/knight') }),
    playerFactionUpgradeIds: [],
    playerTroopTypeUpgradeIds: ['avenger-blood-oath'],
    enemyFactionUpgradeIds: [],
    enemyTroopTypeUpgradeIds: [],
    coveredAbilityIds: ['blood-oath'],
    signals: [{ id: 'spike', label: 'Initiative set to 100', match: 'initiative to 100' }],
    manualChecks: ['Confirm the Avenger acts immediately after the allied death instead of waiting for the next normal beat.'],
  },
  {
    id: 'beastmaster-packmaster',
    group: 'Protection And Redirects',
    label: "Packmaster's Whistle",
    summary: 'An engaged Beastmaster should have a touching wolf redirect and heal.',
    seed: 74,
    player: selection({ 'goblin/beastmaster': startCount('goblin/beastmaster') }),
    enemy: selection({ 'human/soldier': startCount('human/soldier', 2) }),
    playerFactionUpgradeIds: [],
    playerTroopTypeUpgradeIds: ['beastmaster-packmasters-whistle'],
    enemyFactionUpgradeIds: [],
    enemyTroopTypeUpgradeIds: [],
    coveredAbilityIds: ['packmasters-whistle'],
    signals: [{ id: 'whistle', label: 'Wolf answers the whistle', match: 'whistle' }],
    manualChecks: [
      'Confirm the redirecting wolf already shares the Beastmaster hex when the effect fires.',
      'Confirm the wolf HP increases after the whistle step because the +10 heal is encoded in the state, not in a separate heal log line.',
    ],
  },
  {
    id: 'druid-form-and-shadow',
    group: 'Shapeshift And Retreat',
    label: 'True Form + Thornhide + Elven Reflexes',
    summary: 'This setup should show the Druid shapeshifting twice, punishing melee hits, and using the free retreat once.',
    seed: 77,
    player: selection({ 'elf/druid': startCount('elf/druid') }),
    enemy: selection({ 'human/knight': startCount('human/knight', 2) }),
    playerFactionUpgradeIds: ['elf-elven-reflexes'],
    playerTroopTypeUpgradeIds: ['druid-true-form', 'druid-thornhide'],
    enemyFactionUpgradeIds: [],
    enemyTroopTypeUpgradeIds: [],
    coveredAbilityIds: ['shapeshift-bear-2', 'thornhide', 'fade-into-shadow'],
    signals: [
      { id: 'shape', label: 'Shapeshift fires', match: 'becomes frontline.' },
      { id: 'thornhide', label: 'Thornhide damage fires', match: 'thorns' },
      { id: 'shadow', label: 'Free retreat fires', match: 'fades into shadow' },
    ],
    manualChecks: [
      'Confirm shapeshift happens exactly twice total.',
      'Confirm the free retreat only happens on the first qualifying engagement.',
    ],
  },
  {
    id: 'elementalist-arc-conductor',
    group: 'Death Responses',
    label: 'Arc Conductor',
    summary: 'A dying allied elemental should immediately blast its own hex.',
    seed: 83,
    player: selection({
      'elf/elementalist': startCount('elf/elementalist'),
      'human/knight': startCount('human/knight'),
    }),
    enemy: selection({ 'human/knight': startCount('human/knight', 2) }),
    playerFactionUpgradeIds: [],
    playerTroopTypeUpgradeIds: ['elementalist-arc-conductor'],
    enemyFactionUpgradeIds: [],
    enemyTroopTypeUpgradeIds: [],
    coveredAbilityIds: ['arc-conductor'],
    signals: [
      { id: 'summon', label: 'Elemental is summoned', match: 'summons Elemental' },
      { id: 'blast', label: 'Conductor blast fires', match: 'blasts' },
    ],
    manualChecks: ['Confirm the blast originates from the dead elemental hex and catches enemies there.'],
  },
  {
    id: 'knight-dine-in-hell',
    group: 'Protection And Redirects',
    label: 'Dine in Hell',
    summary: 'A full-capacity Knight should brace and only retaliate against normal attacks while fully engaged.',
    seed: 84,
    player: selection({
      'human/knight': startCount('human/knight'),
      'human/priest': startCount('human/priest'),
    }),
    enemy: selection({ 'human/soldier': startCount('human/soldier', 2) }),
    playerFactionUpgradeIds: [],
    playerTroopTypeUpgradeIds: ['knight-dine-in-hell'],
    enemyFactionUpgradeIds: [],
    enemyTroopTypeUpgradeIds: [],
    coveredAbilityIds: ['retaliate'],
    signals: [],
    manualChecks: [
      'Confirm retaliation appears only while the Knight is engaged at full capacity.',
      'Confirm retaliation steps are marked as retaliation and do not recursively retaliate.',
    ],
  },
  {
    id: 'militia-rabble-rush',
    group: 'Initiative And Formation',
    label: 'Rabble Rush',
    summary: 'Touching Militia should gain initiative from each other Militia.',
    seed: 25,
    player: selection({ 'human/militia': startCount('human/militia', 2) }),
    enemy: selection({ 'human/knight': startCount('human/knight') }),
    playerFactionUpgradeIds: [],
    playerTroopTypeUpgradeIds: ['militia-rabble-rush'],
    enemyFactionUpgradeIds: [],
    enemyTroopTypeUpgradeIds: [],
    coveredAbilityIds: ['rabble-rush'],
    signals: [{ id: 'initiative', label: 'Militia gains initiative', match: 'gains 1 initiative' }],
    manualChecks: ['Confirm the bonus scales from other touching Militia, not from all allies globally.'],
  },
  {
    id: 'necromancer-corpse-engine',
    group: 'Summons And Corpse Play',
    label: 'Early Riser + Carrion Choir',
    summary: 'Necromancer corpse play should create fast skeletons and debuff enemies near the corpse.',
    seed: 90,
    player: selection({ 'troll/necromancer': startCount('troll/necromancer') }),
    enemy: selection({ 'human/soldier': startCount('human/soldier', 2) }),
    playerFactionUpgradeIds: [],
    playerTroopTypeUpgradeIds: ['necromancer-early-riser', 'necromancer-carrion-choir'],
    enemyFactionUpgradeIds: [],
    enemyTroopTypeUpgradeIds: [],
    coveredAbilityIds: ['early-riser', 'carrion-choir'],
    signals: [
      { id: 'skeleton', label: 'Skeleton is summoned', match: 'summons Skeleton' },
      { id: 'choir', label: 'Nearby enemies lose armor and damage', match: 'loses 1 armor and 1 damage' },
    ],
    manualChecks: [
      'Confirm the skeleton acts unusually early after spawning.',
      'Confirm the debuff is centered on the consumed corpse, not on the Necromancer.',
    ],
  },
  {
    id: 'priest-mercy-before-dawn',
    group: 'Death Responses',
    label: 'Mercy Before Dawn',
    summary: 'The Priest should preserve a doomed nearby ally at 1 HP the first time they would die.',
    seed: 46,
    player: selection({
      'human/priest': startCount('human/priest'),
      'human/militia': startCount('human/militia'),
    }),
    enemy: selection({ 'human/knight': startCount('human/knight') }),
    playerFactionUpgradeIds: [],
    playerTroopTypeUpgradeIds: ['priest-mercy-before-dawn'],
    enemyFactionUpgradeIds: [],
    enemyTroopTypeUpgradeIds: [],
    coveredAbilityIds: ['mercy-before-dawn'],
    signals: [{ id: 'save', label: 'Ally saved at 1 HP', match: 'preserves Human Militia at 1 HP' }],
    manualChecks: [
      'Confirm the save happens before the death would resolve.',
      'Confirm the same unit is not saved again later in the battle.',
    ],
  },
  {
    id: 'ranger-range-control',
    group: 'Attack Modifiers',
    label: "Skirmisher's Step + Heartseeker + Silvershot Doctrine",
    summary: 'An upgraded elf ranger should hit harder from distance, double-hit unengaged targets, and retreat to a safer in-range hex.',
    seed: 95,
    player: selection({ 'elf/ranger': startCount('elf/ranger') }),
    enemy: selection({ 'human/soldier': startCount('human/soldier', 2) }),
    playerFactionUpgradeIds: ['elf-silvershot-doctrine'],
    playerTroopTypeUpgradeIds: ['ranger-skirmishers-step', 'ranger-heartseeker'],
    enemyFactionUpgradeIds: [],
    enemyTroopTypeUpgradeIds: [],
    coveredAbilityIds: ['skirmishers-step', 'heartseeker', 'long-shot-doctrine'],
    signals: [{ id: 'retreat', label: 'Ranger retreats after firing', match: 'retreats to preserve range' }],
    manualChecks: [
      'Confirm the first shot against an unengaged target is meaningfully larger than a normal attack.',
      'Confirm the retreat destination keeps at least one enemy in range while increasing safety.',
    ],
  },
  {
    id: 'shaman-war-drums',
    group: 'Initiative And Formation',
    label: 'War Drums',
    summary: 'Enhance should hit every ally on the chosen hex instead of only one ally.',
    seed: 97,
    player: selection({
      'troll/shaman': startCount('troll/shaman'),
      'troll/soldier': startCount('troll/soldier', 2),
    }),
    enemy: selection({ 'human/knight': startCount('human/knight') }),
    playerFactionUpgradeIds: [],
    playerTroopTypeUpgradeIds: ['shaman-war-drums'],
    enemyFactionUpgradeIds: [],
    enemyTroopTypeUpgradeIds: [],
    coveredAbilityIds: ['war-drums'],
    signals: [
      { id: 'speed', label: 'Enhance grants speed', match: 'gains +1 speed' },
      { id: 'damage', label: 'Enhance grants damage', match: 'gains +1 damage' },
    ],
    manualChecks: ['Confirm multiple allies on the buffed hex receive the same Enhance pulse.'],
  },
  {
    id: 'wizard-spell-echo-and-goblin-kill',
    group: 'AoE And Kill Chains',
    label: 'Spell Echo + Goblin Behavior',
    summary: 'Wizard Blast should chain into fresh adjacent hexes, and goblin kills should drain initiative on the kill hex.',
    seed: 101,
    player: selection({
      'goblin/wizard': startCount('goblin/wizard'),
      'goblin/soldier': startCount('goblin/soldier'),
    }),
    enemy: selection({ 'human/soldier': startCount('human/soldier', 3) }),
    playerFactionUpgradeIds: ['goblin-behavior'],
    playerTroopTypeUpgradeIds: ['wizard-spell-echo'],
    enemyFactionUpgradeIds: [],
    enemyTroopTypeUpgradeIds: [],
    coveredAbilityIds: ['spell-echo', 'snatch-the-moment'],
    signals: [{ id: 'drain', label: 'Kill drains initiative', match: 'loses 20 initiative' }],
    manualChecks: [
      'Confirm the Blast chain produces multiple successive blast steps from one Wizard action without revisiting the same map cell.',
      'Confirm the initiative drain stays on the kill hex rather than affecting remote enemies.',
    ],
  },
  {
    id: 'troll-last-stand',
    group: 'Death Responses',
    label: 'Mossblood + Roll the Boulder',
    summary: 'A troll should survive lethal damage once at 25 HP, then punish melee kills by sweeping the hex.',
    seed: 104,
    player: selection({ 'troll/soldier': startCount('troll/soldier') }),
    enemy: selection({ 'human/soldier': startCount('human/soldier', 3) }),
    playerFactionUpgradeIds: ['troll-mossblood', 'troll-roll-the-boulder'],
    playerTroopTypeUpgradeIds: [],
    enemyFactionUpgradeIds: [],
    enemyTroopTypeUpgradeIds: [],
    coveredAbilityIds: ['stoneblood', 'crushing-sweep'],
    signals: [
      { id: 'stoneblood', label: 'Troll survives at 25 HP', match: 'stays at 25 HP' },
      { id: 'sweep', label: 'Melee kill triggers sweep', match: 'crushes nearby enemies' },
    ],
    manualChecks: [
      'Confirm Regen is gone after Stoneblood triggers.',
      'Confirm Crushing Sweep only fires on melee kills and only hits enemies touching the fallen unit.',
    ],
  },
];

export const ABILITY_VERIFICATION_SCENARIOS_BY_ID = Object.fromEntries(
  ABILITY_VERIFICATION_SCENARIOS.map((scenario) => [scenario.id, scenario]),
) as Record<string, AbilityVerificationScenario>;
