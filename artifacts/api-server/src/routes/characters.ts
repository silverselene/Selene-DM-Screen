import { Router, type IRouter } from "express";
import { pool } from "../lib/db";

const router: IRouter = Router();

router.get("/characters", async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, race, class, level, ac, hp, spells, weapons, created_at
       FROM player_characters ORDER BY name ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch characters" });
  }
});

router.post("/characters", async (req, res) => {
  const { name, race, class: cls, level, ac, hp, spells, weapons } = req.body;
  if (!name?.trim()) return void res.status(400).json({ error: "Name is required" });
  try {
    const result = await pool.query(
      `INSERT INTO player_characters (name, race, class, level, ac, hp, spells, weapons)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        name.trim(),
        race || null,
        cls || null,
        level ? Number(level) : 1,
        ac ? Number(ac) : null,
        hp ? Number(hp) : null,
        JSON.stringify(spells || []),
        JSON.stringify(weapons || []),
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create character" });
  }
});

router.put("/characters/:id", async (req, res) => {
  const { id } = req.params;
  const { name, race, class: cls, level, ac, hp, spells, weapons } = req.body;
  if (!name?.trim()) return void res.status(400).json({ error: "Name is required" });
  try {
    const result = await pool.query(
      `UPDATE player_characters
       SET name=$1, race=$2, class=$3, level=$4, ac=$5, hp=$6, spells=$7, weapons=$8
       WHERE id=$9 RETURNING *`,
      [
        name.trim(),
        race || null,
        cls || null,
        level ? Number(level) : 1,
        ac ? Number(ac) : null,
        hp ? Number(hp) : null,
        JSON.stringify(spells || []),
        JSON.stringify(weapons || []),
        id,
      ]
    );
    if (!result.rows.length) return void res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update character" });
  }
});

router.delete("/characters/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query("DELETE FROM player_characters WHERE id=$1", [id]);
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete character" });
  }
});

export default router;
