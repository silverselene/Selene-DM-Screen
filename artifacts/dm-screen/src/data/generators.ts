export const namesByRace: Record<string, string[]> = {
  Human: [
    "Aldric Vane", "Mira Thorne", "Cassius Drell", "Lysa Farrow", "Dorian Ashwell",
    "Petra Moren", "Gareth Oldfield", "Sela Dunmore", "Tristan Holt", "Arya Flint",
    "Brennan Cole", "Vesna Carr", "Orin Marsh", "Delia Stone", "Marcus Veyne",
  ],
  Elf: [
    "Aelindra Moonshadow", "Thalion Silverleaf", "Sylvara Dawnwhisper", "Elarion Starfall",
    "Miriael Sunsong", "Faelorn Nightbloom", "Serawyn Duskpetal", "Caladril Stormveil",
    "Ithilwen Gladeborn", "Aerindel Cloudweave", "Valandor Brightwood", "Naeris Willowmere",
  ],
  Dwarf: [
    "Brundar Ironvein", "Helga Stonecleft", "Dolgrin Copperhelm", "Marta Deepforge",
    "Torbal Fistemail", "Ingrid Rockmantle", "Gorbin Ashrock", "Thyra Boulderkin",
    "Ragnar Ironbrew", "Sigrid Cragstout", "Durgin Hammerfall", "Berta Granitesong",
  ],
  Halfling: [
    "Merric Thistledown", "Rosie Underbough", "Pip Goodbarrel", "Daisy Greenfield",
    "Cob Bramblewick", "Lily Burrows", "Tam Hayfoot", "Maisie Copperkettle",
    "Rook Shadowstep", "Fennel Brightfield", "Hollis Muddlefoot", "Bree Cornstalk",
  ],
  Tiefling: [
    "Zara Ashcroft", "Malachar Vex", "Seraphina Dusk", "Kaelen Sorrow",
    "Nyxara Voidtouched", "Damien Hellsfire", "Isolde Ashblood", "Riven Shadowborn",
    "Lilith Embersoul", "Azrael Duskmantle", "Tempest Crimsonveil", "Vex Nightfall",
  ],
  Dragonborn: [
    "Kriv Firemane", "Balasar Stonescale", "Donaar Ashwing", "Ghesh Ironclaw",
    "Heskan Emberfang", "Mishann Goldenscale", "Nadarr Thunderscale", "Perra Silverhide",
    "Rhogar Stormbreath", "Shedinn Frostclaw", "Torinn Jadescale", "Vrinn Darkwing",
  ],
  Gnome: [
    "Fibblesticks Cogsworth", "Zibble Twinkletoes", "Nyx Brasswidget", "Glim Wonderhat",
    "Bimble Sparkwhistle", "Tink Geargrind", "Orzo Bobbletop", "Fizzban Coppercog",
    "Mim Sprocketwheel", "Wick Tinkerbell", "Cog Nimblefingers", "Pip Gadgeteer",
  ],
  "Half-Orc": [
    "Grugnar Wolfhide", "Kira Ironjaw", "Thrax Bonecrusher", "Sora Ashfang",
    "Garruk Splitlip", "Mira Darkbrow", "Brak Smasher", "Lena Ravenfist",
    "Tordag Grimjaw", "Nala Steelskull", "Urgog Cleaver", "Rima Warborn",
  ],
};

