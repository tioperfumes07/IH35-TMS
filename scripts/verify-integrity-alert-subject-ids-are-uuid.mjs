#!/usr/bin/env node
/**
 * SAF-F70 — safety.integrity_alerts subject FKs are UUID columns; never bind a foreign system's id
 * into one.
 *
 * WHY THIS EXISTS (prod br-fancy-credit-akjnd07a, 2026-08-01):
 * The bills probe selected accounting.bills.vendor_id — TEXT, holding the QBO vendor id — and mapped
 * it straight into subject_vendor_id, which is UUID. Postgres rejected it with
 *   invalid input syntax for type uuid: "2"
 * and "2" is a real value: 16,245 of 16,246 bills carry a numeric QBO vendor_id, including literally
 * "2". _system.background_jobs shows safety.integrity_alert_engine_cron last succeeded 2026-07-15 and
 * has failed on every run since — one probe's type error takes down the WHOLE engine tick, so every
 * other integrity rule stopped firing too.
 *
 * WHY THE OBVIOUS FIX IS WRONG: accounting.bills.mdata_vendor_id IS a uuid column, so swapping to it
 * looks correct — but it is NULL on all 16,246 rows. That swap would silently produce a null vendor
 * on every alert and LOOK fixed. The QBO id must be RESOLVED through the vendor master
 * (mdata.vendors.qbo_vendor_id -> mdata.vendors.id); on a 50-row live sample 48 resolve.
 *
 * WHAT THIS GUARD PROTECTS: that no raw text id is bound to a uuid subject column. The engine has
 * several probes and more will be added; each one maps a row into the same three uuid FKs, and the
 * next author has the same trap available.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SVC = "apps/backend/src/safety/integrity-alert-engine.service.ts";
const LABEL = "verify-integrity-alert-subject-ids-are-uuid";

/** Columns known to be TEXT on prod that must never reach a uuid subject FK. */
const TEXT_ID_COLUMNS = ["vendor_id", "vendor_uuid", "customer_id", "qbo_id", "qbo_vendor_id"];

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/--[^\n]*/g, "");
}

export function auditSubjectMappings(src) {
  const code = stripComments(src);
  const problems = [];
  for (const m of code.matchAll(/subject_(driver|unit|vendor)_id\s*:\s*([^,\n]+)/g)) {
    const expr = m[2];
    if (/^\s*null\s*$/.test(expr)) continue;
    for (const col of TEXT_ID_COLUMNS) {
      // row.vendor_id -> the raw foreign id. row.vendor_uuid is the RESOLVED alias and is fine.
      if (new RegExp(`row\\.${col}\\b`).test(expr) && !/_uuid\b/.test(expr.replace(new RegExp(`row\\.${col}\\b`), ""))) {
        problems.push(
          `${SVC}: subject_${m[1]}_id is bound from row.${col}, a TEXT column holding a foreign-system ` +
            `id. The subject FK is UUID — this throws "invalid input syntax for type uuid" and takes ` +
            `down the ENTIRE engine tick, not just this probe. Resolve it to the canonical uuid first.`
        );
      }
    }
  }
  return problems;
}

function auditTree() {
  return auditSubjectMappings(readFileSync(join(ROOT, SVC), "utf8"));
}

function selftest() {
  const failures = [];
  if (auditSubjectMappings("subject_vendor_id: row.vendor_id ? String(row.vendor_id) : null,").length === 0)
    failures.push("case1 FAIL — binding a raw text vendor_id was NOT caught");
  if (auditSubjectMappings("subject_vendor_id: row.vendor_uuid ? String(row.vendor_uuid) : null,").length !== 0)
    failures.push("case2 FAIL — the resolved vendor_uuid alias was flagged");
  if (auditSubjectMappings("subject_driver_id: null,").length !== 0) failures.push("case3 FAIL — an explicit null was flagged");
  if (auditSubjectMappings("subject_unit_id: row.unit_id ? String(row.unit_id) : null,").length !== 0)
    failures.push("case4 FAIL — a genuine uuid column (unit_id) was flagged");
  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case5 FAIL — real source flagged: ${tree.join(" | ")}`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — raw text id caught, resolved alias clean, null clean, real uuid column clean`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — every integrity-alert subject FK is bound from a resolved uuid, never a foreign text id`);
}

main();
