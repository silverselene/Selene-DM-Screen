import pg from "../node_modules/pg/lib/index.js";
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data";

// ── Lookups ────────────────────────────────────────────────────────────────
const DMG_TYPES = {
  A: "Acid", B: "Bludgeoning", C: "Cold", F: "Fire", O: "Force",
  L: "Lightning", N: "Necrotic", P: "Piercing", Po: "Poison",
  Py: "Psychic", R: "Radiant", S: "Slashing", T: "Thunder",
};

const PROP_NAMES = {
  A: "Ammunition", AF: "Automatic", BF: "Burst Fire", F: "Finesse",
  H: "Heavy", L: "Light", LD: "Loading", R: "Reach", RLD: "Reload",
  S: "Special", T: "Thrown", "2H": "Two-Handed", V: "Versatile",
};

function stripPropSource(p) {
  // "F|XPHB" → "F"  (some entries may be objects — skip them)
  if (typeof p !== "string") return "";
  return p.split("|")[0];
}

function parseProperties(item) {
  const props = (item.property || []).map(p => {
    const code = stripPropSource(p);
    return PROP_NAMES[code] || code;
  }).filter(Boolean);

  // Add range as a pseudo-property for clarity
  if (item.range) props.push(`Range ${item.range}`);
  if (item.reload != null) props.push(`Reload ${item.reload}`);
  if (item.dmg2) props.push(`Versatile ${item.dmg2}`);
  return [...new Set(props)];
}

function parseCost(item) {
  if (!item.value) return null;
  const cp = item.value;
  if (cp % 100 === 0) return `${cp / 100} gp`;
  if (cp % 10 === 0) return `${cp / 10} sp`;
  return `${cp} cp`;
}

function stripTags(str) {
  if (typeof str !== "string") return "";
  return str.replace(/\{@\w+\s([^}]*)\}/g, (_, t) => t.split("|")[0]).replace(/\{[^}]+\}/g, "");
}

function renderEntries(entries) {
  if (!entries) return null;
  if (typeof entries === "string") return stripTags(entries);
  if (Array.isArray(entries)) return entries.map(renderEntries).filter(Boolean).join("\n");
  if (typeof entries === "object") {
    const parts = [];
    if (entries.name) parts.push(stripTags(entries.name) + ":");
    if (entries.entries) parts.push(renderEntries(entries.entries));
    if (entries.entry) parts.push(renderEntries(entries.entry));
    return parts.join(" ");
  }
  return String(entries);
}

function parseItem(item) {
  const category = item.weaponCategory || null;
  const damage = item.dmg1 || null;
  const dmgType = DMG_TYPES[item.dmgType] || item.dmgType || null;
  const weight = item.weight != null ? `${item.weight} lb.` : null;
  const properties = parseProperties(item);
  const cost = parseCost(item);
  const desc = renderEntries(item.entries) || null;

  return {
    name: item.name,
    category,
    damage,
    damage_type: dmgType,
    weight,
    properties,
    cost,
    description: desc,
    is_homebrew: false,
    // For dedup priority: "one" (2024) > "classic" > undefined
    _edition: item.edition || "classic",
    _source: item.source || "",
  };
}

function isWeapon(item) {
  return !!(item.weapon || item.weaponCategory || item.dmg1);
}

// ── Fetch & parse ──────────────────────────────────────────────────────────
async function fetchJSON(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

(async () => {
  console.log("Fetching weapon data from 5etools…");
  const [baseData, itemData] = await Promise.all([
    fetchJSON(`${BASE}/items-base.json`),
    fetchJSON(`${BASE}/items.json`),
  ]);

  const baseItems = (baseData.baseitem || []).filter(isWeapon).map(parseItem);
  const magicItems = (itemData.item || []).filter(isWeapon).map(parseItem);

  console.log(`  Base weapons: ${baseItems.length}`);
  console.log(`  Magic/additional weapons: ${magicItems.length}`);

  // Deduplicate: keyed by lowercase name.
  // Priority: edition "one" (2024) > "classic". Within same edition, keep first.
  const map = new Map();
  const editionRank = (e) => e === "one" ? 2 : 1;

  for (const item of [...baseItems, ...magicItems]) {
    const key = item.name.toLowerCase();
    const existing = map.get(key);
    if (!existing || editionRank(item._edition) > editionRank(existing._edition)) {
      map.set(key, item);
    }
  }

  const unique = [...map.values()];
  console.log(`\nUnique weapon names: ${unique.length}`);

  // Widen columns just in case
  await pool.query(`
    ALTER TABLE weapons
      ALTER COLUMN name TYPE TEXT,
      ALTER COLUMN category TYPE TEXT,
      ALTER COLUMN damage TYPE TEXT,
      ALTER COLUMN damage_type TYPE TEXT,
      ALTER COLUMN weight TYPE TEXT,
      ALTER COLUMN cost TYPE TEXT
  `).catch(() => {}); // ignore if already TEXT

  // Clear & re-import
  console.log("Clearing existing weapons…");
  await pool.query("DELETE FROM weapons");
  await pool.query("SELECT setval(pg_get_serial_sequence('weapons','id'), 1, false)").catch(() => {});

  // Insert in batches of 100
  const BATCH = 100;
  let inserted = 0;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const vals = [];
    const params = [];
    let p = 1;
    for (const w of batch) {
      vals.push(`($${p},$${p+1},$${p+2},$${p+3},$${p+4},$${p+5}::text[],$${p+6},$${p+7},$${p+8})`);
      params.push(
        w.name, w.category, w.damage, w.damage_type,
        w.weight, w.properties, w.cost, w.description, w.is_homebrew
      );
      p += 9;
    }
    await pool.query(
      `INSERT INTO weapons (name,category,damage,damage_type,weight,properties,cost,description,is_homebrew)
       VALUES ${vals.join(",")}`,
      params
    );
    inserted += batch.length;
    process.stdout.write(`\r  Inserted ${inserted}/${unique.length}…`);
  }

  console.log(`\n\nDone! ${inserted} weapons in the database.`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
