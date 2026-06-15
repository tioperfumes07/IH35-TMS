#!/usr/bin/env node
/**
 * Static guard: after migration 0050 renames safety.fines → safety.civil_fines,
 * no downstream migration or application code should reference the legacy table name.
 *
 * Allowed references remain only in the migrations that create the table and perform the rename.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ALLOW_REL_SQL = new Set([
  "db/migrations/0050_safety_gaps_fill.sql",
  "db/migrations/0050_two_section_v5_and_safety_restructure.sql",
  // The forward repair migration that COMPLETES the rename on prod (the 0050 ordering collision
  // left safety.fines un-renamed). It must reference safety.fines to rename it.
  "db/migrations/202606151200_repair_safety_0050_ordering_collision.sql",
]);

/** Qualified legacy identifier — catches SQL + TS string literals */
const BAD = /\bsafety\.fines\b/;

function walkFiles(dir, filterFn) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkFiles(p, filterFn));
    else if (filterFn(p)) out.push(p);
  }
  return out;
}

let exitCode = 0;

function report(relUnix, hint) {
  console.error(`verify-canonical-schema-names: ${hint}`);
  console.error(`  → ${relUnix}`);
  exitCode = 1;
}

for (const file of walkFiles(path.join(ROOT, "db", "migrations"), (p) => p.endsWith(".sql"))) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  if (ALLOW_REL_SQL.has(rel)) continue;
  const text = fs.readFileSync(file, "utf8");
  if (BAD.test(text)) {
    report(rel, 'Forbidden legacy table reference `safety.fines`; canonical name is `safety.civil_fines`.');
  }
}

for (const baseRel of ["scripts", path.join("apps", "backend", "src")]) {
  const base = path.join(ROOT, baseRel);
  if (!fs.existsSync(base)) continue;
  const scanTs = walkFiles(base, (p) =>
    /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(p),
  );
  for (const file of scanTs) {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    if (rel === "scripts/verify-canonical-schema-names.mjs") continue;
    const text = fs.readFileSync(file, "utf8");
    if (BAD.test(text)) {
      report(rel, 'Forbidden legacy table reference `safety.fines` in code; use `safety.civil_fines`.');
    }
  }
}

process.exit(exitCode);