export const lootByCR: Record<string, string[]> = {
  "CR 0-4": [
    "12 cp and a tarnished copper ring",
    "2d6 sp scattered in a leather pouch",
    "1d4 gp and a small polished stone",
    "5 sp, a candle stub, and a key of unknown origin",
    "1 gp, 8 sp, a crumpled note with a name on it",
    "A pouch containing 3d6 cp and a crude map",
    "Two ivory dice (worth 5 sp total)",
    "4 sp, a broken arrow, and a dagger hilt",
    "1d10 cp, a ball of twine, and a flint",
    "A small bone carving and 7 sp",
  ],
  "CR 5-10": [
    "2d10 gp, a gemstone (tiger eye, 10 gp), and a potion of healing",
    "35 gp, a silver medallion (25 gp), and a spell scroll (1st level)",
    "50 gp, an ornate dagger +1 (minor enchantment), and 3 gemstones",
    "4d10 gp and a Bag of Holding",
    "28 gp, a brass sextant (15 gp), and a Potion of Climbing",
    "60 gp, emerald gem (50 gp), and a Sending Stone (1 charge)",
    "A spell scroll (2nd level), 40 gp, and silk cloth worth 20 gp",
    "Rolled platinum (10 pp), a golden necklace (30 gp), and 1 vial of antitoxin",
    "45 gp, bloodstone gem (50 gp), and +1 Ammunition (10 pieces)",
    "Pouch: 3d6 gp, a potion of greater healing, and a magic quill",
  ],
  "CR 11-16": [
    "300 gp, a diamond (500 gp), and a Wand of Magic Missiles",
    "4d6 × 100 gp, a mithral breastplate, and a Cloak of Elvenkind",
    "500 gp, two spell scrolls (4th & 5th level), and a Staff of Withering",
    "1,000 gp, a Bag of Devouring (trapped), and a Ring of Evasion",
    "750 gp, three 250 gp gems, and Boots of Speed",
    "Chest: 2,000 gp, a Portable Hole, and a Flame Tongue longsword",
    "900 gp, six spell scrolls, and an Ioun Stone (Sustenance)",
    "1,200 gp, a Belt of Dwarvenkind, and a necklace of fireballs",
    "600 gp, a Helm of Teleportation (3 charges), and silk robes (200 gp)",
    "1,500 gp, a Manual of Bodily Health, and a Periapt of Wound Closure",
  ],
  "CR 17+": [
    "10,000 gp, a Vorpal Sword, and a tome of clear thought",
    "5,000 gp, an Apparatus of Kwalish, and three legendary gems (1,000 gp each)",
    "20 pp (2,000 gp), a Robe of the Archmagi, and a Sphere of Annihilation",
    "A Deck of Many Things (13 cards), 8,000 gp, and a Rod of Lordly Might",
    "15,000 gp in mixed coinage, a Holy Avenger, and an Amulet of the Planes",
    "12,000 gp, a Mirror of Life Trapping, and a Staff of the Magi",
    "9,000 gp, two Manuals (random), and a Talisman of Pure Good",
    "A Cubic Gate, 7,500 gp, and a Ring of Three Wishes (1 wish remaining)",
  ],
};

export const mundaneItems: string[] = [
  "A finely crafted leather belt with a silver buckle",
  "A set of traveler's clothes (slightly worn)",
  "A walking staff with carvings of leaves",
  "A small bronze mirror",
  "A sealed bottle of fine wine (Neverwinter Reserve)",
  "A clay pipe and a pouch of pipeweed",
  "An ornate wooden box (empty)",
  "A set of loaded dice (gilded)",
  "A detailed map of a local town (slightly wrong)",
  "A fishing rod and tackle",
  "A bag of ball bearings (1,000 count)",
  "An hourglass filled with blue sand",
  "A leather-bound journal (half full of sketches)",
  "A pair of fur-lined gloves",
  "A horseshoe (lucky, supposedly)",
];

