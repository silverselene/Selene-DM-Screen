/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source:     ../5etools-src/data/bestiary/bestiary-*.json
 * Generator:  scripts/src/data-generators/generate-monsters.ts
 * Pinned to:  5etools-src @ v2.31.0
 * License:    5etools content is MIT-licensed by its respective authors.
 * Entries:    40
 *
 * Regenerate with: pnpm --filter @workspace/scripts run generate:<name>
 */

export interface MonsterTrait {
  name: string;
  desc: string;
}

export interface Monster {
  name: string;
  size: string;
  type: string;
  alignment: string;
  ac: number;
  acType: string;
  hp: string;
  speed: string;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  savingThrows?: string;
  skills?: string;
  damageImmunities?: string;
  damageResistances?: string;
  damageVulnerabilities?: string;
  conditionImmunities?: string;
  senses: string;
  languages: string;
  cr: string;
  traits?: MonsterTrait[];
  actions: MonsterTrait[];
  reactions?: MonsterTrait[];
  legendaryActions?: MonsterTrait[];
}

export function mod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

export const crOrder = [
  "0", "1/8", "1/4", "1/2", "1", "2", "3", "4", "5",
  "6", "7", "8", "9", "10", "11", "12", "13", "14", "15",
  "16", "17", "18", "19", "20", "21", "22", "23", "24", "25", "30",
];

export function crToNumber(cr: string): number {
  if (cr === "1/8") return 0.125;
  if (cr === "1/4") return 0.25;
  if (cr === "1/2") return 0.5;
  return parseFloat(cr) || 0;
}

