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

/**
 * 443.187 (CC-2) — resolve each `<alias>.<column>` to the table its NEAREST binding names, inside its own SQL template,
 * innermost parenthesised scope first (a subquery like `(SELECT d.display_id FROM accounting.deposits d …)` re-binds `d`
 * even when the outer query has `LEFT JOIN mdata.drivers d`). The old file-wide alias set flagged every `d.display_id`
 * in a file that also joins drivers as `d` — 9 false 42703s on deposits (match.service.ts, feed-gate.*). A reference with
 * no binding in its own template keeps the old file-wide rule, so nothing real escapes.
 */
export function bindingTableAt(sql, pos, alias) {
  const pairs = [];
  const stack = [];
  for (let k = 0; k < sql.length; k += 1) {
    if (sql[k] === "(") stack.push(k);
    else if (sql[k] === ")" && stack.length) pairs.push([stack.pop(), k]);
  }
  const enclosing = pairs.filter(([a, b]) => a < pos && pos < b).sort((x, y) => (x[1] - x[0]) - (y[1] - y[0]));
  enclosing.push([-1, sql.length]);
  const bindRe = new RegExp(`\\b(?:FROM|JOIN)\\s+([a-z_][a-z0-9_.]*)\\s+(?:AS\\s+)?${alias}\\b`, "i");
  for (const [a, b] of enclosing) {
    let region = sql.slice(a + 1, b);
    // blank every nested group that does not contain the reference: its bindings belong to another scope
    for (const [x, y] of pairs) {
      if (x > a && y < b && !(x < pos && pos < y)) region = region.slice(0, x - a - 1) + " ".repeat(y - x + 1) + region.slice(y - a);
    }
    const m = region.match(bindRe);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

export function scanFile(rel, raw) {
  const out = [];
  if (!/mdata\.drivers/.test(raw)) return out;
  const src = stripComments(raw);
  // Resolve the aliases bound to mdata.drivers anywhere in this file (FROM/JOIN mdata.drivers <alias>).
  const aliases = new Set();
  for (const m of src.matchAll(/mdata\.drivers\s+(?:AS\s+)?([a-z][a-z0-9_]*)/gi)) {
    const alias = m[1].toLowerCase();
    if (alias !== "on" && alias !== "where") aliases.add(alias);
  }
  if (aliases.size === 0) return out;
  const templates = [...src.matchAll(/`[^`]*`/g)].map((m) => [m.index, m.index + m[0].length]);
  for (const { column, real } of BANNED) {
    for (const alias of aliases) {
      const re = new RegExp(`\\b${alias}\\.${column}\\b`, "g");
      for (const hit of src.matchAll(re)) {
        const t = templates.find(([a, b]) => a <= hit.index && hit.index < b);
        if (t) {
          const table = bindingTableAt(src.slice(t[0], t[1]), hit.index - t[0], alias);
          if (table && table !== "mdata.drivers") continue; // the alias names another table at this reference
        }
        const line = src.slice(0, hit.index).split("\n").length;
        out.push(
          `${rel}:${line}: selects \`${alias}.${column}\` — mdata.drivers has no such column (use ${real}). This is a 42703 at runtime, not a lint nit.`
        );
      }
    }
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const bad = "q(`SELECT d.display_id FROM mdata.drivers d WHERE d.id = $1`)";
  const badCdl = "q(`SELECT d.cdl_expiration_date FROM mdata.drivers d`)";
  const subquery = "q(`SELECT fi.*, (SELECT d.display_id FROM accounting.deposits d WHERE d.id = fi.x) FROM feed fi LEFT JOIN mdata.drivers d ON d.id = fi.driver_id`)";
  const otherQuery = "q(`SELECT d.display_id FROM accounting.deposits d`); q(`SELECT d.first_name FROM mdata.drivers d`)";
  const outerBad = "q(`SELECT d.display_id, (SELECT 1 FROM accounting.deposits d) FROM mdata.drivers d`)";
  const cases = [
    ["a drivers alias selecting display_id is caught", scanFile("x.ts", bad).length === 1],
    ["cdl_expiration_date is caught", scanFile("x.ts", badCdl).length === 1],
    ["a subquery re-binding d to deposits is not a drivers reference", scanFile("x.ts", subquery).length === 0],
    ["another query's d (deposits) is not a drivers reference", scanFile("x.ts", otherQuery).length === 0],
    ["the OUTER drivers d is still caught when a subquery re-binds d", scanFile("x.ts", outerBad).length === 1],
  ];
  const bad2 = cases.filter(([, ok]) => !ok);
  if (bad2.length) { console.error(`SELFTEST FAIL: ${bad2.map(([n]) => n).join("; ")}`); process.exit(1); }
  console.log(`SELFTEST PASS: ${cases.length} cases`);
  process.exit(0);
}

for (const file of walk(ROOT)) {
  failures.push(...scanFile(relative(repoRoot, file), readFileSync(file, "utf8")));
}

if (failures.length > 0) {
  console.error("FAIL verify-driver-column-names-real");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log("PASS verify-driver-column-names-real — no backend SQL selects a nonexistent mdata.drivers column");