export const commonMagicItems: string[] = [
  "Potion of Healing — Restores 2d4 + 2 HP",
  "Potion of Climbing — Gain a climb speed equal to walk speed for 1 hour",
  "Potion of Animal Friendship — Cast Animal Friendship for 1 hour",
  "Spell Scroll (Cantrip) — Contains a random cantrip",
  "Spell Scroll (1st level) — Contains a random 1st-level spell",
  "Alchemy Jug — Produces various mundane liquids",
  "Bag of Tricks (Gray) — Pull random small beasts from the bag",
  "Boots of False Tracks — Leave tracks of a different humanoid",
  "Candle of the Deep — Burns underwater without going out",
  "Charlatan's Die — Roll secretly; only you see the real result",
  "Cleansing Stone — Remove dirt and grime with a touch",
  "Cloak of Billowing — Billow dramatically at will",
  "Cloak of Many Fashions — Change its appearance at will",
  "Clockwork Amulet — Roll attacks once per day: use 10 instead",
  "Clothes of Mending — Repair tears in itself over 1 hour",
  "Dark Shard Amulet — Warlocks cast thaumaturgy and use as spellcasting focus",
  "Enduring Spellbook — Waterproof and fireproof spellbook",
  "Ersatz Eye — Magical glass eye; darkvision 60 ft if fitted",
  "Hat of Vermin — Produce a bat, frog, or rat once per day",
  "Hat of Wizardry — Cantrips roll with wizard list once per day",
  "Heward's Handy Spice Pouch — Produce spices at will",
  "Horn of Silent Alarm — Alarm only audible to one target",
  "Instrument of Illusions — While playing, create visual illusions (no sounds)",
  "Instrument of Scribing — Magically writes dictated text",
  "Lock of Trickery — Lock has a hidden mechanism; DC 15 to pick",
  "Moon-Touched Sword — Glows like moonlight in darkness (not magical for bonus purposes)",
  "Mystery Key — 5% chance to open any mundane lock",
  "Orb of Direction — Points to magnetic north",
  "Orb of Time — Tells the time of day",
  "Perfume of Bewitching — Target is charmed for 1 hour (Wisdom DC 13 negates)",
  "Pipe of Smoke Monsters — Blow smoke in the shape of creatures",
  "Pitless Pot — Food cooked in it never spoils",
  "Pole of Angling — Self-manipulating fishing pole; +5 to Nature checks to fish",
  "Pole of Collapsing — 10-foot pole collapses to 1 foot",
  "Pot of Awakening — Grow an awakened shrub",
  "Rope of Mending — Reattaches cut sections when pressed together",
  "Ruby of the War Mage — Attach to weapon; use as spellcasting focus",
  "Shield of Expression — Change the face engraved on it at will",
  "Smoldering Armor — Emit harmless smoke at will",
  "Staff of Adornment — Make flowers, vines, and butterflies appear",
  "Staff of Birdcalls — Mimic bird calls (7 charges, regain 1d6+1 at dawn)",
  "Staff of Flowers — Grow flowers (7 charges, regain 1d6+1 at dawn)",
  "Stone of Good Luck (Luckstone) — +1 to ability checks and saving throws",
  "Talking Doll — Speak a phrase and doll repeats it at a trigger",
  "Tankard of Sobriety — Never get drunk from it",
  "Unbreakable Arrow — Can't be broken (doesn't bypass DR)",
  "Veteran's Cane — Transforms into a shortsword; back to cane as bonus action",
  "Walloping Ammunition — Target knocked prone on a hit (DC 10 Str save)",
  "Wand of Conducting — Harmless music and light show",
  "Wand of Pyrotechnics — Colorful fireworks once per day",
  "Wand of Scowls — Target scowls for 1 hour (Wis DC 10 negates)",
  "Wand of Smiles — Target smiles for 1 hour (Wis DC 10 negates)",
];

// ── Place name generator ───────────────────────────────────────────────────

const placePrefixes = [
  "Iron","Silver","Storm","Oak","Ash","Crow","Ember","Dark","Mist","Gold",
  "Frost","Stone","Thorn","Raven","Dusk","Bright","Salt","Hollow","Bone",
  "Grim","Amber","Copper","Elder","Shadow","Marsh","Loch","Veil","Horn",
  "Black","Red","White","High","Low","Old","New","North","South","East","West",
];

const placeSuffixes = [
  "haven","ford","bridge","hold","gate","wick","ton","burg","fell","moor",
  "vale","reach","keep","port","cross","mill","brook","cliff","wood","thorpe",
  "stead","crest","hollow","watch","spire","mark","dale","field","holm","grove",
];

const placeAdjectives = [
  "Grey","Pale","Ashen","Sunken","Crumbling","Forgotten","Cursed","Gilded",
  "Verdant","Flooded","Foggy","Blasted","Hallowed","Fallen","Buried","Sacred",
  "Wind-scarred","Smoke-stained","Ancient","Glittering","Twisted","Drowning",
];

const placeNouns = [
  "Crossing","Landing","Hollow","Point","Rise","Reach","Pass","Narrows",
  "Bluffs","Bend","Gap","Heights","Downs","Flats","Moors","Shores",
  "Wastes","Pines","Cove","Basin","Fork","Briar","Ledge","Expanse",
];

const humanNames = [
  "Aldric","Mira","Cassius","Lysa","Dorian","Petra","Gareth","Sela",
  "Tristan","Brennan","Vesna","Orin","Marcus","Elara","Torben","Sienna",
  "Davan","Rowan","Aleth","Cormac","Wren","Halden",
];

const placeNamePatterns = [
  () => pickRandom(placePrefixes) + pickRandom(placeSuffixes),
  () => pickRandom(placePrefixes) + pickRandom(placeSuffixes),
  () => pickRandom(placeAdjectives) + " " + pickRandom(placeNouns),
  () => pickRandom(humanNames) + "'s " + pickRandom(["Landing","Rest","Reach","Watch","Crossing","Hold","Ford","Gate","Folly","End"]),
  () => "The " + pickRandom(placeAdjectives) + " " + pickRandom(["Gate","Hold","Spire","Tower","Ruins","Fang","Crown","Maw","Eye","Wound"]),
  () => pickRandom(placePrefixes) + " " + pickRandom(["Peak","Isle","Bay","Fen","Glen","Mere","Tor","Rift","Crags","Vaults"]),
];

