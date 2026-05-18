import pg from "../node_modules/pg/lib/index.js";
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ── School codes → full names ──────────────────────────────────────────────
const SCHOOLS = {
  A: "Abjuration", C: "Conjuration", D: "Divination", E: "Enchantment",
  V: "Evocation", Ev: "Evocation", I: "Illusion", N: "Necromancy", T: "Transmutation",
  P: "Conjuration", // some sources use P for portals/conjuration
};

// ── Spell files to import ──────────────────────────────────────────────────
const BASE = "https://raw.githubusercontent.com/5etools-mirror-3/5etools-src/main/data/spells";
const FILES = [
  "spells-phb.json",
  "spells-xphb.json",
  "spells-xge.json",
  "spells-tce.json",
  "spells-egw.json",
  "spells-ggr.json",
  "spells-ftd.json",
  "spells-aag.json",
  "spells-ai.json",
  "spells-aitfr-avt.json",
  "spells-bmt.json",
  "spells-efa.json",
  "spells-frhof.json",
  "spells-idrotf.json",
  "spells-llk.json",
  "spells-sato.json",
  "spells-scc.json",
];

// ── Strip 5etools {@tag text} formatting ───────────────────────────────────
function stripTags(str) {
  if (typeof str !== "string") return "";
  return str
    .replace(/\{@(atk|h|hit|dc|damage|scaledamage|dice|d20|recharge|chance|hazard|condition|skill|sense|action|bonus|reaction|legendary|lair|mythic|adventure|book|filter|footnote|quickref|optfeature|psionic|reward|variantrule|deity|vehicle|vehupgrade|object|trap|itemType|itemProperty|classFeature|subclassFeature|race|background|class|subclass|feat|spell|item|creature|disease|status|cult|boon|encounter|table|link|scaledice|hitYourSpellAttack|note|color|bold|italic|strike|underline|sup|sub|kbd|code|comic|comicH1|comicH2|comicH3|comicH4|comicNote|indented|quote|inline|inlinecode) ([^}]+)\}/gi, (_, _tag, text) => text.split("|")[0])
    .replace(/\{@(\w+)\s([^}]*)\}/g, (_, _tag, text) => text.split("|")[0])
    .replace(/\{([^}]+)\}/g, "$1");
}

// ── Recursively render entries to plain text ───────────────────────────────
function renderEntries(entries, depth = 0) {
  if (!entries) return "";
  if (typeof entries === "string") return stripTags(entries);
  if (Array.isArray(entries)) {
    return entries.map(e => renderEntries(e, depth)).filter(Boolean).join("\n");
  }
  if (typeof entries === "object") {
    const parts = [];
    if (entries.name) parts.push((depth > 0 ? "• " : "") + stripTags(entries.name) + ":");
    if (entries.entries) parts.push(renderEntries(entries.entries, depth + 1));
    if (entries.items) parts.push(renderEntries(entries.items, depth + 1));
    if (entries.rows) {
      for (const row of entries.rows) {
        if (Array.isArray(row)) parts.push(row.map(c => renderEntries(c)).join(" | "));
      }
    }
    if (entries.entry) parts.push(renderEntries(entries.entry, depth));
    return parts.filter(Boolean).join("\n");
  }
  return String(entries);
}

// ── Parse casting time ─────────────────────────────────────────────────────
function parseTime(time) {
  if (!time?.length) return "1 action";
  const t = time[0];
  const num = t.number ?? 1;
  const unit = t.unit ?? "action";
  let out = `${num} ${unit}`;
  if (t.condition) out += ` (${stripTags(t.condition)})`;
  return out;
}

// ── Parse range ────────────────────────────────────────────────────────────
function parseRange(range) {
  if (!range) return "Self";
  const type = range.type;
  if (type === "special") return "Special";
  if (type === "point") {
    const dist = range.distance;
    if (!dist) return "Self";
    if (dist.type === "self") return "Self";
    if (dist.type === "touch") return "Touch";
    if (dist.type === "sight") return "Sight";
    if (dist.type === "unlimited") return "Unlimited";
    return `${dist.amount} ${dist.type}`;
  }
  if (type === "radius" || type === "cone" || type === "line" || type === "cube" || type === "sphere" || type === "hemisphere" || type === "cylinder") {
    const dist = range.distance;
    if (dist) return `Self (${dist.amount}-${dist.type} ${type})`;
    return `Self (${type})`;
  }
  return "Self";
}

