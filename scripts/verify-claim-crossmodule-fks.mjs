#!/usr/bin/env node
// verify-claim-crossmodule-fks (11-insurance G11-1, linkage half) — asserts migration 202607410000 adds
// the forward cross-module linkage columns+FKs FROM insurance.claim to CANONICAL hubs (accident/load/driver,
// Total Connectivity §10a). Also forbids pointing any of them at a RETIRE loads table (dispatch.loads).
// Self-test: --selftest.
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202607410000_claim_crossmodule_fks.sql";
const REQ = [
  [/insurance\.claim[\s\S]*?accident_report_id\s+uuid\s+REFERENCES\s+safety\.accident_reports/i, "insurance.claim.accident_report_id -> safety.accident_reports"],
  [/load_id\s+uuid\s+REFERENCES\s+mdata\.loads/i, "insurance.claim.load_id -> mdata.loads (canonical hub)"],
  [/driver_id\s+uuid\s+REFERENCES\s+mdata\.drivers/i, "insurance.claim.driver_id -> mdata.drivers (canonical hub)"],
];
export function check(sql) {
  const f = [];
  for (const [re, name] of REQ) if (!re.test(sql)) f.push(`missing: ${name}`);
  if (/REFERENCES\s+dispatch\.loads\b/i.test(sql)) f.push("RETIRE target: FK points at dispatch.loads (use mdata.loads)");
  return f;
}
export function run() { try { return check(fs.readFileSync(path.join(ROOT, MIG), "utf8")); } catch { return [`${MIG} not found`]; } }
if (process.argv.includes("--selftest")) {
  const good = fs.existsSync(path.join(ROOT, MIG)) ? fs.readFileSync(path.join(ROOT, MIG), "utf8") : "";
  const checks = [
    ["real migration has all 3 canonical forward FKs", check(good).length === 0],
    ["missing FK caught", check("nothing").length === 3],
    ["RETIRE dispatch.loads target caught", check("load_id uuid REFERENCES dispatch.loads").some((x) => /RETIRE/.test(x))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("FAIL"); for (const [n] of failed) console.error("  ✗ " + n); process.exit(1); }
  console.log(`verify:claim-crossmodule-fks --selftest PASS (${checks.length} checks)`); process.exit(0);
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) { const f = run(); if (f.length) { console.error("verify:claim-crossmodule-fks FAIL:"); for (const x of f) console.error("  ✗ " + x); process.exit(1); } console.log("verify:claim-crossmodule-fks PASS (3 canonical forward cross-module FKs present)"); }
