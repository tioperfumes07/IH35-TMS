#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL: ENG-60 (2026-11-02) only removed references to the retired insurance.lawsuit surface from this guard; it claims no new scoreboard cell.
// verify-phase4-crossmodule-fks (P4-01/02/03 batch) — asserts migration 202607250000 adds the Phase-4
// cross-module linkage columns+FKs to CANONICAL targets (Total Connectivity §10a). Self-test: --selftest.
// ENG-60 (2026-11-02): the 5th FK (legal.matters.insurance_lawsuit_id -> insurance.lawsuit) was RETIRED by migration
// 202616310100 with the table — a lawsuit IS a legal matter — so it is no longer a required canonical FK.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202607250000_phase4_crossmodule_fks.sql";
const REQ = [
  [/accident_reports[\s\S]*?insurance_claim_id\s+uuid\s+REFERENCES\s+insurance\.claim/i, "safety.accident_reports.insurance_claim_id -> insurance.claim"],
  [/legal\.matters[\s\S]*?insurance_claim_id\s+uuid\s+REFERENCES\s+insurance\.claim/i, "legal.matters.insurance_claim_id -> insurance.claim"],
  [/incident_id\s+uuid\s+REFERENCES\s+safety\.incidents/i, "legal.matters.incident_id -> safety.incidents"],
  [/mdata\.assets[\s\S]*?unit_id\s+uuid\s+REFERENCES\s+mdata\.units/i, "mdata.assets.unit_id -> mdata.units"],
];
export function check(sql) {
  const f = [];
  for (const [re, name] of REQ) if (!re.test(sql)) f.push(`missing: ${name}`);
  if (/REFERENCES\s+mdata\.(assets|qbo_vendors)\b/i.test(sql.replace(/mdata\.assets\b(?=[\s\S]*ADD COLUMN)/,""))) { /* assets is a source table here, ok */ }
  return f;
}
export function run() { try { return check(fs.readFileSync(path.join(ROOT, MIG), "utf8")); } catch { return [`${MIG} not found`]; } }
if (process.argv.includes("--selftest")) {
  const good = fs.existsSync(path.join(ROOT, MIG)) ? fs.readFileSync(path.join(ROOT, MIG), "utf8") : "";
  const checks = [["real migration has all 5 canonical FKs", check(good).length === 0], ["missing FK caught", check("nothing").length === 4]];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("FAIL"); for (const [n] of failed) console.error("  ✗ "+n); process.exit(1); }
  console.log(`verify:phase4-crossmodule-fks --selftest PASS (${checks.length} checks)`); process.exit(0);
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) { const f = run(); if (f.length) { console.error("verify:phase4-crossmodule-fks FAIL:"); for (const x of f) console.error("  ✗ "+x); process.exit(1); } console.log("verify:phase4-crossmodule-fks PASS (4 canonical cross-module FKs present; the lawsuit FK was retired by ENG-60)"); }
