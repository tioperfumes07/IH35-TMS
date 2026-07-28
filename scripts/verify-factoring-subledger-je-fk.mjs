#!/usr/bin/env node
// verify-factoring-subledger-je-fk (FACT-02, guard 1655) — static guard for held migration
// 202610010000_fact_02_subledger_je_fk.sql: both factoring subledger tables must gain JE FKs
// (single-column RESTRICT + same-entity composite) and the migration must remain HOLD-registered.
// Self-test: --selftest
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202610010000_fact_02_subledger_je_fk.sql";
const HELD_REG = "db/migrations/.held-migrations.json";
const MIG_BASENAME = path.basename(MIG);

const REQ = [
  [
    /factoring_reserve_movements[\s\S]*?factoring_reserve_movements_journal_entry_id_fkey[\s\S]*?REFERENCES\s+accounting\.journal_entries\s*\(\s*id\s*\)[\s\S]*?ON DELETE RESTRICT/i,
    "factoring_reserve_movements.journal_entry_id -> accounting.journal_entries(id) ON DELETE RESTRICT",
  ],
  [
    /factoring_reserve_movements[\s\S]*?factoring_reserve_movements_je_same_entity_fkey[\s\S]*?FOREIGN KEY\s*\(\s*operating_company_id\s*,\s*journal_entry_id\s*\)[\s\S]*?REFERENCES\s+accounting\.journal_entries\s*\(\s*operating_company_id\s*,\s*id\s*\)/i,
    "factoring_reserve_movements same-entity composite JE FK",
  ],
  [
    /factoring_default_interest_accruals[\s\S]*?factoring_default_interest_accruals_journal_entry_id_fkey[\s\S]*?REFERENCES\s+accounting\.journal_entries\s*\(\s*id\s*\)[\s\S]*?ON DELETE RESTRICT/i,
    "factoring_default_interest_accruals.journal_entry_id -> accounting.journal_entries(id) ON DELETE RESTRICT",
  ],
  [
    /factoring_default_interest_accruals[\s\S]*?factoring_default_interest_accruals_je_same_entity_fkey[\s\S]*?FOREIGN KEY\s*\(\s*operating_company_id\s*,\s*journal_entry_id\s*\)[\s\S]*?REFERENCES\s+accounting\.journal_entries\s*\(\s*operating_company_id\s*,\s*id\s*\)/i,
    "factoring_default_interest_accruals same-entity composite JE FK",
  ],
  [/DO NOT RUN ON PROD/i, "HOLD marker DO NOT RUN ON PROD"],
  [/FACT-02 ABORT/i, "fail-closed dangling / cross-entity checks"],
];

export function check(sql, heldJson) {
  const f = [];
  for (const [re, label] of REQ) {
    if (!re.test(sql)) f.push(`missing in migration SQL: ${label}`);
  }
  let reg;
  try {
    reg = JSON.parse(heldJson);
  } catch {
    f.push(`${HELD_REG} invalid JSON`);
    return f;
  }
  const held = (reg.held || []).some((h) => h.file === MIG_BASENAME);
  if (!held) f.push(`${MIG_BASENAME} not listed in ${HELD_REG} held[]`);
  return f;
}

export function run() {
  let sql = "";
  try {
    sql = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  } catch {
    return [`${MIG} not found`];
  }
  let heldJson = "";
  try {
    heldJson = fs.readFileSync(path.join(ROOT, HELD_REG), "utf8");
  } catch {
    return [`${HELD_REG} not found`];
  }
  return check(sql, heldJson);
}

if (process.argv.includes("--selftest")) {
  const good = fs.existsSync(path.join(ROOT, MIG))
    ? fs.readFileSync(path.join(ROOT, MIG), "utf8")
    : "";
  const held = fs.existsSync(path.join(ROOT, HELD_REG))
    ? fs.readFileSync(path.join(ROOT, HELD_REG), "utf8")
    : '{"held":[{"file":"202610010000_fact_02_subledger_je_fk.sql"}]}';
  const checks = [
    ["real migration passes", good.length > 0 && check(good, held).length === 0],
    ["empty sql fails", check("", held).length >= 4],
    ["unregistered held fails", good.length > 0 && check(good, '{"held":[]}').some((x) => /not listed/.test(x))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:factoring-subledger-je-fk --selftest FAIL");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:factoring-subledger-je-fk --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const f = run();
  if (f.length) {
    console.error("verify:factoring-subledger-je-fk FAIL:");
    for (const x of f) console.error("  ✗ " + x);
    process.exit(1);
  }
  console.log("verify:factoring-subledger-je-fk PASS (FACT-02 subledger JE FKs + held registry)");
}
