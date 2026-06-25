// Hand-curated reference lists for the Party widget's Race + Class
// autocompletes. These are NOT generated from 5etools — they're short
// enough to maintain by hand, and both fields accept free-text so a DM can
// always type something off-list (homebrew, custom variants).
//
// Source intent:
//   PLAYER_CLASSES — the 12 classes in the 2024 Player's Handbook (XPHB)
//                    plus Artificer (Tasha's Cauldron of Everything) plus
//                    Blood Hunter (Matt Mercer / Critical Role, published
//                    through DnDBeyond — the only non-WotC class with
//                    enough mainstream uptake to be worth listing).
//   PLAYER_RACES   — the 10 species in the 2024 PHB plus the most-played
//                    additions from 2014 PHB, Volo's / Mordenkainen's
//                    Monsters of the Multiverse, Eberron, Strixhaven, and
//                    the monstrous-PC compendium. Alphabetised for stable
//                    suggestion order.

export const PLAYER_CLASSES = [
  // 2024 PHB
  "Barbarian",
  "Bard",
  "Cleric",
  "Druid",
  "Fighter",
  "Monk",
  "Paladin",
  "Ranger",
  "Rogue",
  "Sorcerer",
  "Warlock",
  "Wizard",
  // Tasha's Cauldron of Everything
  "Artificer",
  // Critical Role / DnDBeyond
  "Blood Hunter",
] as const;

export const PLAYER_RACES = [
  // 2024 XPHB core species
  "Aasimar",
  "Dragonborn",
  "Dwarf",
  "Elf",
  "Gnome",
  "Goliath",
  "Halfling",
  "Human",
  "Orc",
  "Tiefling",
  // 2014 PHB extras still in heavy rotation
  "Half-Elf",
  "Half-Orc",
  // Volo's / Mordenkainen's Monsters of the Multiverse
  "Aarakocra",
  "Firbolg",
  "Genasi",
  "Kenku",
  "Tabaxi",
  "Tortle",
  "Triton",
  "Yuan-ti",
  // Monstrous PCs (MotM / Volo's)
  "Bugbear",
  "Goblin",
  "Hobgoblin",
  "Kobold",
  "Lizardfolk",
  // Eberron: Rising from the Last War
  "Changeling",
  "Shifter",
  "Warforged",
  // Strixhaven / Wild Beyond the Witchlight / Spelljammer
  "Centaur",
  "Fairy",
  "Harengon",
  "Minotaur",
  "Owlin",
  "Satyr",
] as const;
