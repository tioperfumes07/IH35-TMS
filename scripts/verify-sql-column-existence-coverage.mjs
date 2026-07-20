#!/usr/bin/env node
/**
 * verify-sql-column-existence-coverage — systemic-pattern-column-drift-guard
 *
 * Ensures TARGET_TABLES in verify-sql-column-existence.mjs does not shrink
 * below the locked minimum (coverage ratchet; extend-only).
 *
 * Usage:
 *   node scripts/verify-sql-column-existence-coverage.mjs
 *   node scripts/verify-sql-column-existence-coverage.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-sql-column-existence-coverage";
const TARGET = "scripts/verify-sql-column-existence.mjs";
/** Locked 2026-07-20 after expanding beyond the original 16 curated tables. Ratchet only upward. */
const MIN_TARGET_TABLES = 29;

function countTables(src) {
  const m = src.match(/const TARGET_TABLES = new Set\(\[([\s\S]*?)\]\);/);
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function check(src) {
  const errors = [];
  const tables = countTables(src);
  if (!tables) {
    errors.push(`${TARGET}: TARGET_TABLES Set not found`);
    return errors;
  }
  if (tables.length < MIN_TARGET_TABLES) {
    errors.push(
      `${TARGET}: TARGET_TABLES coverage shrank (${tables.length} < min ${MIN_TARGET_TABLES}). Ratchet only upward.`
    );
  }
  const required = [
    "maintenance.work_orders",
    "dispatch.equipment_transfer_requests",
    "accounting.journal_entries",
    "fuel.fuel_transactions",
    "safety.incidents",
    "identity.users",
  ];
  for (const t of required) {
    if (!tables.includes(t)) errors.push(`${TARGET}: missing required coverage table ${t}`);
  }
  if (!/MIN_TARGET_TABLES\s*=\s*29/.test(src)) {
    errors.push(`${TARGET}: must enforce MIN_TARGET_TABLES = 29 (or higher) inside runGuard`);
  }
  return errors;
}

function selftest() {
  const good = `const TARGET_TABLES = new Set([
  "mdata.vendors",
  "maintenance.work_orders",
  "dispatch.equipment_transfer_requests",
  "accounting.journal_entries",
  "fuel.fuel_transactions",
  "safety.incidents",
  "identity.users",
${Array.from({ length: 22 }, (_, i) => `  "t.${i}",`).join("\n")}
]);
const MIN_TARGET_TABLES = 29;
`;
  const bad = `const TARGET_TABLES = new Set(["mdata.vendors"]);\n`;
  const g = check(good);
  const b = check(bad);
  if (g.length) {
    console.error(`${LABEL} SELFTEST FAIL: good rejected`, g);
    process.exit(1);
  }
  if (!b.length) {
    console.error(`${LABEL} SELFTEST FAIL: bad must fail`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const abs = path.join(ROOT, TARGET);
  const errors = check(fs.readFileSync(abs, "utf8"));
  if (errors.length) {
    console.error(`${LABEL} FAIL:`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — TARGET_TABLES coverage ≥ ${MIN_TARGET_TABLES}`);
}

main();
