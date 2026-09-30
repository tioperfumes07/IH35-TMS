#!/usr/bin/env node
/**
 * ROUND 293 — mdata.loads has exactly ONE unit column and it is `assigned_unit_id`.
 * There is no `mdata.loads.unit_id` (verified live 2026-09-30 against production
 * branch br-fancy-credit-akjnd07a: information_schema returns assigned_unit_id only).
 *
 * ROOT CAUSE this guard exists for: the ROUND 285.4.9 downtime-ledger block in
 * company-settlement-report.service.ts wrote `SELECT DISTINCT unit_id FROM mdata.loads`.
 * Postgres raised 42703 "column \"unit_id\" does not exist", buildCompanySettlementReport
 * threw, and because listCompanySettlements builds a report per row, the ENTIRE Company
 * Settlements register 500'd — "Failed to load company settlements." on every load.
 *
 * RULE (zero false positives by construction): inside any backend SQL template literal
 * whose ONLY table reference is mdata.loads, a bare (unqualified, not `assigned_`)
 * `unit_id` token can only mean the column that does not exist. Blocks that join or CTE
 * other tables are out of scope here — those `unit_id`s resolve to another relation.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-loads-unit-column-is-assigned-unit-id";

export function offendingBlocks(source) {
  const out = [];
  for (const m of source.matchAll(/`([^`]*\bmdata\.loads\b[^`]*)`/gs)) {
    const block = m[1];
    // Only real SQL literals — not prose or JSDoc that happens to name the table.
    if (!/^\s*(SELECT|WITH|INSERT|UPDATE|DELETE)\b/i.test(block)) continue;
    const tables = new Set(
      [...block.matchAll(/\b(?:FROM|JOIN)\s+([a-z_]+\.[a-z_]+)/gi)].map((t) => t[1].toLowerCase())
    );
    if (tables.size !== 1 || !tables.has("mdata.loads")) continue;
    // A WITH ... AS ( ... ) CTE inside the same literal introduces other relations by name.
    if (/\bWITH\b/i.test(block)) continue;
    // `... AS unit_id` is an OUTPUT alias, never a column read — strip aliases before testing.
    const reads = block.replace(/\bAS\s+[a-z_][a-z0-9_]*/gi, "");
    if (/(?<![._A-Za-z])unit_id\b/.test(reads)) out.push(block.trim());
  }
  return out;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, acc);
    else if (abs.endsWith(".ts")) acc.push(abs);
  }
  return acc;
}

if (process.argv[2] === "--selftest") {
  const cases = [
    ["SELECT DISTINCT unit_id::text FROM mdata.loads WHERE id = ANY($1::uuid[])", 1],
    ["SELECT DISTINCT assigned_unit_id::text AS unit_id FROM mdata.loads WHERE id = ANY($1::uuid[])", 0],
    ["SELECT l.assigned_unit_id AS unit_id FROM mdata.loads l JOIN mdata.units u ON u.id = l.assigned_unit_id", 0],
    ["SELECT ft.unit_id FROM fuel.fuel_transactions ft", 0],
    ["SELECT assigned_unit_id FROM mdata.loads", 0],
    ["SELECT unit_id FROM mdata.loads l LEFT JOIN downtime.events e ON e.unit_id = l.assigned_unit_id", 0],
  ];
  let bad = 0;
  for (const [sql, want] of cases) {
    const got = offendingBlocks("const q = `" + sql + "`;").length;
    if (got !== want) {
      console.error(`${LABEL} SELFTEST FAIL: want ${want} got ${got} for: ${sql}`);
      bad += 1;
    }
  }
  console.log(`${LABEL} selftest ${cases.length - bad}/${cases.length}`);
  process.exit(bad ? 1 : 0);
}

const hits = [];
for (const file of walk(join(ROOT, "apps/backend/src"))) {
  for (const block of offendingBlocks(readFileSync(file, "utf8"))) {
    hits.push(`${file.slice(ROOT.length)}\n${block}`);
  }
}
if (hits.length) {
  console.error(
    `${LABEL} FAIL: ${hits.length} SQL block(s) read a bare unit_id from mdata.loads. ` +
      `That column does not exist — use assigned_unit_id.\n\n${hits.join("\n\n")}`
  );
  process.exit(1);
}
console.log(`${LABEL} OK`);
