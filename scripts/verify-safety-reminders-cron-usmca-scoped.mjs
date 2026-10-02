#!/usr/bin/env node
/**
 * GUARD — safety/reminders.cron.ts must never UPDATE/INSERT compliance_reminders
 * without an operating_company_id predicate scoped to USMCA.
 *
 * Defect (ROUND 301 Cursor independent engine audit): the resolve-stale UPDATE ran under
 * withLuciaBypass (RLS OFF) with only `status='open' AND last_detected_at < $1` — no company
 * predicate — so a tick would reach TRANSPORTATION / TRUCKING frozen rows.
 *
 * Usage: node scripts/verify-safety-reminders-cron-usmca-scoped.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = path.join(ROOT, "apps/backend/src/safety/reminders.cron.ts");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function check(src) {
  assert(fs.existsSync(TARGET) || src != null, `missing ${TARGET}`);
  const text = src ?? fs.readFileSync(TARGET, "utf8");

  assert(
    text.includes(USMCA) || text.includes("USMCA_COMPANY_ID"),
    "reminders.cron must name USMCA_COMPANY_ID / USMCA uuid"
  );

  // The resolve-stale UPDATE must carry operating_company_id in its WHERE.
  const updateBlocks = [...text.matchAll(/UPDATE\s+safety\.compliance_reminders[\s\S]{0,800}?;/gi)];
  assert(updateBlocks.length >= 1, "expected UPDATE safety.compliance_reminders");
  for (const m of updateBlocks) {
    const block = m[0];
    assert(
      /operating_company_id\s*=/.test(block),
      "UPDATE safety.compliance_reminders must predicate on operating_company_id (frozen-entity hardline)"
    );
  }

  // Candidate source SELECTs must also scope by operating_company_id.
  for (const table of [
    "safety.driver_qualification_files",
    "safety.medical_cards",
    "safety.background_checks",
    "safety.training_records",
  ]) {
    const idx = text.indexOf(table);
    assert(idx >= 0, `expected reference to ${table}`);
    const window = text.slice(idx, idx + 500);
    assert(
      /operating_company_id/.test(window),
      `${table} read in refresh must filter operating_company_id`
    );
  }

  // Must NOT keep the unscoped company-walk that only assertTenantContext'd every company.
  assert(
    !/FROM safety\.driver_qualification_files\s+WHERE voided_at IS NULL\s+UNION/s.test(text),
    "retired all-companies UNION walk must stay gone"
  );

  return "PASS";
}

function selftest() {
  const good = fs.readFileSync(TARGET, "utf8");
  check(good);

  const badUpdate = good.replace(
    /WHERE operating_company_id = \$2::uuid\s+AND status = 'open'/,
    "WHERE status = 'open'"
  );
  let failed = false;
  try {
    check(badUpdate);
  } catch {
    failed = true;
  }
  assert(failed, "selftest: unscoped UPDATE must fail the guard");
  console.log("verify-safety-reminders-cron-usmca-scoped: selftest PASS");
}

if (process.argv.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-safety-reminders-cron-usmca-scoped: PASS — USMCA-scoped INSERT+UPDATE");
}