export const settlementTypes: Record<string, { label: string; descriptors: string[] }> = {
  City: {
    label: "City",
    descriptors: [
      "a sprawling walled city at the heart of the realm",
      "a bustling trade hub where merchants from every land converge",
      "an ancient city whose foundations predate written history",
      "a fog-shrouded city built over a vast subterranean network",
      "a city of gleaming towers under the shadow of a dormant volcano",
      "a coastal city whose docks never sleep",
      "a divided city, split between two feuding noble houses",
      "a city carved into the face of a great white cliff",
    ],
  },
  Town: {
    label: "Town",
    descriptors: [
      "a prosperous market town at the junction of two trade roads",
      "a river-crossing town known for its fine bridge and toll disputes",
      "a mining town clinging to the edge of a worked-out vein",
      "a town that swells threefold during the harvest festival",
      "a border town where two nations eye each other nervously",
      "a walled town that has seen better days since the war",
      "a quiet town with an unusually active thieves' guild",
      "a logging town carved from the edge of an ancient forest",
    ],
  },
  Village: {
    label: "Village",
    descriptors: [
      "a quiet farming village surrounded by golden fields",
      "a remote mountain village where outsiders are rarely welcome",
      "a fishing village where every family has lost someone to the sea",
      "a half-abandoned village whose youth have all left for the city",
      "a village that has somehow avoided every war and plague for a century",
      "a village built around a sacred old tree the locals refuse to explain",
      "a prosperous little village hiding a very large secret",
      "a village perched on stilts above a boggy lake",
    ],
  },
  Hamlet: {
    label: "Hamlet",
    descriptors: [
      "a tiny hamlet of a dozen souls clinging to a hillside",
      "a scattered cluster of farmsteads along a muddy road",
      "a hamlet whose only notable feature is a strangely well-stocked inn",
      "a crossroads hamlet that exists solely to serve travellers",
      "a hamlet where every resident claims to be a cousin of every other",
      "a bleak hamlet where no children have been born in seven years",
    ],
  },
  Fort: {
    label: "Fort / Keep",
    descriptors: [
      "a weather-beaten fortress atop a windswept hill",
      "a border keep that has changed hands a dozen times in living memory",
      "a garrisoned fort guarding the only mountain pass for fifty miles",
      "a half-ruined keep that has been crudely re-occupied by a mercenary band",
      "a newly built fort whose mortar has barely dried",
      "a dreaded prison-fortress from which no one has ever escaped",
    ],
  },
  Port: {
    label: "Port",
    descriptors: [
      "a raucous harbour town where every ship captain owes a debt",
      "a smuggler's port with a blind eye for an official",
      "a prestigious naval port whose fleet rules these waters",
      "a port city balanced on the knife-edge between two rival factions",
      "a deep-water port half-built on barnacled piles over the sea",
      "a pirate port operating just barely within the law",
    ],
  },
  Ruins: {
    label: "Ruins",
    descriptors: [
      "the crumbling ruins of a once-great imperial city",
      "ruins reclaimed by the jungle, still avoided by the locals",
      "a ruin said to be cursed since the night its walls fell in a single hour",
      "the skeletal remains of a wizard's tower and the village it destroyed",
      "sunken ruins visible at low tide, reaching up like stone fingers",
      "ruins that pilgrims visit, though they never say why",
    ],
  },
};

export function generatePlaceName(type: string): string {
  const patternFn = pickRandom(placeNamePatterns);
  const name = patternFn();
  const settl = settlementTypes[type] || settlementTypes["Town"];
  const descriptor = pickRandom(settl.descriptors);
  return `${name} — ${descriptor}.`;
}

export function generateName(race: string): string {
  const names = namesByRace[race] || namesByRace["Human"];
  return pickRandom(names);
}

export function generateLoot(cr: string): string {
  const table = lootByCR[cr] || lootByCR["CR 0-4"];
  return pickRandom(table);
}

export function generateItem(): string {
  const combined = [...mundaneItems, ...commonMagicItems];
  return pickRandom(combined);
}
