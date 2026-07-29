#!/usr/bin/env node
/**
 * LST-MAINT-01 — RLS-safe reseed of empty maintenance factory catalogs.
 * Asserts migration uses ih35_app + opco GUC and replays 0066 codes (not invented taxonomy).
 * Scoreboard stays FAIL until Neon density > 0 after owner/agent apply.
 * Cursor even claim: 1778.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-maint01-reseed-rls-safe";
const MIG = "db/migrations/202610211200_lst_maint_01_reseed_empty_maintenance_catalogs.sql";
const LISTS = "docs/module-completion/lists.json";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function collectProblems() {
  const problems = [];
  const mig = read(MIG);
  const listsRaw = read(LISTS);
  if (!mig) problems.push(`missing ${MIG}`);
  else {
    if (!/SET LOCAL ROLE ih35_app/.test(mig)) problems.push("migration must SET LOCAL ROLE ih35_app");
    if (!/RESET ROLE/.test(mig)) problems.push("migration must RESET ROLE before DO ends (CI ledger write)");
    if (!/app\.operating_company_id/.test(mig)) problems.push("migration must set app.operating_company_id");
    if (!/app\.bypass_rls/.test(mig)) problems.push("migration must set app.bypass_rls");
    if (!/work_order_statuses/.test(mig) || !/maintenance_priority_levels/.test(mig)) {
      problems.push("migration must seed work_order_statuses + maintenance_priority_levels");
    }
    if (!/ON CONFLICT \(operating_company_id, code\) DO NOTHING/.test(mig)) {
      problems.push("migration must be idempotent ON CONFLICT DO NOTHING");
    }
    // Must not invent a new status vocabulary vs 0066
    for (const code of ["OPEN", "IN-PROGRESS", "COMPLETE", "P1-CRITICAL", "PM-A-CHECKLIST"]) {
      if (!mig.includes(code)) problems.push(`migration missing 0066 code ${code}`);
    }
  }

  if (listsRaw) {
    try {
      const lists = JSON.parse(listsRaw);
      const item = lists.items?.find((i) => i.id === "LST-MAINT-01");
      if (!item) problems.push("LST-MAINT-01 missing");
      else if (item.status === "PASS") {
        if (!/1778|Neon|wo_st|work_order_statuses/i.test(String(item.evidence ?? ""))) {
          problems.push("LST-MAINT-01 PASS requires Neon density evidence + guard 1778");
        }
      } else if (item.status !== "FAIL" && item.status !== "UNVERIFIED") {
        problems.push(`LST-MAINT-01 unexpected status ${item.status}`);
      } else if (!/1778|202610211200|FORCE RLS|reseed/i.test(String(item.evidence ?? ""))) {
        problems.push("LST-MAINT-01 evidence must cite reseed migration 202610211200 / guard 1778");
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
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — RLS-safe 0066 reseed migration present`);
}
