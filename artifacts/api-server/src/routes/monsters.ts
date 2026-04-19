import { Router, type IRouter } from "express";
import { pool } from "../lib/db";

const router: IRouter = Router();

router.get("/monsters", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, size, type, alignment, ac, ac_type, hp, speed,
              str, dex, con, int_score, wis, cha,
              saving_throws, skills, damage_immunities, damage_resistances,
              damage_vulnerabilities, condition_immunities, senses, languages, cr,
              traits, actions, reactions, legendary_actions
       FROM monsters
       ORDER BY name ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch monsters" });
  }
});

router.get("/monsters/search", async (req, res) => {
  const q = String(req.query["q"] ?? "").toLowerCase();
  const type = req.query["type"] ? String(req.query["type"]) : null;
  const source = req.query["source"] ? String(req.query["source"]) : null;
  const legendary = req.query["legendary"] === "true" ? true : null;

  try {
    const conditions: string[] = ["LOWER(name) LIKE $1"];
    const params: unknown[] = [`%${q}%`];
    let p = 2;

    if (type) { conditions.push(`LOWER(type) = $${p++}`); params.push(type.toLowerCase()); }
    if (source) { conditions.push(`source = $${p++}`); params.push(source); }
    if (legendary !== null) { conditions.push(`is_legendary = $${p++}`); params.push(legendary); }

    const result = await pool.query(
      `SELECT id, name, size, type, alignment, ac, ac_type, hp, cr,
              source, is_legendary, initiative_modifier, initiative_roll, environment
       FROM monsters
       WHERE ${conditions.join(" AND ")}
       ORDER BY name ASC
       LIMIT 60`,
      params
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to search monsters" });
  }
});

router.get("/monsters/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM monsters WHERE id = $1`,
      [req.params["id"]]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Monster not found" });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch monster" });
  }
});

export default router;
