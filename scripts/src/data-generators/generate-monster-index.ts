// Convert the curated CSV at
// attached_assets/Monsters_&_Beasts_*.csv into a static TypeScript file
// the Initiative widget can autocomplete from offline. Each row carries
// just enough to drop a creature into combat (name, AC, HP, CR, type,
// size, source) — full stat blocks live in bestiary.ts.

import fs from "node:fs";
import path from "node:path";

import {
  REPO_ROOT,
  DM_DATA_DIR,
  generatedHeader,
  tsLiteral,
  writeOutput,
} from "./lib.js";

interface MonsterIndexEntry {
  name: string;
  ac: number;
  hp: string;
  cr: string;
  size: string;
  type: string;
  alignment: string;
  source: string;
  environment: string;
  pageNumber: number | null;
  isLegendary: boolean;
  initiativeModifier: number;
  initiativeRoll: number;
}

function parseCSV(content: string): string[][] {
  // Minimal RFC4180-ish parser; tolerates quoted fields containing commas
  // and escaped double quotes ("").
  const rows: string[][] = [];
  let cur = "";
  let inQuotes = false;
  let row: string[] = [];
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cur);
        cur = "";
      } else if (ch === "\r") {
        // ignore
      } else if (ch === "\n") {
        row.push(cur);
        cur = "";
        if (row.some((c) => c.length > 0)) rows.push(row);
        row = [];
      } else {
        cur += ch;
      }
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    if (row.some((c) => c.length > 0)) rows.push(row);
  }
  return rows;
}

function main() {
  const csvPath = path.join(
    REPO_ROOT,
    "attached_assets/Monsters_&_Beasts_6f2f1d558fe144f8a49d17886a893051_all_1776621271153.csv",
  );
  console.log(`Reading ${path.relative(REPO_ROOT, csvPath)}`);

  const raw = fs.readFileSync(csvPath, "utf-8").replace(/^﻿/, "");
  const rows = parseCSV(raw);
  const header = rows[0]!;
  const idx = (name: string) => header.indexOf(name);

  const iName = idx("Name");
  const iAC = idx("AC");
  const iAlign = idx("Alignment");
  const iCR = idx("CR");
  const iHP = idx("Hit Points");
  const iSize = idx("Size");
  const iSource = idx("Source");
  const iSpeed = idx("Speed (ft)");
  void iSpeed;
  const iType = idx("Type");
  const iLegendary = idx("Legendary");
  const iPage = idx("Page Number");
  const iInit = idx("Initiative");
  const iInitRoll = idx("Initiative Roll");
  const iEnv = idx("Environment");

  console.log(`  ${rows.length - 1} data rows`);

  const entries: MonsterIndexEntry[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const name = row[iName]?.trim();
    if (!name) continue;
    entries.push({
      name,
      ac: parseInt(row[iAC] ?? "0", 10) || 0,
      hp: row[iHP]?.trim() || "0",
      cr: row[iCR]?.trim() || "0",
      size: row[iSize]?.trim() ?? "",
      type: row[iType]?.trim() ?? "",
      alignment: row[iAlign]?.trim() ?? "",
      source: row[iSource]?.trim() ?? "",
      environment: row[iEnv]?.trim() ?? "",
      pageNumber: parseInt(row[iPage] ?? "", 10) || null,
      isLegendary:
        (row[iLegendary] ?? "").trim().toLowerCase() === "legendary",
      initiativeModifier: parseInt(row[iInit] ?? "0", 10) || 0,
      initiativeRoll: parseInt(row[iInitRoll] ?? "10", 10) || 10,
    });
  }

  // Dedup by case-insensitive name; first occurrence wins.
  const seen = new Set<string>();
  const unique = entries.filter((e) => {
    const key = e.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => a.name.localeCompare(b.name));

  console.log(`  ${unique.length} unique entries after dedup`);

  const headerText = generatedHeader({
    source:
      "attached_assets/Monsters_&_Beasts_*.csv (curated by the project owner)",
    generator: "generate-monster-index.ts",
    count: unique.length,
  });

  const body = `
export interface MonsterIndexEntry {
  name: string;
  ac: number;
  hp: string;
  cr: string;
  size: string;
  type: string;
  alignment: string;
  source: string;
  environment: string;
  pageNumber: number | null;
  isLegendary: boolean;
  initiativeModifier: number;
  initiativeRoll: number;
}

export const monsterIndex: MonsterIndexEntry[] = ${tsLiteral(unique)};
`;

  writeOutput(path.join(DM_DATA_DIR, "monsterIndex.ts"), headerText + body);
}

main();
