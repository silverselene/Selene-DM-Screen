import { Router, type IRouter } from "express";
import { pool } from "../lib/db";

const router: IRouter = Router();

// GET /api/weapons/search?q=scim&limit=12
router.get("/weapons/search", async (req, res) => {
  const q = ((req.query.q as string) || "").trim();
  const limit = Math.min(parseInt((req.query.limit as string) || "15"), 50);
  if (!q) return void res.json([]);
  try {
    const result = await pool.query(
      `SELECT id, name, category, damage, damage_type, properties, cost, weight
       FROM weapons
       WHERE name ILIKE $1
       ORDER BY
         CASE WHEN LOWER(name) = LOWER($2) THEN 0
              WHEN name ILIKE $3 THEN 1
              ELSE 2 END,
         name
       LIMIT $4`,
      [`%${q}%`, q, `${q}%`, limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Search failed" });
  }
});

// POST /api/weapons/by-names — resolve a list of weapon names to full records
router.post("/weapons/by-names", async (req, res) => {
  const names: string[] = (req.body.names || []).filter(Boolean);
  if (!names.length) return void res.json([]);
  try {
    const result = await pool.query(
      `SELECT id, name, category, damage, damage_type, properties, cost, weight, description
       FROM weapons
       WHERE LOWER(name) = ANY($1::text[])
       ORDER BY name`,
      [names.map((n) => n.toLowerCase())]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Lookup failed" });
  }
});

// GET /api/weapons — full list (for dropdowns etc.)
router.get("/weapons", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, category, damage, damage_type, properties
       FROM weapons ORDER BY name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch weapons" });
  }
});

export default router;
