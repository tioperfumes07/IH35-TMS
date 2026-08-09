#!/usr/bin/env node
/**
 * FAIL-SET3 ratchet — no backend SQL may select a `mdata.drivers` column that does not exist.
 *
 * The settlement render/print route selected `d.cdl_expiration_date` and `d.display_id`. Neither is
 * a real column, so the route returned 500 (Postgres 42703) on every settlement, always — and
 * because Postgres reports only the FIRST bad identifier, the second defect stayed hidden behind
 * the first. This is CLAUDE.md §4's recurring class: a service written against schema names that
 * were never there.
 *
 * The two names below are banned outright because they have real, differently-spelled counterparts
 * that authors keep reaching for:
 *   cdl_expiration_date → cdl_expires_at
 *   display_id          → mdata.drivers has none; the nearest real column is employee_id_display
 *
 * Scope is deliberately narrow: only qualified references (`<alias>.<name>`) in files that mention
 * mdata.drivers, so an unrelated table's legitimate `display_id` is not caught.
 *
 * Static only — no DB, no network, no build. Runs in well under a second.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = join(repoRoot, "apps/backend/src");

const BANNED = [
  { column: "cdl_expiration_date", real: "cdl_expires_at" },
  { column: "display_id", real: "employee_id_display (mdata.drivers has no display_id)" },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, out);
    } else if (entry.endsWith(".ts") && !entry.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

const failures = [];

/**
 * Blank comments while preserving every newline, so reported line numbers stay exact. Both comment
 * families matter here: the TS ones, and the SQL `--` lines inside the template literals — a fix
 * that documents the old broken name in a comment must not trip its own guard. `--` is only treated
 * as a SQL comment at the start of a line, so a decrement never gets blanked.
 */
function stripComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/^[ \t]*--[^\n]*/gm, (m) => " ".repeat(m.length));
}

for (const file of walk(ROOT)) {
  const raw = readFileSync(file, "utf8");
  if (!/mdata\.drivers/.test(raw)) continue;
  const src = stripComments(raw);

  // Resolve the aliases bound to mdata.drivers in this file (FROM/JOIN mdata.drivers <alias>).
  const aliases = new Set();
  for (const m of src.matchAll(/mdata\.drivers\s+(?:AS\s+)?([a-z][a-z0-9_]*)/gi)) {
    const alias = m[1].toLowerCase();
    if (alias !== "on" && alias !== "where") aliases.add(alias);
  }
  if (aliases.size === 0) continue;

  for (const { column, real } of BANNED) {
    for (const alias of aliases) {
      const re = new RegExp(`\\b${alias}\\.${column}\\b`, "g");
      for (const hit of src.matchAll(re)) {
        const line = src.slice(0, hit.index).split("\n").length;
        failures.push(
          `${relative(repoRoot, file)}:${line}: selects \`${alias}.${column}\` — mdata.drivers has no such column (use ${real}). This is a 42703 at runtime, not a lint nit.`
        );
      }
    }
  }
}

if (failures.length > 0) {
  console.error("FAIL verify-driver-column-names-real");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("PASS verify-driver-column-names-real — no backend SQL selects a nonexistent mdata.drivers column");
