export interface CompendiumEntry {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
}

export const compendiumData: CompendiumEntry[] = [
  {
    id: "exhaustion-2024",
    title: "Exhaustion (2024)",
    category: "Conditions",
    content:
      "Each Exhaustion level imposes a -1 penalty to d20 Tests (attack rolls, ability checks, saving throws) and to spell save DC. At 6 levels you die. Each Long Rest removes 1 level. Unlike 2014, you don't suffer specific drawbacks per level — it's purely cumulative penalties.",
    tags: ["condition", "exhaustion", "2024", "revised"],
  },
  {
    id: "weapon-mastery-cleave",
    title: "Weapon Mastery: Cleave",
    category: "Weapon Masteries",
    content:
      "If you hit a creature with a melee attack using this weapon, you can make a free melee attack against a second creature within 5 feet of the first using the same weapon. No ability modifier is added to the damage of this bonus attack.",
    tags: ["weapon mastery", "cleave", "fighter", "melee"],
  },
  {
    id: "weapon-mastery-nick",
    title: "Weapon Mastery: Nick",
    category: "Weapon Masteries",
    content:
      "When you make the extra attack of the Light property, you can make it as part of the Attack action instead of as a Bonus Action. You can still make this extra attack only once per turn.",
    tags: ["weapon mastery", "nick", "light", "dual wield"],
  },
  {
    id: "weapon-mastery-push",
    title: "Weapon Mastery: Push",
    category: "Weapon Masteries",
    content:
      "If you hit a creature with this weapon, you can push the creature up to 10 feet straight away from yourself if it is Large or smaller.",
    tags: ["weapon mastery", "push", "forced movement"],
  },
  {
    id: "weapon-mastery-sap",
    title: "Weapon Mastery: Sap",
    category: "Weapon Masteries",
    content:
      "If you hit a creature with this weapon, that creature has Disadvantage on its next attack roll before the start of your next turn.",
    tags: ["weapon mastery", "sap", "disadvantage"],
  },
  {
    id: "weapon-mastery-slow",
    title: "Weapon Mastery: Slow",
    category: "Weapon Masteries",
    content:
      "If you hit a creature with this weapon, the creature's Speed is reduced by 10 until the start of your next turn.",
    tags: ["weapon mastery", "slow", "speed reduction"],
  },
  {
    id: "weapon-mastery-topple",
    title: "Weapon Mastery: Topple",
    category: "Weapon Masteries",
    content:
      "If you hit a creature with this weapon, you can force the creature to make a Constitution saving throw (DC 8 + your proficiency bonus + ability modifier). On a failed save, the creature has the Prone condition.",
    tags: ["weapon mastery", "topple", "prone", "saving throw"],
  },
  {
    id: "weapon-mastery-vex",
    title: "Weapon Mastery: Vex",
    category: "Weapon Masteries",
    content:
      "If you hit a creature with this weapon and deal damage, you have Advantage on your next attack roll against that creature before the end of your next turn.",
    tags: ["weapon mastery", "vex", "advantage"],
  },
  {
    id: "weapon-mastery-graze",
    title: "Weapon Mastery: Graze",
    category: "Weapon Masteries",
    content:
      "If your attack roll misses a creature, you can deal damage to it equal to the ability modifier you used for the attack roll. This damage is the same type as the weapon's damage.",
    tags: ["weapon mastery", "graze", "miss", "damage"],
  },
  {
    id: "bastion-2024",
    title: "Bastions (2024)",
    category: "Downtime",
    content:
      "At level 5, characters can establish a Bastion — a personal stronghold. Between adventures, characters take Bastion Turns. Each Bastion has Facilities (basic or special) that provide benefits, crafting options, or followers. Bastions can be attacked.",
    tags: ["bastion", "stronghold", "downtime", "2024"],
  },
  {
    id: "crafting-2024",
    title: "Crafting (2024)",
    category: "Downtime",
    content:
      "You can craft equipment during downtime. Work with your DM to determine the gold cost and time required. Typically you can craft items worth your proficiency bonus × 5 gp per day of downtime. Magic item crafting requires the appropriate spell slots and materials.",
    tags: ["crafting", "downtime", "2024"],
  },
  {
    id: "concentration-2024",
    title: "Concentration Changes (2024)",
    category: "Spellcasting",
    content:
      "In 2024, when you take damage while concentrating, the DC equals 10 or half the damage taken (whichever is higher). You use a Constitution saving throw. The Concentration spell tag is now clearly labeled. Some spells that previously required concentration no longer do.",
    tags: ["concentration", "spellcasting", "2024", "revised"],
  },
  {
    id: "true-strike-2024",
    title: "True Strike (2024)",
    category: "Spells",
    content:
      "Cantrip, Divination. Casting Time: 1 Action. Range: Self. You guide your strike with a touch of prescience. Make a melee or ranged spell attack against one creature. On a hit, the target takes 6d6 radiant damage. You use your spellcasting ability for this attack. At higher levels: +3d6 per cantrip die upgrade.",
    tags: ["spell", "cantrip", "true strike", "2024", "revised", "radiant"],
  },
  {
    id: "sacred-flame-2024",
    title: "Sacred Flame (2024)",
    category: "Spells",
    content:
      "Cantrip, Evocation. Casting Time: 1 Action. Range: 60 feet. Flame-like radiance descends on a creature. The target must succeed on a Dexterity saving throw or take 1d8 radiant damage. Cover provides no benefit. Damage increases at higher levels.",
    tags: ["spell", "cantrip", "sacred flame", "radiant", "cleric"],
  },
  {
    id: "bonus-action-rules",
    title: "Bonus Actions",
    category: "Combat",
    content:
      "You can take only one Bonus Action per turn. If you have multiple sources of Bonus Actions, you choose which one to use. A Bonus Action can only be taken on your turn. Reactions and free object interactions are separate from Bonus Actions.",
    tags: ["combat", "bonus action", "action economy"],
  },
  {
    id: "ready-action",
    title: "Ready Action",
    category: "Combat",
    content:
      "When you Ready an action, you hold your action until a trigger occurs. Specify the trigger (a perceivable event) and the action. If the trigger occurs before your next turn, you can use your reaction to take the action. If you Ready a spell, you expend the slot now. The spell is released when the trigger occurs, or the slot is lost.",
    tags: ["combat", "ready", "reaction", "action"],
  },
  {
    id: "flanking-optional",
    title: "Flanking (Optional Rule)",
    category: "Combat",
    content:
      "An optional rule: When a creature and at least one ally are on opposite sides of a hostile creature, they have Advantage on melee attack rolls against that creature. The DM decides whether to use this rule.",
    tags: ["flanking", "optional rule", "advantage", "combat"],
  },
  {
    id: "grappling-2024",
    title: "Grappling (2024)",
    category: "Combat",
    content:
      "To grapple: Attack action, replace one attack with a Strength (Athletics) check contested by the target's Strength (Athletics) or Dexterity (Acrobatics). Success: target gains the Grappled condition. Grappled creatures have Speed 0 and can't benefit from bonuses to speed. The grappler can move the target (at half speed) or drag them.",
    tags: ["grappling", "combat", "condition", "2024"],
  },
  {
    id: "death-saves",
    title: "Death Saving Throws",
    category: "Combat",
    content:
      "At 0 HP you're Unconscious. On each of your turns, roll a d20 (no modifiers). 10+: success. 9-: failure. 3 successes: stable (but still at 0 HP). 3 failures: dead. A natural 1 counts as 2 failures. A natural 20 regains 1 HP. Any damage while at 0 HP counts as 1 failure (or 2 if a critical hit).",
    tags: ["death saves", "dying", "0 hp", "combat"],
  },
  {
    id: "inspiration-2024",
    title: "Heroic Inspiration (2024)",
    category: "Core Rules",
    content:
      "In 2024, it is now called Heroic Inspiration. You can have only one at a time. When you have it, you can expend it to give yourself Advantage on one d20 Test. The DM can award it at any time. Some class features also grant it.",
    tags: ["inspiration", "heroic inspiration", "advantage", "2024"],
  },
  {
    id: "short-rest-2024",
    title: "Short Rest",
    category: "Core Rules",
    content:
      "A Short Rest is a period of downtime lasting at least 1 hour, during which a character does nothing more strenuous than eating, drinking, reading, and tending to wounds. Characters can spend Hit Dice during a Short Rest to recover HP. Roll the die + CON modifier per die spent.",
    tags: ["rest", "short rest", "hit dice", "recovery"],
  },
  {
    id: "long-rest-2024",
    title: "Long Rest",
    category: "Core Rules",
    content:
      "A Long Rest is at least 8 hours (6 sleep, 2 light activity). At completion: regain all HP, regain half max Hit Dice (min 1), remove 1 Exhaustion level. Can't benefit from more than one Long Rest per 24 hours. Must have at least 1 HP to begin.",
    tags: ["rest", "long rest", "recovery", "exhaustion"],
  },
  {
    id: "spell-slots-2024",
    title: "Spell Slot Recovery",
    category: "Spellcasting",
    content:
      "Most full casters recover all spell slots on a Long Rest. Warlocks recover their Pact Magic slots on a Short Rest. The Arcane Recovery feature (Wizard) lets you recover some slots once per Long Rest during a Short Rest.",
    tags: ["spell slots", "recovery", "warlock", "wizard", "arcane recovery"],
  },
  {
    id: "dc-calculation",
    title: "Spell Save DC",
    category: "Spellcasting",
    content:
      "Spell Save DC = 8 + Proficiency Bonus + Spellcasting Ability Modifier. This is the DC targets must beat when making saving throws against your spells.",
    tags: ["spell save dc", "spellcasting", "calculation"],
  },
  {
    id: "critical-hit-2024",
    title: "Critical Hit (2024)",
    category: "Combat",
    content:
      "A natural 20 on an attack roll is a Critical Hit. Roll all damage dice twice (don't double modifiers). In 2024, the Brutal Critical barbarian feature and similar effects add extra dice on a crit rather than doubling dice again — clarifying previous ambiguity.",
    tags: ["critical hit", "natural 20", "damage", "2024"],
  },
  {
    id: "cover-rules",
    title: "Cover",
    category: "Combat",
    content:
      "Half Cover: +2 to AC and Dexterity saving throws. Three-Quarters Cover: +5 to AC and Dexterity saving throws. Total Cover: Can't be targeted directly by attacks or spells (but can be caught in AoE). An object/creature must be at least half in between you and the attacker.",
    tags: ["cover", "half cover", "three-quarters cover", "total cover", "combat"],
  },
];

export const categories = [...new Set(compendiumData.map((e) => e.category))];
