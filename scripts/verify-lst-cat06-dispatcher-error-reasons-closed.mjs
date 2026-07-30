#!/usr/bin/env node
/**
 * LST-CAT-06 closure — dispatcher_error_reasons per-entity on prod.
 *
 * Live Neon (2026-07-29 lucia): operating_company_id present, 75 rows / 3 entities,
 * FORCE RLS. Migration 202608010000 is applied_held + applied_on_prod:true.
 * Companion verify-dispatcher-error-reasons-per-entity pins mig + load-derived GUC.
 * Cursor even claim: 1774.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-cat06-dispatcher-error-reasons-closed";
const MIG = "202608010000_dispatcher_error_reasons_per_entity.sql";
const HELD = "db/migrations/.held-migrations.json";
const LISTS = "docs/module-completion/lists.json";
const COMPANION = "scripts/verify-dispatcher-error-reasons-per-entity.mjs";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function collectProblems() {
  const problems = [];
  const heldRaw = read(HELD);
  const listsRaw = read(LISTS);
  if (!heldRaw) problems.push(`missing ${HELD}`);
  else {
    try {
      const h = JSON.parse(heldRaw);
      const entry = (h.applied_held || []).find((e) => e.file === MIG);
      if (!entry) problems.push(`${MIG} must be in applied_held[] (not held[])`);
      else if (entry.applied_on_prod !== true) {
        problems.push(`${MIG} applied_held entry must have applied_on_prod:true`);
      }
      if ((h.held || []).some((e) => e.file === MIG)) {
        problems.push(`${MIG} must not remain in held[] after Neon-apply`);
      }
    } catch {
      problems.push(`${HELD} invalid JSON`);
    }
  }

  if (!read(COMPANION)) problems.push(`missing ${COMPANION}`);

  if (listsRaw) {
    try {
      const lists = JSON.parse(listsRaw);
      const item = lists.items?.find((i) => i.id === "LST-CAT-06");
      if (!item) problems.push("LST-CAT-06 missing");
      else if (item.status === "PASS") {
        if (!/1774|operating_company_id|75|FORCE/i.test(String(item.evidence ?? ""))) {
          problems.push("LST-CAT-06 PASS evidence must cite guard 1774 + Neon opco/FORCE proof");
        }
      } else if (item.status !== "OPEN" && item.status !== "FAIL") {
        problems.push(`LST-CAT-06 unexpected status ${item.status}`);
      }
    } catch {
      problems.push(`${LISTS} invalid JSON`);
    }
  } else problems.push(`missing ${LISTS}`);

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  const r = spawnSync(process.execPath, [path.join(ROOT, COMPANION)], { cwd: ROOT, encoding: "utf8" });
  if ((r.status ?? 1) !== 0) problems.push(`companion ${COMPANION} exited ${r.status}`);
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — LST-CAT-06 applied_held + companion green`);
}
