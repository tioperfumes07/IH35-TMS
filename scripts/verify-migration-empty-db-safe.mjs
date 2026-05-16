#!/usr/bin/env node
/**
 * Informational: flag DO $$ blocks that RAISE EXCEPTION / SQLSTATE where the block also
 * looks data-dependent (counts, EXISTS, NOT FOUND, SELECT … FROM …).
 * Conservative omissions: EXECUTE-format strings, nested dollar tags, non-DO raises.
 *
 * Exit 0 always — triage signal only until promoted to blocking.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIG_DIR = path.join(ROOT, "db", "migrations");

function stripLineComments(sql) {
  return sql.replace(/--[^\n]*/g, " ");
}

/** Minimal extractor for `DO $$ ... $$` (same tag assumed). Skips DO $tag$ ... $tag$. */
function extractDoDoubleDollarBodies(sql) {
  const bodies = [];
  const s = stripLineComments(sql);
  let idx = 0;
  const lower = s.toLowerCase();
  while (idx < s.length) {
    const i = lower.indexOf("do $$", idx);
    if (i === -1) break;
    const bodyStart = i + "do $$".length;
    const close = s.indexOf("$$", bodyStart);
    if (close === -1) break;
    bodies.push(s.slice(bodyStart, close));
    idx = close + 2;
  }
  return bodies;
}

const DATAISH =
  /\b(count\s*\(|exists\s*\(|not\s+found\b|\bfound\b|select\s+\*\s+from|into\s+\w+\s*$|\bfrom\s+[a-z_][a-z0-9_.]*\s)/i;

const RAISE_HARD =
  /\braise\s+exception\b|\braise\s+sqlstate\b|\braise\s+using\b/i;

function main() {
  const files = fs
    .readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const findings = [];

  for (const file of files) {
    const sql = fs.readFileSync(path.join(MIG_DIR, file), "utf8");
    let bi = 0;
    for (const body of extractDoDoubleDollarBodies(sql)) {
      bi++;
      if (!RAISE_HARD.test(body)) continue;
      if (!DATAISH.test(body)) continue;
      const lines = body.split("\n").filter((l) => RAISE_HARD.test(l));
      const snippet = lines
        .slice(0, 3)
        .map((l) => l.trim())
        .join(" ← ")
        .slice(0, 200);
      findings.push({
        file,
        blockIndex: bi,
        snippet: snippet || "(RAISE in block — see migration)",
      });
    }
  }

  if (findings.length === 0) {
    console.log(
      "db:verify:empty-db-safe — OK (no DO $$ blocks matched heuristic for data-dependent RAISE EXCEPTION/SQLSTATE)",
    );
    process.exit(0);
    return;
  }

  console.warn(
    "\ndb:verify:empty-db-safe — INFORMATIONAL (review for empty-DB safety):\n",
  );
  for (const f of findings) {
    console.warn(`  ${f.file} (DO $$ block ~#${f.blockIndex})`);
    console.warn(`    ${f.snippet}`);
  }
  console.warn(
    `\nTotal flagged blocks: ${findings.length} (exit 0 — not blocking CI)\n`,
  );
  process.exit(0);
}

main();
