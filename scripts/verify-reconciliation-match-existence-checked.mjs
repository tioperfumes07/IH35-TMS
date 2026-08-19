#!/usr/bin/env node
/**
 * ACCT-F5574 regression guard — POST /api/v1/banking/reconciliation/:sessionId/match must verify
 * matched_event_id exists and belongs to the caller's company BEFORE writing it onto a real bank
 * transaction row.
 *
 * The same class of bug as ACCT-F5573 (obligation-reconcile.routes.ts), a second route in a
 * sibling banking-reconciliation module: matched_event_id was trusted outright and written straight
 * onto matched_load_id/matched_bill_id/matched_settlement_id with no existence or company-ownership
 * check, silently marking a REAL bank transaction "matched" against a bogus/foreign id.
 *
 * Fix: MATCHED_EVENT_EXISTENCE_SQL, a company-scoped existence query per matched_event_type,
 * checked inside the same withCompanyScope transaction before the UPDATE, returning
 * "event_not_found" -> 404 on a miss (with an explicit reply branch, not folded into the generic
 * falsy `!updated` check, which would silently treat a non-empty string as truthy).
 *
 * This static check (no DB connection) asserts:
 *   1. MATCHED_EVENT_EXISTENCE_SQL covers all 3 matched_event_type values (load, bill, settlement)
 *      with a company-scoped existence query each.
 *   2. The match handler actually queries MATCHED_EVENT_EXISTENCE_SQL and returns
 *      "event_not_found" on a miss, before the UPDATE that writes matched_*.
 *   3. The reply mapping explicitly branches on "event_not_found" before the generic `!updated`
 *      falsy check.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:reconciliation-match-existence-checked";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/banking/reconciliation.routes.ts";

const EVENT_TYPES = ["load", "bill", "settlement"];

function assertAll(src) {
  const problems = [];

  for (const t of EVENT_TYPES) {
    const re = new RegExp(`${t}:\\s*\`SELECT 1 FROM [\\w.]+ WHERE id = \\$1::uuid AND operating_company_id = \\$2::uuid`);
    if (!re.test(src)) {
      problems.push(`MATCHED_EVENT_EXISTENCE_SQL missing a company-scoped existence query for "${t}"`);
    }
  }

  if (!/const eventExists = await client\.query\(\s*MATCHED_EVENT_EXISTENCE_SQL\[body\.data\.matched_event_type\],\s*\[body\.data\.matched_event_id, query\.data\.operating_company_id\]\s*\);/.test(src)) {
    problems.push(`POST /:sessionId/match no longer queries MATCHED_EVENT_EXISTENCE_SQL before writing matched_* columns`);
  }
  if (!/if \(!eventExists\.rows\[0\]\) return "event_not_found" as const;/.test(src)) {
    problems.push(`POST /:sessionId/match no longer returns "event_not_found" on a missing matched event`);
  }
  if (!/if \(updated === "event_not_found"\) return reply\.code\(404\)\.send\(\{ error: "matched_event_not_found" \}\);/.test(src)) {
    problems.push(`POST /:sessionId/match reply mapping no longer branches explicitly on "event_not_found" (would silently fall through !updated as truthy)`);
  }

  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  // Plant defect 1: drop the explicit event_not_found reply branch (the truthiness trap).
  const planted1 = src.replace(
    /if \(updated === "event_not_found"\) return reply\.code\(404\)\.send\(\{ error: "matched_event_not_found" \}\);\n\s*/,
    "",
  );
  if (planted1 === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: mutation 1 target not found (guard text drifted from real code)`);
    process.exit(1);
  }
  if (!assertAll(planted1).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect 1 (missing event_not_found reply branch) not caught`);
    process.exit(1);
  }

  // Plant defect 2: drop the existence check call itself (regress to trusting the caller).
  const planted2 = src.replace(
    /const eventExists = await client\.query\(\s*MATCHED_EVENT_EXISTENCE_SQL\[body\.data\.matched_event_type\],\s*\[body\.data\.matched_event_id, query\.data\.operating_company_id\]\s*\);\s*\n\s*if \(!eventExists\.rows\[0\]\) return "event_not_found" as const;\s*\n\n/,
    "",
  );
  if (planted2 === src) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: mutation 2 target not found (guard text drifted from real code)`);
    process.exit(1);
  }
  if (!assertAll(planted2).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect 2 (missing existence-check call) not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