export const bestiaryData: Monster[] = [
  {
    name: "Aboleth",
    size: "Large",
    type: "aberration",
    alignment: "lawful evil",
    ac: 17,
    acType: "",
    hp: "150 (20d10 + 40)",
    speed: "10 ft., swim 40 ft.",
    str: 21,
    dex: 9,
    con: 15,
    int: 18,
    wis: 15,
    cha: 18,
    senses: "Darkvision 120 ft., passive Perception 20",
    languages: "Deep Speech; telepathy 120 ft.",
    cr: "10",
    actions: [
      {
        name: "Multiattack",
        desc: "The aboleth makes two Tentacle attacks and uses either Consume Memories or Dominate Mind if available.",
      },
      {
        name: "Tentacle",
        desc: "Melee Attack Roll: +9, reach 15 ft. Hit: 12 (2d6 + 5) Bludgeoning damage. If the target is a Large or smaller creature, it has the Grappled condition (escape DC 14) from one of four tentacles.",
      },
      {
        name: "Consume Memories",
        desc: "Int Save: DC 16, one creature within 30 feet that is Charmed or Grappled by the aboleth. Failure: 10 (3d6) Psychic damage. Success: Half damage. Success or Failure: The aboleth gains the target's memories if the target is a Humanoid and is reduced to 0 Hit Points by this action.",
      },
      {
        name: "Dominate Mind (2/Day)",
        desc: "Wis Save: DC 16, one creature the aboleth can see within 30 feet. Failure: The target has the Charmed condition until the aboleth dies or is on a different plane of existence from the target. While Charmed, the target acts as an ally to the aboleth and is under its control while within 60 feet of it. In addition, the aboleth and the target can communicate telepathically with each other over any distance.\nThe target repeats the save whenever it takes damage as well as after every 24 hours it spends at least 1 mile away from the aboleth, ending the effect on itself on a success.",
      },
    ],
    savingThrows: "Dex +3, Con +6, Int +8, Wis +6",
    skills: "History +12, Perception +10",
    traits: [
      {
        name: "Amphibious",
        desc: "The aboleth can breathe air and water.",
      },
      {
        name: "Eldritch Restoration",
        desc: "If destroyed, the aboleth gains a new body in 5d10 days, reviving with all its Hit Points in the Far Realm or another location chosen by the DM.",
      },
      {
        name: "Legendary Resistance (3/Day, or 4/Day in Lair)",
        desc: "If the aboleth fails a saving throw, it can choose to succeed instead.",
      },
      {
        name: "Mucus Cloud",
        desc: "While underwater, the aboleth is surrounded by mucus. Con Save: DC 14, each creature in a 5-foot Emanation [Area of Effect] originating from the aboleth at the end of the aboleth's turn. Failure: The target is cursed. Until the curse ends, the target's skin becomes slimy, the target can breathe air and water, and it can't regain Hit Points unless it is underwater.\nWhile the cursed creature is outside a body of water, the creature takes 6 (1d12) Acid damage at the end of every 10 minutes unless moisture is applied to its skin before those minutes have passed.",
      },
      {
        name: "Probing Telepathy",
        desc: "If a creature the aboleth can see communicates telepathically with the aboleth, the aboleth learns the creature's greatest desires.",
      },
    ],
    legendaryActions: [
      {
        name: "Lash",
        desc: "The aboleth makes one Tentacle attack.",
      },
      {
        name: "Psychic Drain",
        desc: "If the aboleth has at least one creature Charmed or Grappled, it uses Consume Memories and regains 5 (1d10) Hit Points.",
      },
    ],
  },
  {
    name: "Adult Red Dragon",
    size: "Huge",
    type: "dragon (chromatic)",
    alignment: "chaotic evil",
    ac: 19,
    acType: "",
    hp: "256 (19d12 + 133)",
    speed: "40 ft., climb 40 ft., fly 80 ft.",
    str: 27,
    dex: 10,
    con: 25,
    int: 16,
    wis: 13,
    cha: 23,
    senses: "Blindsight 60 ft., Darkvision 120 ft., passive Perception 23",
    languages: "Common, Draconic",
    cr: "17",
    actions: [
      {
        name: "Multiattack",
        desc: "The dragon makes three Rend attacks. It can replace one attack with a use of Spellcasting to cast Scorching Ray.",
      },
      {
        name: "Rend",
        desc: "Melee Attack Roll: +14, reach 10 ft. Hit: 13 (1d10 + 8) Slashing damage plus 5 (2d4) Fire damage.",
      },
      {
        name: "Fire Breath 5",
        desc: "Dex Save: DC 21, each creature in a 60-foot Cone [Area of Effect]. Failure: 59 (17d6) Fire damage. Success: Half damage.",
      },
    ],
    savingThrows: "Dex +6, Wis +7",
    skills: "Perception +13, Stealth +6",
    damageImmunities: "fire",
    traits: [
      {
        name: "Legendary Resistance (3/Day, or 4/Day in Lair)",
        desc: "If the dragon fails a saving throw, it can choose to succeed instead.",
      },
    ],
    legendaryActions: [
      {
        name: "Commanding Presence",
        desc: "The dragon uses Spellcasting to cast Command (level 2 version). The dragon can't take this action again until the start of its next turn.",
      },
      {
        name: "Fiery Rays",
        desc: "The dragon uses Spellcasting to cast Scorching Ray. The dragon can't take this action again until the start of its next turn.",
      },
      {
        name: "Pounce",
        desc: "The dragon moves up to half its Speed, and it makes one Rend attack.",
      },
    ],
  },
  {
    name: "Ancient Black Dragon",
    size: "Gargantuan",
    type: "dragon (chromatic)",
    alignment: "chaotic evil",
    ac: 22,
    acType: "",
    hp: "367 (21d20 + 147)",
    speed: "40 ft., fly 80 ft., swim 40 ft.",
    str: 27,
    dex: 14,
    con: 25,
    int: 16,
    wis: 15,
    cha: 22,
    senses: "Blindsight 60 ft., Darkvision 120 ft., passive Perception 26",
    languages: "Common, Draconic",
    cr: "21",
    actions: [
      {
        name: "Multiattack",
        desc: "The dragon makes three Rend attacks. It can replace one attack with a use of Spellcasting to cast Melf's Acid Arrow (level 4 version).",
      },
      {
        name: "Rend",
        desc: "Melee Attack Roll: +15, reach 15 ft. Hit: 17 (2d8 + 8) Slashing damage plus 9 (2d8) Acid damage.",
      },
      {
        name: "Acid Breath 5",
        desc: "Dex Save: DC 22, each creature in a 90-foot-long, 10-foot-wide Line [Area of Effect]. Failure: 67 (15d8) Acid damage. Success: Half damage.",
      },
    ],
    savingThrows: "Dex +9, Wis +9",
    skills: "Perception +16, Stealth +9",
    damageImmunities: "acid",
    traits: [
      {
        name: "Amphibious",
        desc: "The dragon can breathe air and water.",
      },
      {
        name: "Legendary Resistance (4/Day, or 5/Day in Lair)",
        desc: "If the dragon fails a saving throw, it can choose to succeed instead.",
      },
    ],
    legendaryActions: [
      {
        name: "Cloud of Insects",
        desc: "Dex Save: DC 21, one creature the dragon can see within 120 feet. Failure: 33 (6d10) Poison damage, and the target has Disadvantage on saving throws to maintain Concentration until the end of its next turn. Success or Failure: The dragon can't take this action again until the start of its next turn.",
      },
      {
        name: "Frightful Presence",
        desc: "The dragon uses Spellcasting to cast Fear. The dragon can't take this action again until the start of its next turn.",
      },
      {
        name: "Pounce",
        desc: "The dragon moves up to half its Speed, and it makes one Rend attack.",
      },
    ],
  },
  {
    name: "Bandit",
    size: "Small",
    type: "humanoid",
    alignment: "neutral",
    ac: 12,
    acType: "",
    hp: "11 (2d8 + 2)",
    speed: "30 ft.",
    str: 11,
    dex: 12,
    con: 12,
    int: 10,
    wis: 10,
    cha: 10,
    senses: "passive Perception 10",
    languages: "Common, Thieves' cant",
    cr: "1/8",
    actions: [
      {
        name: "Scimitar",
        desc: "Melee Attack Roll: +3, reach 5 ft. Hit: 4 (1d6 + 1) Slashing damage.",
      },
      {
        name: "Light Crossbow",
        desc: "Ranged Attack Roll: +3, range 80/320 ft. Hit: 5 (1d8 + 1) Piercing damage.",
      },
    ],
  },
  {
    name: "Bandit Captain",
    size: "Small",
    type: "humanoid",
    alignment: "neutral",
    ac: 15,
    acType: "",
    hp: "52 (8d8 + 16)",
    speed: "30 ft.",
    str: 15,
    dex: 16,
    con: 14,
    int: 14,
    wis: 11,
    cha: 14,
    senses: "passive Perception 10",
    languages: "Common, Thieves' cant",
    cr: "2",
    actions: [
      {
        name: "Multiattack",
        desc: "The bandit makes two attacks, using Scimitar and Pistol in any combination.",
      },
      {
        name: "Scimitar",
        desc: "Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3) Slashing damage.",
      },
      {
        name: "Pistol",
        desc: "Ranged Attack Roll: +5, range 30/90 ft. Hit: 8 (1d10 + 3) Piercing damage.",
      },
    ],
    savingThrows: "Str +4, Dex +5, Wis +2",
    skills: "Athletics +4, Deception +4",
    reactions: [
      {
        name: "Parry",
        desc: "Trigger: The bandit is hit by a melee attack roll while holding a weapon. Response: The bandit adds 2 to its AC against that attack, possibly causing it to miss.",
      },
    ],
  },
  {
    name: "Beholder",
    size: "Large",
    type: "aberration",
    alignment: "lawful evil",
    ac: 18,
    acType: "",
    hp: "190 (20d10 + 80)",
    speed: "5 ft., fly 40 ft. ((hover)), hover",
    str: 16,
    dex: 14,
    con: 18,
    int: 17,
    wis: 15,
    cha: 17,
    senses: "Darkvision 120 ft., passive Perception 22",
    languages: "Deep Speech, Undercommon",
    cr: "13",
    actions: [
      {
        name: "Multiattack",
        desc: "The beholder uses Eye Rays three times.",
      },
      {
        name: "Bite",
        desc: "Melee Attack Roll: +8, reach 5 ft. Hit: 13 (3d6 + 3) Piercing damage.",
      },
      {
        name: "Eye Rays",
        desc: "The beholder randomly shoots one of the following magical rays at a target it can see within 120 feet of itself (roll 1d10; reroll if the beholder has already used that ray during this turn):\n• 1: Charm Ray:\nWis Save: DC 16. Failure: 13 (3d8) Psychic damage, and the target has the Charmed condition for 1 hour or until it takes damage. Success: Half damage only.\n• 2: Paralyzing Ray:\nCon Save: DC 16. Failure: The target has the Paralyzed condition and repeats the save at the end of each of its turns, ending the effect on itself on a success. After 1 minute, it succeeds automatically.\n• 3: Fear Ray:\nWis Save: DC 16. Failure: 14 (4d6) Psychic damage, and the target has the Frightened condition until the end of its next turn. Success: Half damage only.\n• 4: Slowing Ray:\nCon Save: DC 16. Failure: 18 (4d8) Necrotic damage. Until the end of the target's next turn, the target's Speed is halved; the target can't take Reactions; and it can take either an action or a Bonus Action on its turn, not both. Success: Half damage only.\n• 5: Enervation Ray:\nCon Save: DC 16. Failure: 13 (3d8) Poison damage, and the target has the Poisoned condition until the end of its next turn. While Poisoned, the target can't regain Hit Points. Success: Half damage only.\n• 6: Telekinetic Ray:\nStr Save: DC 16 (the target succeeds automatically if it is Gargantuan). Failure: The beholder moves the target up to 30 feet in any direction. The target has the Restrained condition until the start of the beholder's next turn or until the beholder has the Incapacitated condition. The beholder can also exert fine control on objects with this ray, such as manipulating a tool or opening a door or container.\n• 7: Sleep Ray:\nWis Save: DC 16 (the target succeeds automatically if it is a Construct or an Undead). Failure: The target has the Unconscious condition for 1 minute. The condition ends if the target takes damage or a creature within 5 feet of it takes an action to wake it.\n• 8: Petrification Ray:\nCon Save: DC 16. 1 The target has the Restrained condition and repeats the save at the end of its next turn if it is still Restrained, ending the effect on itself on a success. 2 The target has the Petrified condition instead of the Restrained condition.\n• 9: Disintegration Ray:\nDex Save: DC 16. Failure: 36 (8d8) Force damage. If the target is a nonmagical object or a creation of magical force, a 10-foot Cube [Area of Effect] of it disintegrates into dust. Success: Half damage. Success or Failure: If the target is a creature and this damage reduces it to 0 Hit Points, it disintegrates into dust.\n• 10: Death Ray:\nDex Save: DC 16. Failure: 55 (10d10) Necrotic damage. Success: Half damage. Success or Failure: The target dies if the ray reduces it to 0 Hit Points.",
      },
    ],
    savingThrows: "Con +9, Wis +7",
    skills: "Perception +12",
    conditionImmunities: "prone",
    traits: [
      {
        name: "Legendary Resistance (3/Day, or 4/Day in Lair)",
        desc: "If the beholder fails a saving throw, it can choose to succeed instead.",
      },
    ],
    legendaryActions: [
      {
        name: "Chomp",
        desc: "The beholder makes two Bite attacks.",
      },
      {
        name: "Glare",
        desc: "The beholder uses Eye Rays.",
      },
    ],
  },
  {
    name: "Bugbear",
    size: "Medium",
    type: "humanoid (goblinoid)",
    alignment: "chaotic evil",
    ac: 16,
    acType: "hide armor, shield",
    hp: "27 (5d8 + 5)",
    speed: "30 ft.",
    str: 15,
    dex: 14,
    con: 13,
    int: 8,
    wis: 11,
    cha: 9,
    senses: "darkvision 60 ft., passive Perception 10",
    languages: "Common, Goblin",
    cr: "1",
    actions: [
      {
        name: "Morningstar",
        desc: "Melee Weapon Attack Roll: +4 to hit, reach 5 ft., one target. Hit: 11 (2d8 + 2) piercing damage.",
      },
      {
        name: "Javelin",
        desc: "Melee Weapon or Ranged Weapon Attack Roll: +4 to hit, reach 5 ft. or range 30/120 ft., one target. Hit: 9 (2d6 + 2) piercing damage in melee or 5 (1d6 + 2) piercing damage at range.",
      },
    ],
    skills: "Stealth +6, Survival +2",
    traits: [
      {
        name: "Brute",
        desc: "A melee weapon deals one extra die of its damage when the bugbear hits with it (included in the attack).",
      },
      {
        name: "Surprise Attack",
        desc: "If the bugbear surprises a creature and hits it with an attack during the first round of combat, the target takes an extra 7 (2d6) damage from the attack.",
      },
    ],
  },
  {
    name: "Dire Wolf",
    size: "Large",
    type: "beast",
    alignment: "unaligned",
    ac: 14,
    acType: "",
    hp: "22 (3d10 + 6)",
    speed: "50 ft.",
    str: 17,
    dex: 15,
    con: 15,
    int: 3,
    wis: 12,
    cha: 7,
    senses: "Darkvision 60 ft., passive Perception 15",
    languages: "—",
    cr: "1",
    actions: [
      {
        name: "Bite",
        desc: "Melee Attack Roll: +5, reach 5 ft. Hit: 8 (1d10 + 3) Piercing damage. If the target is a Large or smaller creature, it has the Prone condition.",
      },
    ],
    skills: "Perception +5, Stealth +4",
    traits: [
      {
        name: "Pack Tactics",
        desc: "The wolf has Advantage on an attack roll against a creature if at least one of the wolf's allies is within 5 feet of the creature and the ally doesn't have the Incapacitated condition.",
      },
    ],
  },
  {
    name: "Dragon Turtle",
    size: "Gargantuan",
    type: "dragon",
    alignment: "neutral",
    ac: 20,
    acType: "",
    hp: "356 (23d20 + 115)",
    speed: "20 ft., swim 50 ft.",
    str: 25,
    dex: 10,
    con: 20,
    int: 10,
    wis: 12,
    cha: 12,
    senses: "Darkvision 120 ft., passive Perception 11",
    languages: "Draconic, Primordial (Aquan)",
    cr: "17",
    actions: [
      {
        name: "Multiattack",
        desc: "The dragon makes three Bite attacks. It can replace one attack with a Tail attack.",
      },
      {
        name: "Bite",
        desc: "Melee Attack Roll: +13, reach 15 ft. Hit: 23 (3d10 + 7) Piercing damage plus 7 (2d6) Fire damage. Being underwater doesn't grant Resistance to this Fire damage.",
      },
      {
        name: "Tail",
        desc: "Melee Attack Roll: +13, reach 15 ft. Hit: 18 (2d10 + 7) Bludgeoning damage. If the target is a Huge or smaller creature, it has the Prone condition.",
      },
      {
        name: "Steam Breath 5",
        desc: "Con Save: DC 19, each creature in a 60-foot Cone [Area of Effect]. Failure: 56 (16d6) Fire damage. Success: Half damage. Success or Failure: Being underwater doesn't grant Resistance to this Fire damage.",
      },
    ],
    savingThrows: "Con +11, Wis +7",
    damageResistances: "fire",
    traits: [
      {
        name: "Amphibious",
        desc: "The dragon can breathe air and water.",
      },
    ],
  },
  {
    name: "Drow",
    size: "Medium",
    type: "humanoid (elf)",
    alignment: "neutral evil",
    ac: 15,
    acType: "chain shirt",
    hp: "13 (3d8)",
    speed: "30 ft.",
    str: 10,
    dex: 14,
    con: 10,
    int: 11,
    wis: 11,
    cha: 12,
    senses: "darkvision 120 ft., passive Perception 12",
    languages: "Elvish, Undercommon",
    cr: "1/4",
    actions: [
      {
        name: "Shortsword",
        desc: "Melee Weapon Attack Roll: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) piercing damage.",
      },
      {
        name: "Hand Crossbow",
        desc: "Ranged Weapon Attack Roll: +4 to hit, range 30/120 ft., one target. Hit: 5 (1d6 + 2) piercing damage, and the target must succeed on a DC 13 Constitution saving throw or be poisoned for 1 hour. If the saving throw fails by 5 or more, the target is also unconscious while poisoned in this way. The target wakes up if it takes damage or if another creature takes an action to shake it awake.",
      },
    ],
    skills: "Perception +2, Stealth +4",
    traits: [
      {
        name: "Fey Ancestry",
        desc: "The drow has advantage on saving throws against being charmed, and magic can't put the drow to sleep.",
      },
      {
        name: "Sunlight Sensitivity",
        desc: "While in sunlight, the drow has disadvantage on attack rolls, as well as on Wisdom (Perception) checks that rely on sight.",
      },
    ],
  },
  {
    name: "Flesh Golem",
    size: "Medium",
    type: "construct",
    alignment: "neutral",
    ac: 9,
    acType: "",
    hp: "127 (15d8 + 60)",
    speed: "30 ft.",
    str: 19,
    dex: 9,
    con: 18,
    int: 6,
    wis: 10,
    cha: 5,
    senses: "Darkvision 60 ft., passive Perception 10",
    languages: "understands Common plus one other language but can't speak",
    cr: "5",
    actions: [
      {
        name: "Multiattack",
        desc: "The golem makes two Slam attacks.",
      },
      {
        name: "Slam",
        desc: "Melee Attack Roll: +7, reach 5 ft. Hit: 13 (2d8 + 4) Bludgeoning damage plus 4 (1d8) Lightning damage.",
      },
    ],
    damageImmunities: "lightning; poison",
    conditionImmunities: "charmed; exhaustion; frightened; paralyzed; petrified; poisoned",
    traits: [
      {
        name: "Aversion to Fire",
        desc: "If the golem takes Fire damage, it has Disadvantage on attack rolls and ability checks until the end of its next turn.",
      },
      {
        name: "Berserk",
        desc: "Whenever the golem starts its turn Bloodied, roll 1d6. On a 6, the golem goes berserk. On each of its turns while berserk, the golem attacks the nearest creature it can see. If no creature is near enough to move to and attack, the golem attacks an object. Once the golem goes berserk, it remains so until it is destroyed or it is no longer Bloodied.\nThe golem's creator, if within 60 feet of the berserk golem, can try to calm it by taking an action to make a DC 15 Charisma (Persuasion) check; the golem must be able to hear its creator. If this check succeeds, the golem ceases being berserk until the start of its next turn, at which point it resumes rolling for the Berserk trait again if it is still Bloodied.",
      },
      {
        name: "Immutable Form",
        desc: "The golem can't shape-shift.",
      },
      {
        name: "Lightning Absorption",
        desc: "Whenever the golem is subjected to Lightning damage, it regains a number of Hit Points equal to the Lightning damage dealt.",
      },
      {
        name: "Magic Resistance",
        desc: "The golem has Advantage on saving throws against spells and other magical effects.",
      },
    ],
  },
  {
    name: "Gelatinous Cube",
    size: "Large",
    type: "ooze",
    alignment: "unaligned",
    ac: 6,
    acType: "",
    hp: "63 (6d10 + 30)",
    speed: "15 ft.",
    str: 14,
    dex: 3,
    con: 20,
    int: 1,
    wis: 6,
    cha: 1,
    senses: "Blindsight 60 ft., passive Perception 8",
    languages: "—",
    cr: "2",
    actions: [
      {
        name: "Pseudopod",
        desc: "Melee Attack Roll: +4, reach 5 ft. Hit: 12 (3d6 + 2) Acid damage.",
      },
      {
        name: "Engulf",
        desc: "The cube moves up to its Speed without provoking Opportunity Attack. The cube can move through the spaces of Large or smaller creatures if it has room inside itself to contain them (see the Ooze Cube [Area of Effect] trait). Dex Save: DC 12, each creature whose space the cube enters for the first time during this move. Failure: 10 (3d6) Acid damage, and the target is engulfed. An engulfed target is suffocating, can't cast spells with a Verbal component, has the Restrained condition, and takes 10 (3d6) Acid damage at the start of each of the cube's turns. When the cube moves, the engulfed target moves with it. An engulfed target can try to escape by taking an action to make a DC 12 Strength (Athletics) check. On a successful check, the target escapes and enters the nearest unoccupied space. Success: Half damage, and the target moves to an unoccupied space within 5 feet of the cube. If there is no unoccupied space, the target fails the save instead.",
      },
    ],
    damageImmunities: "acid",
    conditionImmunities: "blinded; charmed; deafened; exhaustion; frightened; prone",
    traits: [
      {
        name: "Ooze Cube",
        desc: "The cube fills its entire space and is transparent. Other creatures can enter that space, but a creature that does so is subjected to the cube's Engulf and has Disadvantage on the saving throw.\nCreatures inside the cube have Cover, and the cube can hold one Large creature or up to four Medium or Small creatures inside itself at a time.\nAs an action, a creature within 5 feet of the cube can pull a creature or an object out of the cube by succeeding on a DC 12 Strength (Athletics) check, and the puller takes 10 (3d6) Acid damage.",
      },
      {
        name: "Transparent",
        desc: "Even when the cube is in plain sight, a creature must succeed on a DC 15 Wisdom (Perception) check to notice the cube if the creature hasn't witnessed the cube move or otherwise act.",
      },
    ],
  },
  {
    name: "Gnoll",
    size: "Medium",
    type: "humanoid (gnoll)",
    alignment: "chaotic evil",
    ac: 15,
    acType: "hide armor, shield",
    hp: "22 (5d8)",
    speed: "30 ft.",
    str: 14,
    dex: 12,
    con: 11,
    int: 6,
    wis: 10,
    cha: 7,
    senses: "darkvision 60 ft., passive Perception 10",
    languages: "Gnoll",
    cr: "1/2",
    actions: [
      {
        name: "Bite",
        desc: "Melee Weapon Attack Roll: +4 to hit, reach 5 ft., one creature. Hit: 4 (1d4 + 2) piercing damage.",
      },
      {
        name: "Spear",
        desc: "Melee Weapon or Ranged Weapon Attack Roll: +4 to hit, reach 5 ft. or range 20/60 ft., one target. Hit: 5 (1d6 + 2) piercing damage, or 6 (1d8 + 2) piercing damage if used with two hands to make a melee attack.",
      },
      {
        name: "Longbow",
        desc: "Ranged Weapon Attack Roll: +3 to hit, range 150/600 ft., one target. Hit: 5 (1d8 + 1) piercing damage.",
      },
    ],
    traits: [
      {
        name: "Rampage",
        desc: "When the gnoll reduces a creature to 0 hit points with a melee attack on its turn, the gnoll can take a bonus action to move up to half its speed and make a bite attack.",
      },
    ],
  },
  {
    name: "Goblin",
    size: "Small",
    type: "humanoid (goblinoid)",
    alignment: "neutral evil",
    ac: 15,
    acType: "leather armor, shield",
    hp: "7 (2d6)",
    speed: "30 ft.",
    str: 8,
    dex: 14,
    con: 10,
    int: 10,
    wis: 8,
    cha: 8,
    senses: "darkvision 60 ft., passive Perception 9",
    languages: "Common, Goblin",
    cr: "1/4",
    actions: [
      {
        name: "Scimitar",
        desc: "Melee Weapon Attack Roll: +4 to hit, reach 5 ft., one target. Hit: 5 (1d6 + 2) slashing damage.",
      },
      {
        name: "Shortbow",
        desc: "Ranged Weapon Attack Roll: +4 to hit, range 80/320 ft., one target. Hit: 5 (1d6 + 2) piercing damage.",
      },
    ],
    skills: "Stealth +6",
    traits: [
      {
        name: "Nimble Escape",
        desc: "The goblin can take the Disengage or Hide action as a bonus action on each of its turns.",
      },
    ],
  },
  {
    name: "Goblin Boss",
    size: "Small",
    type: "fey (goblinoid)",
    alignment: "chaotic neutral",
    ac: 17,
    acType: "",
    hp: "21 (6d6)",
    speed: "30 ft.",
    str: 10,
    dex: 15,
    con: 10,
    int: 10,
    wis: 8,
    cha: 10,
    senses: "Darkvision 60 ft., passive Perception 9",
    languages: "Common, Goblin",
    cr: "1",
    actions: [
      {
        name: "Multiattack",
        desc: "The goblin makes two attacks, using Scimitar or Shortbow in any combination.",
      },
      {
        name: "Scimitar",
        desc: "Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage, plus 2 (1d4) Slashing damage if the attack roll had Advantage.",
      },
      {
        name: "Shortbow",
        desc: "Ranged Attack Roll: +4, range 80/320 ft. Hit: 5 (1d6 + 2) Piercing damage, plus 2 (1d4) Piercing damage if the attack roll had Advantage.",
      },
    ],
    skills: "Stealth +6",
    reactions: [
      {
        name: "Redirect Attack",
        desc: "Trigger: A creature the goblin can see makes an attack roll against it. Response: The goblin chooses a Small or Medium ally within 5 feet of itself. The goblin and that ally swap places, and the ally becomes the target of the attack instead.",
      },
    ],
  },
  {
    name: "Harpy",
    size: "Medium",
    type: "monstrosity",
    alignment: "chaotic evil",
    ac: 11,
    acType: "",
    hp: "38 (7d8 + 7)",
    speed: "20 ft., fly 40 ft.",
    str: 12,
    dex: 13,
    con: 12,
    int: 7,
    wis: 10,
    cha: 13,
    senses: "passive Perception 10",
    languages: "Common",
    cr: "1",
    actions: [
      {
        name: "Claw",
        desc: "Melee Attack Roll: +3, reach 5 ft. Hit: 6 (2d4 + 1) Slashing damage.",
      },
      {
        name: "Luring Song",
        desc: "The harpy sings a magical melody, which lasts until the harpy's Concentration ends on it. Wis Save: DC 11, each Humanoid and Giant in a 300-foot Emanation [Area of Effect] originating from the harpy when the song starts. Failure: The target has the Charmed condition until the song ends and repeats the save at the end of each of its turns. While Charmed, the target has the Incapacitated condition and ignores the Luring Song of other harpies. If the target is more than 5 feet from the harpy, the target moves on its turn toward the harpy by the most direct route, trying to get within 5 feet of the harpy. It doesn't avoid Opportunity Attack; however, before moving into damaging terrain (such as lava or a pit) and whenever it takes damage from a source other than the harpy, the target repeats the save. Success: The target is immune to this harpy's Luring Song for 24 hours.",
      },
    ],
  },
  {
    name: "Hill Giant",
    size: "Huge",
    type: "giant",
    alignment: "chaotic evil",
    ac: 13,
    acType: "",
    hp: "105 (10d12 + 40)",
    speed: "40 ft.",
    str: 21,
    dex: 8,
    con: 19,
    int: 5,
    wis: 9,
    cha: 6,
    senses: "passive Perception 12",
    languages: "Giant",
    cr: "5",
    actions: [
      {
        name: "Multiattack",
        desc: "The giant makes two attacks, using Tree Club or Trash Lob in any combination.",
      },
      {
        name: "Tree Club",
        desc: "Melee Attack Roll: +8, reach 10 ft. Hit: 18 (3d8 + 5) Bludgeoning damage. If the target is a Large or smaller creature, it has the Prone condition.",
      },
      {
        name: "Trash Lob",
        desc: "Ranged Attack Roll: +8, range 60/240 ft. Hit: 16 (2d10 + 5) Bludgeoning damage, and the target has the Poisoned condition until the end of its next turn.",
      },
    ],
    skills: "Perception +2",
  },
  {
    name: "Hobgoblin",
    size: "Medium",
    type: "humanoid (goblinoid)",
    alignment: "lawful evil",
    ac: 18,
    acType: "chain mail, shield",
    hp: "11 (2d8 + 2)",
    speed: "30 ft.",
    str: 13,
    dex: 12,
    con: 12,
    int: 10,
    wis: 10,
    cha: 9,
    senses: "darkvision 60 ft., passive Perception 10",
    languages: "Common, Goblin",
    cr: "1/2",
    actions: [
      {
        name: "Longsword",
        desc: "Melee Weapon Attack Roll: +3 to hit, reach 5 ft., one target. Hit: 5 (1d8 + 1) slashing damage, or 6 (1d10 + 1) slashing damage if used with two hands.",
      },
      {
        name: "Longbow",
        desc: "Ranged Weapon Attack Roll: +3 to hit, range 150/600 ft., one target. Hit: 5 (1d8 + 1) piercing damage.",
      },
    ],
    traits: [
      {
        name: "Martial Advantage",
        desc: "Once per turn, the hobgoblin can deal an extra 7 (2d6) damage to a creature it hits with a weapon attack if that creature is within 5 feet of an ally of the hobgoblin that isn't incapacitated.",
      },
    ],
  },
  {
    name: "Hydra",
    size: "Huge",
    type: "monstrosity",
    alignment: "unaligned",
    ac: 15,
    acType: "",
    hp: "184 (16d12 + 80)",
    speed: "40 ft., swim 40 ft.",
    str: 20,
    dex: 12,
    con: 20,
    int: 2,
    wis: 10,
    cha: 7,
    senses: "Darkvision 60 ft., passive Perception 16",
    languages: "—",
    cr: "8",
    actions: [
      {
        name: "Multiattack",
        desc: "The hydra makes as many Bite attacks as it has heads.",
      },
      {
        name: "Bite",
        desc: "Melee Attack Roll: +8, reach 10 ft. Hit: 10 (1d10 + 5) Piercing damage.",
      },
    ],
    skills: "Perception +6",
    conditionImmunities: "blinded; charmed; deafened; frightened; stunned; unconscious",
    traits: [
      {
        name: "Hold Breath",
        desc: "The hydra can hold its breath for 1 hour.",
      },
      {
        name: "Multiple Heads",
        desc: "The hydra has five heads. Whenever the hydra takes 25 damage or more on a single turn, one of its heads dies. The hydra dies if all its heads are dead. At the end of each of its turns when it has at least one living head, the hydra grows two heads for each of its heads that died since its last turn, unless it has taken Fire damage since its last turn. The hydra regains 20 Hit Points when it grows new heads.",
      },
      {
        name: "Reactive Heads",
        desc: "For each head the hydra has beyond one, it gets an extra Reaction that can be used only for Opportunity Attack.",
      },
    ],
  },
  {
    name: "Imp",
    size: "Tiny",
    type: "fiend (devil)",
    alignment: "lawful evil",
    ac: 13,
    acType: "",
    hp: "21 (6d4 + 6)",
    speed: "20 ft., fly 40 ft.",
    str: 6,
    dex: 17,
    con: 13,
    int: 11,
    wis: 12,
    cha: 14,
    senses: "Darkvision 120 ft. (unimpeded by magical Darkness), passive Perception 11",
    languages: "Common, Infernal",
    cr: "1",
    actions: [
      {
        name: "Sting",
        desc: "Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3) Piercing damage plus 7 (2d6) Poison damage.",
      },
      {
        name: "Shape-Shift",
        desc: "The imp shape-shifts to resemble a rat (Speed 20 ft.), a raven (20 ft., Fly 60 ft.), or a spider (20 ft., Climb 20 ft.), or it returns to its true form. Its statistics are the same in each form, except for its Speed. Any equipment it is wearing or carrying isn't transformed.",
      },
    ],
    skills: "Deception +4, Insight +3, Stealth +5",
    damageImmunities: "fire; poison",
    damageResistances: "cold",
    conditionImmunities: "poisoned",
    traits: [
      {
        name: "Magic Resistance",
        desc: "The imp has Advantage on saving throws against spells and other magical effects.",
      },
    ],
  },
  {
    name: "Kobold",
    size: "Small",
    type: "humanoid (kobold)",
    alignment: "lawful evil",
    ac: 12,
    acType: "",
    hp: "5 (2d6 - 2)",
    speed: "30 ft.",
    str: 7,
    dex: 15,
    con: 9,
    int: 8,
    wis: 7,
    cha: 8,
    senses: "darkvision 60 ft., passive Perception 8",
    languages: "Common, Draconic",
    cr: "1/8",
    actions: [
      {
        name: "Dagger",
        desc: "Melee Weapon Attack Roll: +4 to hit, reach 5 ft., one target. Hit: 4 (1d4 + 2) piercing damage.",
      },
      {
        name: "Sling",
        desc: "Ranged Weapon Attack Roll: +4 to hit, range 30/120 ft., one target. Hit: 4 (1d4 + 2) bludgeoning damage.",
      },
    ],
    traits: [
      {
        name: "Sunlight Sensitivity",
        desc: "While in sunlight, the kobold has disadvantage on attack rolls, as well as on Wisdom (Perception) checks that rely on sight.",
      },
      {
        name: "Pack Tactics",
        desc: "The kobold has advantage on an attack roll against a creature if at least one of the kobold's allies is within 5 feet of the creature and the ally isn't incapacitated.",
      },
    ],
  },
  {
    name: "Lich",
    size: "Medium",
    type: "undead (wizard)",
    alignment: "neutral evil",
    ac: 20,
    acType: "",
    hp: "315 (42d8 + 126)",
    speed: "30 ft.",
    str: 11,
    dex: 16,
    con: 16,
    int: 21,
    wis: 14,
    cha: 16,
    senses: "Truesight 120 ft., passive Perception 19",
    languages: "all",
    cr: "21",
    actions: [
      {
        name: "Multiattack",
        desc: "The lich makes three attacks, using Eldritch Burst or Paralyzing Touch in any combination.",
      },
      {
        name: "Eldritch Burst",
        desc: "Melee or Ranged Attack Roll: +12, reach 5 ft. or range 120 ft. Hit: 31 (4d12 + 5) Force damage.",
      },
      {
        name: "Paralyzing Touch",
        desc: "Melee Attack Roll: +12, reach 5 ft. Hit: 15 (3d6 + 5) Cold damage, and the target has the Paralyzed condition until the start of the lich's next turn.",
      },
    ],
    savingThrows: "Dex +10, Con +10, Int +12, Wis +9",
    skills: "Arcana +19, History +12, Insight +9, Perception +9",
    damageImmunities: "necrotic; poison",
    damageResistances: "cold; lightning",
    conditionImmunities: "charmed; exhaustion; frightened; paralyzed; poisoned",
    traits: [
      {
        name: "Legendary Resistance (4/Day, or 5/Day in Lair)",
        desc: "If the lich fails a saving throw, it can choose to succeed instead.",
      },
      {
        name: "Spirit Jar",
        desc: "If destroyed, the lich reforms in 1d10 days if it has a spirit jar, reviving with all its Hit Points. The new body appears in an unoccupied space within the lich's lair.",
      },
    ],
    legendaryActions: [
      {
        name: "Deathly Teleport",
        desc: "The lich teleports up to 60 feet to an unoccupied space it can see, and each creature within 10 feet of the space it left takes 11 (2d10) Necrotic damage.",
      },
      {
        name: "Disrupt Life",
        desc: "Con Save: DC 20, each creature that isn't an Undead in a 20-foot Emanation [Area of Effect] originating from the lich. Failure: 31 (9d6) Necrotic damage. Success: Half damage. Success or Failure: The lich can't take this action again until the start of its next turn.",
      },
    ],
  },
  {
    name: "Merrow",
    size: "Large",
    type: "monstrosity",
    alignment: "chaotic evil",
    ac: 13,
    acType: "",
    hp: "45 (6d10 + 12)",
    speed: "10 ft., swim 40 ft.",
    str: 18,
    dex: 15,
    con: 15,
    int: 8,
    wis: 10,
    cha: 9,
    senses: "Darkvision 60 ft., passive Perception 10",
    languages: "Abyssal, Primordial (Aquan)",
    cr: "2",
    actions: [
      {
        name: "Multiattack",
        desc: "The merrow makes two attacks, using Bite, Claw, or Harpoon in any combination.",
      },
      {
        name: "Bite",
        desc: "Melee Attack Roll: +6, reach 5 ft. Hit: 6 (1d4 + 4) Piercing damage, and the target has the Poisoned condition until the end of the merrow's next turn.",
      },
      {
        name: "Claw",
        desc: "Melee Attack Roll: +6, reach 5 ft. Hit: 9 (2d4 + 4) Slashing damage.",
      },
      {
        name: "Harpoon",
        desc: "Melee or Ranged Attack Roll: +6, reach 5 ft. or range 20/60 ft. Hit: 11 (2d6 + 4) Piercing damage. If the target is a Large or smaller creature, the merrow pulls the target up to 15 feet straight toward itself.",
      },
    ],
    traits: [
      {
        name: "Amphibious",
        desc: "The merrow can breathe air and water.",
      },
    ],
  },
  {
    name: "Mimic",
    size: "Medium",
    type: "monstrosity",
    alignment: "neutral",
    ac: 12,
    acType: "",
    hp: "58 (9d8 + 18)",
    speed: "20 ft.",
    str: 17,
    dex: 12,
    con: 15,
    int: 5,
    wis: 13,
    cha: 8,
    senses: "Darkvision 60 ft., passive Perception 11",
    languages: "—",
    cr: "2",
    actions: [
      {
        name: "Bite",
        desc: "Melee Attack Roll: +5 (with Advantage if the target is Grappled by the mimic), reach 5 ft. Hit: 7 (1d8 + 3) Piercing damage—or 12 (2d8 + 3) Piercing damage if the target is Grappled by the mimic—plus 4 (1d8) Acid damage.",
      },
      {
        name: "Pseudopod",
        desc: "Melee Attack Roll: +5, reach 5 ft. Hit: 7 (1d8 + 3) Bludgeoning damage plus 4 (1d8) Acid damage. If the target is a Large or smaller creature, it has the Grappled condition (escape DC 13). Ability checks made to escape this grapple have Disadvantage.",
      },
    ],
    skills: "Stealth +5",
    damageImmunities: "acid",
    conditionImmunities: "prone",
    traits: [
      {
        name: "Adhesive (Object Form Only)",
        desc: "The mimic adheres to anything that touches it. A Huge or smaller creature adhered to the mimic has the Grappled condition (escape DC 13). Ability checks made to escape this grapple have Disadvantage.",
      },
    ],
  },
  {
    name: "Mind Flayer",
    size: "Medium",
    type: "aberration",
    alignment: "lawful evil",
    ac: 15,
    acType: "",
    hp: "99 (18d8 + 18)",
    speed: "30 ft., fly 15 ft. ((hover)), hover",
    str: 11,
    dex: 12,
    con: 12,
    int: 19,
    wis: 17,
    cha: 17,
    senses: "Darkvision 120 ft., passive Perception 16",
    languages: "Deep Speech, Undercommon; telepathy 120 ft.",
    cr: "7",
    actions: [
      {
        name: "Tentacles",
        desc: "Melee Attack Roll: +7, reach 5 ft. Hit: 22 (4d8 + 4) Psychic damage. If the target is a Medium or smaller creature, it has the Grappled condition (escape DC 14) from all the mind flayer's tentacles, and the target has the Stunned condition until the grapple ends.",
      },
      {
        name: "Extract Brain",
        desc: "Con Save: DC 15, one creature that is Grappled by the mind flayer's Tentacles. Failure: 55 (10d10) Piercing damage. Success: Half damage. Success or Failure: If this damage reduces the target to 0 Hit Points, the mind flayer kills it and devours its brain.",
      },
      {
        name: "Mind Blast 5",
        desc: "Int Save: DC 15, each creature in a 60-foot Cone [Area of Effect]. Failure: 31 (6d8 + 4) Psychic damage, and the target has the Stunned condition until the end of the mind flayer's next turn. Success: Half damage only.",
      },
    ],
    savingThrows: "Dex +4, Int +7, Wis +6, Cha +6",
    skills: "Arcana +7, Insight +6, Perception +6, Stealth +4",
    damageResistances: "psychic",
    traits: [
      {
        name: "Magic Resistance",
        desc: "The mind flayer has Advantage on saving throws against spells and other magical effects.",
      },
    ],
  },
  {
    name: "Ogre",
    size: "Large",
    type: "giant",
    alignment: "chaotic evil",
    ac: 11,
    acType: "",
    hp: "68 (8d10 + 24)",
    speed: "40 ft.",
    str: 19,
    dex: 8,
    con: 16,
    int: 5,
    wis: 7,
    cha: 7,
    senses: "Darkvision 60 ft., passive Perception 8",
    languages: "Common, Giant",
    cr: "2",
    actions: [
      {
        name: "Greatclub",
        desc: "Melee Attack Roll: +6, reach 5 ft. Hit: 13 (2d8 + 4) Bludgeoning damage.",
      },
      {
        name: "Javelin",
        desc: "Melee or Ranged Attack Roll: +6, reach 5 ft. or range 30/120 ft. Hit: 11 (2d6 + 4) Piercing damage.",
      },
    ],
  },
  {
    name: "Orc",
    size: "Medium",
    type: "humanoid (orc)",
    alignment: "chaotic evil",
    ac: 13,
    acType: "hide armor",
    hp: "15 (2d8 + 6)",
    speed: "30 ft.",
    str: 16,
    dex: 12,
    con: 16,
    int: 7,
    wis: 11,
    cha: 10,
    senses: "darkvision 60 ft., passive Perception 10",
    languages: "Common, Orc",
    cr: "1/2",
    actions: [
      {
        name: "Greataxe",
        desc: "Melee Weapon Attack Roll: +5 to hit, reach 5 ft., one target. Hit: 9 (1d12 + 3) slashing damage.",
      },
      {
        name: "Javelin",
        desc: "Melee Weapon or Ranged Weapon Attack Roll: +5 to hit, reach 5 ft. or range 30/120 ft., one target. Hit: 6 (1d6 + 3) piercing damage.",
      },
    ],
    skills: "Intimidation +2",
    traits: [
      {
        name: "Aggressive",
        desc: "As a bonus action, the orc can move up to its speed toward a hostile creature that it can see.",
      },
    ],
  },
  {
    name: "Owlbear",
    size: "Large",
    type: "monstrosity",
    alignment: "unaligned",
    ac: 13,
    acType: "",
    hp: "59 (7d10 + 21)",
    speed: "40 ft., climb 40 ft.",
    str: 20,
    dex: 12,
    con: 17,
    int: 3,
    wis: 12,
    cha: 7,
    senses: "Darkvision 60 ft., passive Perception 15",
    languages: "—",
    cr: "3",
    actions: [
      {
        name: "Multiattack",
        desc: "The owlbear makes two Rend attacks.",
      },
      {
        name: "Rend",
        desc: "Melee Attack Roll: +7, reach 5 ft. Hit: 14 (2d8 + 5) Slashing damage.",
      },
    ],
    skills: "Perception +5",
  },
  {
    name: "Rakshasa",
    size: "Medium",
    type: "fiend",
    alignment: "lawful evil",
    ac: 17,
    acType: "",
    hp: "221 (26d8 + 104)",
    speed: "40 ft.",
    str: 14,
    dex: 17,
    con: 18,
    int: 13,
    wis: 16,
    cha: 20,
    senses: "Truesight 60 ft., passive Perception 18",
    languages: "Common, Infernal",
    cr: "13",
    actions: [
      {
        name: "Multiattack",
        desc: "The rakshasa makes three Cursed Touch attacks.",
      },
      {
        name: "Cursed Touch",
        desc: "Melee Attack Roll: +10, reach 5 ft. Hit: 12 (2d6 + 5) Slashing damage plus 19 (3d12) Necrotic damage. If the target is a creature, it is cursed. While cursed, the target gains no benefit from finishing a Short Rest or Long Rest.",
      },
      {
        name: "Baleful Command 5",
        desc: "Wis Save: DC 18, each enemy in a 30-foot Emanation [Area of Effect] originating from the rakshasa. Failure: 28 (8d6) Psychic damage, and the target has the Frightened and Incapacitated conditions until the start of the rakshasa's next turn.",
      },
    ],
    skills: "Deception +10, Insight +8, Perception +8",
    damageVulnerabilities: "piercing damage from weapons wielded by creatures under the effect of a Bless spell",
    conditionImmunities: "charmed; frightened",
    traits: [
      {
        name: "Greater Magic Resistance",
        desc: "The rakshasa automatically succeeds on saving throws against spells and other magical effects, and the attack rolls of spells automatically miss it. Without the rakshasa's permission, no spell can observe the rakshasa remotely or detect its thoughts, creature type, or alignment.",
      },
      {
        name: "Fiendish Restoration",
        desc: "If the rakshasa dies outside the Nine Hells, its body turns to ichor, and it gains a new body instantly, reviving with all its Hit Points somewhere in the Nine Hells.",
      },
    ],
  },
  {
    name: "Roc",
    size: "Gargantuan",
    type: "monstrosity",
    alignment: "unaligned",
    ac: 15,
    acType: "",
    hp: "248 (16d20 + 80)",
    speed: "20 ft., fly 120 ft.",
    str: 28,
    dex: 10,
    con: 20,
    int: 3,
    wis: 10,
    cha: 9,
    senses: "passive Perception 18",
    languages: "—",
    cr: "11",
    actions: [
      {
        name: "Multiattack",
        desc: "The roc makes two Beak attacks. It can replace one attack with a Talons attack.",
      },
      {
        name: "Beak",
        desc: "Melee Attack Roll: +13, reach 10 ft. Hit: 28 (3d12 + 9) Piercing damage.",
      },
      {
        name: "Talons",
        desc: "Melee Attack Roll: +13, reach 5 ft. Hit: 23 (4d6 + 9) Slashing damage. If the target is a Huge or smaller creature, it has the Grappled condition (escape DC 19) from both talons, and it has the Restrained condition until the grapple ends.",
      },
    ],
    savingThrows: "Dex +4, Wis +4",
    skills: "Perception +8",
  },
  {
    name: "Skeleton",
    size: "Medium",
    type: "undead",
    alignment: "lawful evil",
    ac: 14,
    acType: "",
    hp: "13 (2d8 + 4)",
    speed: "30 ft.",
    str: 10,
    dex: 16,
    con: 15,
    int: 6,
    wis: 8,
    cha: 5,
    senses: "Darkvision 60 ft., passive Perception 9",
    languages: "understands Common plus one other language but can't speak",
    cr: "1/4",
    actions: [
      {
        name: "Shortsword",
        desc: "Melee Attack Roll: +5, reach 5 ft. Hit: 6 (1d6 + 3) Piercing damage.",
      },
      {
        name: "Shortbow",
        desc: "Ranged Attack Roll: +5, range 80/320 ft. Hit: 6 (1d6 + 3) Piercing damage.",
      },
    ],
    damageImmunities: "poison",
    damageVulnerabilities: "bludgeoning",
    conditionImmunities: "exhaustion; poisoned",
  },
  {
    name: "Specter",
    size: "Medium",
    type: "undead",
    alignment: "chaotic evil",
    ac: 12,
    acType: "",
    hp: "22 (5d8)",
    speed: "30 ft., fly 50 ft. ((hover)), hover",
    str: 1,
    dex: 14,
    con: 11,
    int: 10,
    wis: 10,
    cha: 11,
    senses: "Darkvision 60 ft., passive Perception 10",
    languages: "understands Common plus one other language but can't speak",
    cr: "1",
    actions: [
      {
        name: "Life Drain",
        desc: "Melee Attack Roll: +4, reach 5 ft. Hit: 7 (2d6) Necrotic damage. If the target is a creature, its Hit Points maximum decreases by an amount equal to the damage taken.",
      },
    ],
    damageImmunities: "necrotic; poison",
    damageResistances: "acid; bludgeoning; cold; fire; lightning; piercing; slashing; thunder",
    conditionImmunities: "charmed; exhaustion; grappled; paralyzed; petrified; poisoned; prone; restrained; unconscious",
    traits: [
      {
        name: "Incorporeal Movement",
        desc: "The specter can move through other creatures and objects as if they were Difficult Terrain. It takes 5 (1d10) Force damage if it ends its turn inside an object.",
      },
      {
        name: "Sunlight Sensitivity",
        desc: "While in sunlight, the specter has Disadvantage on ability checks and attack rolls.",
      },
    ],
  },
  {
    name: "Tarrasque",
    size: "Gargantuan",
    type: "monstrosity (titan)",
    alignment: "unaligned",
    ac: 25,
    acType: "",
    hp: "697 (34d20 + 340)",
    speed: "60 ft., burrow 40 ft., climb 60 ft.",
    str: 30,
    dex: 11,
    con: 30,
    int: 3,
    wis: 11,
    cha: 11,
    senses: "Blindsight 120 ft., passive Perception 19",
    languages: "—",
    cr: "30",
    actions: [
      {
        name: "Multiattack",
        desc: "The tarrasque makes one Bite attack and three other attacks, using Claw or Tail in any combination.",
      },
      {
        name: "Bite",
        desc: "Melee Attack Roll: +19, reach 15 ft. Hit: 36 (4d12 + 10) Piercing damage, and the target has the Grappled condition (escape DC 20). Until the grapple ends, the target has the Restrained condition and can't teleport.",
      },
      {
        name: "Claw",
        desc: "Melee Attack Roll: +19, reach 15 ft. Hit: 28 (4d8 + 10) Slashing damage.",
      },
      {
        name: "Tail",
        desc: "Melee Attack Roll: +19, reach 30 ft. Hit: 23 (3d8 + 10) Bludgeoning damage. If the target is a Huge or smaller creature, it has the Prone condition.",
      },
      {
        name: "Thunderous Bellow 5",
        desc: "Con Save: DC 27, each creature and each object that isn't being worn or carried in a 150-foot Cone [Area of Effect]. Failure: 78 (12d12) Thunder damage, and the target has the Deafened and Frightened conditions until the end of its next turn. Success: Half damage only.",
      },
    ],
    savingThrows: "Dex +9, Int +5, Wis +9, Cha +9",
    skills: "Perception +9",
    damageImmunities: "fire; poison",
    damageResistances: "bludgeoning; piercing; slashing",
    conditionImmunities: "charmed; deafened; frightened; paralyzed; poisoned",
    traits: [
      {
        name: "Legendary Resistance (6/Day)",
        desc: "If the tarrasque fails a saving throw, it can choose to succeed instead.",
      },
      {
        name: "Magic Resistance",
        desc: "The tarrasque has Advantage on saving throws against spells and other magical effects.",
      },
      {
        name: "Reflective Carapace",
        desc: "If the tarrasque is targeted by a Magic Missile spell or a spell that requires a ranged attack roll, roll 1d6. On a 1-5, the tarrasque is unaffected. On a 6, the tarrasque is unaffected and reflects the spell, turning the caster into the target.",
      },
      {
        name: "Siege Monster",
        desc: "The tarrasque deals double damage to objects and structures.",
      },
    ],
    legendaryActions: [
      {
        name: "Onslaught",
        desc: "The tarrasque moves up to half its Speed, and it makes one Claw or Tail attack.",
      },
      {
        name: "World-Shaking Movement",
        desc: "The tarrasque moves up to its Speed. At the end of this movement, the tarrasque creates an instantaneous shock wave in a 60-foot Emanation [Area of Effect] originating from itself. Creatures in that area lose Concentration and, if Medium or smaller, have the Prone condition. The tarrasque can't take this action again until the start of its next turn.",
      },
    ],
  },
  {
    name: "Troll",
    size: "Large",
    type: "giant",
    alignment: "chaotic evil",
    ac: 15,
    acType: "",
    hp: "94 (9d10 + 45)",
    speed: "30 ft.",
    str: 18,
    dex: 13,
    con: 20,
    int: 7,
    wis: 9,
    cha: 7,
    senses: "Darkvision 60 ft., passive Perception 15",
    languages: "Giant",
    cr: "5",
    actions: [
      {
        name: "Multiattack",
        desc: "The troll makes three Rend attacks.",
      },
      {
        name: "Rend",
        desc: "Melee Attack Roll: +7, reach 10 ft. Hit: 11 (2d6 + 4) Slashing damage.",
      },
    ],
    skills: "Perception +5",
    traits: [
      {
        name: "Loathsome Limbs (4/Day)",
        desc: "If the troll ends any turn Bloodied and took 15+ Slashing damage during that turn, one of the troll's limbs is severed, falls into the troll's space, and becomes a Troll Limb. The limb acts immediately after the troll's turn. The troll has 1 Exhaustion level for each missing limb, and it grows replacement limbs the next time it regains Hit Points.",
      },
      {
        name: "Regeneration",
        desc: "The troll regains 15 Hit Points at the start of each of its turns. If the troll takes Acid or Fire damage, this trait doesn't function on the troll's next turn. The troll dies only if it starts its turn with 0 Hit Points and doesn't regenerate.",
      },
    ],
  },
  {
    name: "Vampire",
    size: "Small",
    type: "undead",
    alignment: "lawful evil",
    ac: 16,
    acType: "",
    hp: "195 (23d8 + 92)",
    speed: "40 ft., climb 40 ft.",
    str: 18,
    dex: 18,
    con: 18,
    int: 17,
    wis: 15,
    cha: 18,
    senses: "Darkvision 120 ft., passive Perception 17",
    languages: "Common plus two other languages",
    cr: "13",
    actions: [
      {
        name: "Multiattack (Vampire Form Only)",
        desc: "The vampire makes two Grave Strike attacks and uses Bite.",
      },
      {
        name: "Grave Strike (Vampire Form Only)",
        desc: "Melee Attack Roll: +9, reach 5 ft. Hit: 8 (1d8 + 4) Bludgeoning damage plus 7 (2d6) Necrotic damage. If the target is a Large or smaller creature, it has the Grappled condition (escape DC 14) from one of two hands.",
      },
      {
        name: "Bite (Bat or Vampire Form Only)",
        desc: "Con Save: DC 17, one creature within 5 feet that is willing or that has the Grappled, Incapacitated, or Restrained condition. Failure: 6 (1d4 + 4) Piercing damage plus 13 (3d8) Necrotic damage. The target's Hit Points maximum decreases by an amount equal to the Necrotic damage taken, and the vampire regains Hit Points equal to that amount. A Humanoid reduced to 0 Hit Points by this damage and then buried rises the following sunset as a Vampire Spawn under the vampire's control.",
      },
    ],
    savingThrows: "Dex +9, Con +9, Wis +7, Cha +9",
    skills: "Perception +7, Stealth +9",
    damageResistances: "necrotic",
    traits: [
      {
        name: "Legendary Resistance (3/Day, or 4/Day in Lair)",
        desc: "If the vampire fails a saving throw, it can choose to succeed instead.",
      },
      {
        name: "Misty Escape",
        desc: "If the vampire drops to 0 Hit Points outside its resting place, the vampire uses Shape-Shift to become mist (no action required). If it can't use Shape-Shift, it is destroyed.\nWhile it has 0 Hit Points in mist form, it can't return to its vampire form, and it must reach its resting place within 2 hours or be destroyed. Once in its resting place, it returns to its vampire form and has the Paralyzed condition until it regains any Hit Points, and it regains 1 Hit Points after spending 1 hour there.",
      },
      {
        name: "Spider Climb",
        desc: "The vampire can climb difficult surfaces, including along ceilings, without needing to make an ability check.",
      },
      {
        name: "Vampire Weakness",
        desc: "The vampire has these weaknesses:\n• Forbiddance:\nThe vampire can't enter a residence without an invitation from an occupant.\n• Running Water:\nThe vampire takes 20 Acid damage if it ends its turn in running water.\n• Stake to the Heart:\nIf a weapon that deals Piercing damage is driven into the vampire's heart while the vampire has the Incapacitated condition in its resting place, the vampire has the Paralyzed condition until the weapon is removed.\n• Sunlight:\nThe vampire takes 20 Radiant damage if it starts its turn in sunlight. While in sunlight, it has Disadvantage on attack rolls and ability checks.",
      },
    ],
    legendaryActions: [
      {
        name: "Deathless Strike",
        desc: "The vampire moves up to half its Speed, and it makes one Grave Strike attack.",
      },
    ],
  },
  {
    name: "Werewolf",
    size: "Small",
    type: "monstrosity (lycanthrope)",
    alignment: "chaotic evil",
    ac: 15,
    acType: "",
    hp: "71 (11d8 + 22)",
    speed: "30 ft.",
    str: 16,
    dex: 14,
    con: 14,
    int: 10,
    wis: 11,
    cha: 10,
    senses: "Darkvision 60 ft., passive Perception 14",
    languages: "Common (can't speak in wolf form)",
    cr: "3",
    actions: [
      {
        name: "Multiattack",
        desc: "The werewolf makes two attacks, using Scratch or Longbow in any combination. It can replace one attack with a Bite attack.",
      },
      {
        name: "Bite (Wolf or Hybrid Form Only)",
        desc: "Melee Attack Roll: +5, reach 5 ft. Hit: 12 (2d8 + 3) Piercing damage. If the target is a Humanoid, it is subjected to the following effect. Con Save: DC 12. Failure: The target is cursed. If the cursed target drops to 0 Hit Points, it instead becomes a Werewolf under the DM's control and has 10 Hit Points. Success: The target is immune to this werewolf's curse for 24 hours.",
      },
      {
        name: "Scratch",
        desc: "Melee Attack Roll: +5, reach 5 ft. Hit: 10 (2d6 + 3) Slashing damage.",
      },
      {
        name: "Longbow (Humanoid or Hybrid Form Only)",
        desc: "Ranged Attack Roll: +4, range 150/600 ft. Hit: 11 (2d8 + 2) Piercing damage.",
      },
    ],
    skills: "Perception +4, Stealth +4",
    traits: [
      {
        name: "Pack Tactics",
        desc: "The werewolf has Advantage on an attack roll against a creature if at least one of the werewolf's allies is within 5 feet of the creature and the ally doesn't have the Incapacitated condition.",
      },
    ],
  },
  {
    name: "Wight",
    size: "Medium",
    type: "undead",
    alignment: "neutral evil",
    ac: 14,
    acType: "",
    hp: "82 (11d8 + 33)",
    speed: "30 ft.",
    str: 15,
    dex: 14,
    con: 16,
    int: 10,
    wis: 13,
    cha: 15,
    senses: "Darkvision 60 ft., passive Perception 13",
    languages: "Common plus one other language",
    cr: "3",
    actions: [
      {
        name: "Multiattack",
        desc: "The wight makes two attacks, using Necrotic Sword or Necrotic Bow in any combination. It can replace one attack with a use of Life Drain.",
      },
      {
        name: "Necrotic Sword",
        desc: "Melee Attack Roll: +4, reach 5 ft. Hit: 6 (1d8 + 2) Slashing damage plus 4 (1d8) Necrotic damage.",
      },
      {
        name: "Necrotic Bow",
        desc: "Ranged Attack Roll: +4, range 150/600 ft. Hit: 6 (1d8 + 2) Piercing damage plus 4 (1d8) Necrotic damage.",
      },
      {
        name: "Life Drain",
        desc: "Con Save: DC 13, one creature within 5 feet. Failure: 6 (1d8 + 2) Necrotic damage, and the target's Hit Points maximum decreases by an amount equal to the damage taken.\nA Humanoid slain by this attack rises 24 hours later as a Zombie under the wight's control, unless the Humanoid is restored to life or its body is destroyed. The wight can have no more than twelve zombies under its control at a time.",
      },
    ],
    skills: "Perception +3, Stealth +4",
    damageImmunities: "poison",
    damageResistances: "necrotic",
    conditionImmunities: "exhaustion; poisoned",
    traits: [
      {
        name: "Sunlight Sensitivity",
        desc: "While in sunlight, the wight has Disadvantage on ability checks and attack rolls.",
      },
    ],
  },
  {
    name: "Wraith",
    size: "Small",
    type: "undead",
    alignment: "neutral evil",
    ac: 13,
    acType: "",
    hp: "67 (9d8 + 27)",
    speed: "5 ft., fly 60 ft. ((hover)), hover",
    str: 6,
    dex: 16,
    con: 16,
    int: 12,
    wis: 14,
    cha: 15,
    senses: "Darkvision 60 ft., passive Perception 12",
    languages: "Common plus two other languages",
    cr: "5",
    actions: [
      {
        name: "Life Drain",
        desc: "Melee Attack Roll: +6, reach 5 ft. Hit: 21 (4d8 + 3) Necrotic damage. If the target is a creature, its Hit Points maximum decreases by an amount equal to the damage taken.",
      },
      {
        name: "Create Specter",
        desc: "The wraith targets a Humanoid corpse within 10 feet of itself that has been dead for no longer than 1 minute. The target's spirit rises as a Specter in the space of its corpse or in the nearest unoccupied space. The specter is under the wraith's control. The wraith can have no more than seven specters under its control at a time.",
      },
    ],
    damageImmunities: "necrotic; poison",
    damageResistances: "acid; bludgeoning; cold; fire; piercing; slashing",
    conditionImmunities: "charmed; exhaustion; grappled; paralyzed; petrified; poisoned; prone; restrained; unconscious",
    traits: [
      {
        name: "Incorporeal Movement",
        desc: "The wraith can move through other creatures and objects as if they were Difficult Terrain. It takes 5 (1d10) Force damage if it ends its turn inside an object.",
      },
      {
        name: "Sunlight Sensitivity",
        desc: "While in sunlight, the wraith has Disadvantage on ability checks and attack rolls.",
      },
    ],
  },
  {
    name: "Young Red Dragon",
    size: "Large",
    type: "dragon (chromatic)",
    alignment: "chaotic evil",
    ac: 18,
    acType: "",
    hp: "178 (17d10 + 85)",
    speed: "40 ft., climb 40 ft., fly 80 ft.",
    str: 23,
    dex: 10,
    con: 21,
    int: 14,
    wis: 11,
    cha: 19,
    senses: "Blindsight 30 ft., Darkvision 120 ft., passive Perception 18",
    languages: "Common, Draconic",
    cr: "10",
    actions: [
      {
        name: "Multiattack",
        desc: "The dragon makes three Rend attacks.",
      },
      {
        name: "Rend",
        desc: "Melee Attack Roll: +10, reach 10 ft. Hit: 13 (2d6 + 6) Slashing damage plus 3 (1d6) Fire damage.",
      },
      {
        name: "Fire Breath 5",
        desc: "Dex Save: DC 17, each creature in a 30-foot Cone [Area of Effect]. Failure: 56 (16d6) Fire damage. Success: Half damage.",
      },
    ],
    savingThrows: "Dex +4, Wis +4",
    skills: "Perception +8, Stealth +4",
    damageImmunities: "fire",
  },
  {
    name: "Zombie",
    size: "Medium",
    type: "undead",
    alignment: "neutral evil",
    ac: 8,
    acType: "",
    hp: "15 (2d8 + 6)",
    speed: "20 ft.",
    str: 13,
    dex: 6,
    con: 16,
    int: 3,
    wis: 6,
    cha: 5,
    senses: "Darkvision 60 ft., passive Perception 8",
    languages: "understands Common plus one other language but can't speak",
    cr: "1/4",
    actions: [
      {
        name: "Slam",
        desc: "Melee Attack Roll: +3, reach 5 ft. Hit: 5 (1d8 + 1) Bludgeoning damage.",
      },
    ],
    savingThrows: "Wis +0",
    damageImmunities: "poison",
    conditionImmunities: "exhaustion; poisoned",
    traits: [
      {
        name: "Undead Fortitude",
        desc: "If damage reduces the zombie to 0 Hit Points, it makes a Constitution saving throw (DC 5 plus the damage taken) unless the damage is Radiant or from a Critical Hit. On a successful save, the zombie drops to 1 Hit Points instead.",
      },
    ],
  },
];