// ── Parse components ───────────────────────────────────────────────────────
function parseComponents(comp) {
  if (!comp) return "";
  const parts = [];
  if (comp.v) parts.push("V");
  if (comp.s) parts.push("S");
  if (comp.m) {
    const mat = typeof comp.m === "string" ? comp.m : comp.m.text || "";
    parts.push(`M (${stripTags(mat)})`);
  }
  if (comp.r) parts.push("R");
  return parts.join(", ");
}

// ── Parse duration ─────────────────────────────────────────────────────────
function parseDuration(duration) {
  if (!duration?.length) return "Instantaneous";
  const d = duration[0];
  const conc = d.concentration ? " (concentration)" : "";
  if (d.type === "instant") return "Instantaneous";
  if (d.type === "permanent") {
    if (d.ends?.includes("dispel")) return "Until dispelled";
    return "Permanent";
  }
  if (d.type === "special") return "Special";
  if (d.type === "timed" && d.duration) {
    const amt = d.duration.amount ?? 1;
    const unit = d.duration.type ?? "round";
    return `${amt} ${unit}${conc}`;
  }
  return "Instantaneous";
}

// ── Extract classes ────────────────────────────────────────────────────────
function parseClasses(classesObj) {
  if (!classesObj) return [];
  const set = new Set();
  for (const src of ["fromClassList", "fromClassListVariant", "fromSubclass"]) {
    for (const c of classesObj[src] || []) {
      const name = c.className || c.name;
      if (name) set.add(name);
    }
  }
  return [...set].sort();
}

// ── Parse one spell object → DB row ───────────────────────────────────────
function parseSpell(s) {
  const desc = renderEntries(s.entries);
  const upcast = s.entriesHigherLevel ? renderEntries(s.entriesHigherLevel) : null;
  return {
    name: s.name,
    level: s.level ?? 0,
    school: SCHOOLS[s.school] || s.school || "Unknown",
    casting_time: parseTime(s.time),
    spell_range: parseRange(s.range),
    components: parseComponents(s.components),
    duration: parseDuration(s.duration),
    classes: parseClasses(s.classes),
    description: desc,
    ritual: !!(s.meta?.ritual),
    concentration: !!(s.duration?.[0]?.concentration),
    upcast,
  };
}

// ── Fetch a single file ────────────────────────────────────────────────────
async function fetchFile(filename) {
  const res = await fetch(`${BASE}/${filename}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${filename}`);
  const json = await res.json();
  return (json.spell || []).map(s => ({ ...parseSpell(s), _source: filename }));
}

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  console.log(`Fetching ${FILES.length} source files in parallel…`);
  const results = await Promise.allSettled(FILES.map(fetchFile));

  // Collect all spells, deduplicate by lowercase name (keep first occurrence = PHB/XPHB first)
  const seen = new Map();
  let total = 0;
  for (const [i, result] of results.entries()) {
    if (result.status === "rejected") {
      console.warn(`  ✗ ${FILES[i]}: ${result.reason.message}`);
      continue;
    }
    const spells = result.value;
    console.log(`  ✓ ${FILES[i]}: ${spells.length} spells`);
    total += spells.length;
    for (const sp of spells) {
      const key = sp.name.toLowerCase();
      if (!seen.has(key)) seen.set(key, sp);
    }
  }

  console.log(`\nTotal fetched: ${total} | Unique names: ${seen.size}`);
  const unique = [...seen.values()];

  // Clear and re-import
  console.log("Clearing existing spells…");
  await pool.query("DELETE FROM spells");
  await pool.query("SELECT setval(pg_get_serial_sequence('spells','id'), 1, false)");

  // Bulk insert in batches of 200
  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const values = [];
    const params = [];
    let p = 1;
    for (const sp of batch) {
      values.push(`($${p},$${p+1},$${p+2},$${p+3},$${p+4},$${p+5},$${p+6},$${p+7}::text[],$${p+8},$${p+9},$${p+10},$${p+11})`);
      params.push(
        sp.name, sp.level, sp.school, sp.casting_time, sp.spell_range,
        sp.components, sp.duration,
        sp.classes,
        sp.description, sp.ritual, sp.concentration, sp.upcast
      );
      p += 12;
    }
    await pool.query(
      `INSERT INTO spells (name,level,school,casting_time,spell_range,components,duration,classes,description,ritual,concentration,upcast)
       VALUES ${values.join(",")}`,
      params
    );
    inserted += batch.length;
    process.stdout.write(`\r  Inserted ${inserted}/${unique.length}…`);
  }

  console.log(`\n\nDone! ${inserted} spells in the database.`);
  await pool.end();
})().catch(e => { console.error(e); process.exit(1); });
