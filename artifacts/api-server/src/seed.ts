import { Pool } from "pg";
import { bestiaryData } from "../../dm-screen/src/data/bestiary";

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"],
  ssl: false,
});

async function seedMonsters() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM monsters");
    console.log("Cleared monsters table");

    for (const m of bestiaryData) {
      await client.query(
        `INSERT INTO monsters (
          name, size, type, alignment, ac, ac_type, hp, speed,
          str, dex, con, int_score, wis, cha,
          saving_throws, skills, damage_immunities, damage_resistances,
          damage_vulnerabilities, condition_immunities, senses, languages, cr,
          traits, actions, reactions, legendary_actions
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,
          $9,$10,$11,$12,$13,$14,
          $15,$16,$17,$18,
          $19,$20,$21,$22,$23,
          $24,$25,$26,$27
        )`,
        [
          m.name, m.size, m.type, m.alignment,
          m.ac, m.acType ?? "", m.hp, m.speed,
          m.str, m.dex, m.con, m.int, m.wis, m.cha,
          m.savingThrows ?? null, m.skills ?? null,
          m.damageImmunities ?? null, m.damageResistances ?? null,
          m.damageVulnerabilities ?? null, m.conditionImmunities ?? null,
          m.senses, m.languages, m.cr,
          JSON.stringify(m.traits ?? []),
          JSON.stringify(m.actions ?? []),
          JSON.stringify(m.reactions ?? []),
          JSON.stringify(m.legendaryActions ?? []),
        ]
      );
    }

    await client.query("COMMIT");
    console.log(`Seeded ${bestiaryData.length} monsters`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seedMonsters().catch((e) => { console.error(e); process.exit(1); });
