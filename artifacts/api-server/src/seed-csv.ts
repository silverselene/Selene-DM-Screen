import fs from "fs";
import path from "path";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  ssl: false,
});

// Minimal CSV parser that handles quoted fields (including commas inside quotes)
function parseCSV(content: string): string[][] {
  const rows: string[][] = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const fields: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        fields.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    fields.push(cur);
    rows.push(fields);
  }
  return rows;
}

async function seedFromCSV() {
  const csvPath = path.resolve(
    process.cwd(),
    "../../attached_assets/Monsters_&_Beasts_6f2f1d558fe144f8a49d17886a893051_all_1776621271153.csv"
  );

  const raw = fs.readFileSync(csvPath, "utf-8").replace(/^\uFEFF/, ""); // strip BOM
  const rows = parseCSV(raw);
  const header = rows[0];
  console.log("Header:", header);
  console.log(`Total data rows: ${rows.length - 1}`);

  // Column indices
  const idx = (name: string) => header.indexOf(name);
  const iName       = idx("Name");
  const iAC         = idx("AC");
  const iAlignment  = idx("Alignment");
  const iCR         = idx("CR");
  const iHP         = idx("Hit Points");
  const iSize       = idx("Size");
  const iSource     = idx("Source");
  const iSpeed      = idx("Speed (ft)");
  const iType       = idx("Type");
  const iLegendary  = idx("Legendary");
  const iPageNumber = idx("Page Number");
  const iInitiative = idx("Initiative");
  const iInitRoll   = idx("Initiative Roll");
  const iEnvironment= idx("Environment");

  const client = await pool.connect();
  let inserted = 0, updated = 0, skipped = 0;

  try {
    await client.query("BEGIN");

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row[iName]?.trim()) continue;

      const name        = row[iName].trim();
      const ac          = parseInt(row[iAC]) || 0;
      const alignment   = row[iAlignment]?.trim() || "";
      const cr          = row[iCR]?.trim() || "0";
      const hp          = row[iHP]?.trim() || "0";
      const size        = row[iSize]?.trim() || "";
      const source      = row[iSource]?.trim() || "";
      const speed       = row[iSpeed]?.trim() || "";
      const type        = row[iType]?.trim() || "";
      const isLegendary = row[iLegendary]?.trim().toLowerCase() === "legendary";
      const pageNumber  = parseInt(row[iPageNumber]) || null;
      const initiative  = parseInt(row[iInitiative]) || 0;
      const initiativeRoll = parseInt(row[iInitRoll]) || 10;
      const environment = row[iEnvironment]?.trim() || "";

      const result = await client.query(
        `INSERT INTO monsters (
          name, ac, alignment, cr, hp, size, source, speed, type,
          is_legendary, page_number, initiative_modifier, initiative_roll, environment,
          ac_type, senses, languages,
          str, dex, con, int_score, wis, cha,
          traits, actions, reactions, legendary_actions
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,
          $10,$11,$12,$13,$14,
          '','','',
          10,10,10,10,10,10,
          '[]','[]','[]','[]'
        )
        ON CONFLICT (name) DO UPDATE SET
          source          = EXCLUDED.source,
          page_number     = EXCLUDED.page_number,
          initiative_modifier = EXCLUDED.initiative_modifier,
          initiative_roll = EXCLUDED.initiative_roll,
          environment     = EXCLUDED.environment,
          is_legendary    = EXCLUDED.is_legendary,
          ac              = CASE WHEN monsters.ac = 0 THEN EXCLUDED.ac ELSE monsters.ac END,
          hp              = CASE WHEN monsters.hp = '0' OR monsters.hp = '' THEN EXCLUDED.hp ELSE monsters.hp END,
          alignment       = CASE WHEN monsters.alignment = '' THEN EXCLUDED.alignment ELSE monsters.alignment END,
          size            = CASE WHEN monsters.size = '' THEN EXCLUDED.size ELSE monsters.size END,
          type            = CASE WHEN monsters.type = '' THEN EXCLUDED.type ELSE monsters.type END,
          speed           = CASE WHEN monsters.speed = '' THEN EXCLUDED.speed ELSE monsters.speed END
        RETURNING (xmax = 0) AS was_inserted`,
        [
          name, ac, alignment, cr, hp, size, source, speed, type,
          isLegendary, pageNumber, initiative, initiativeRoll, environment,
        ]
      );

      const wasInserted = result.rows[0]?.was_inserted;
      if (wasInserted) inserted++; else updated++;
    }

    await client.query("COMMIT");
    console.log(`Done. Inserted: ${inserted}, Updated (merged): ${updated}, Skipped: ${skipped}`);
    console.log(`Total in DB after import:`);
    const countResult = await client.query("SELECT COUNT(*) FROM monsters");
    console.log(`  ${countResult.rows[0].count} monsters`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seedFromCSV().catch((e) => { console.error(e); process.exit(1); });
