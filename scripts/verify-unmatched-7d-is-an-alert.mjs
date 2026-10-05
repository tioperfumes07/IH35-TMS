#!/usr/bin/env node
/**
 * ENG-7D — owner A1: Alert after 7 days unmatched (single threshold, not 30/90).
 * A number nobody is paged about is not an alert.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-unmatched-7d-is-an-alert";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  helper: "apps/backend/src/banking/unmatched-7d-alert.ts",
  engine: "apps/backend/src/safety/integrity-alert-engine.service.ts",
  cron: "apps/backend/src/safety/integrity-alert-engine.cron.ts",
  stats: "apps/backend/src/banking/categorization-rules.routes.ts",
  notify: "apps/backend/src/notifications/dispatcher.ts",
  strip: "apps/frontend/src/pages/banking/components/BankingHomeAttentionStrip.tsx",
  rules: "apps/frontend/src/pages/banking/CategorizationRulesPage.tsx",
};

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function fail(errors) {
  console.error(`${LABEL} FAILED:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

function assertNeedles(src, rel, needles) {
  const errors = [];
  for (const n of needles) {
    if (!src.includes(n)) errors.push(`${rel} missing ${JSON.stringify(n)}`);
  }
  return errors;
}

function liveCheck() {
  const errors = [];
  const helper = read(FILES.helper);
  const engine = read(FILES.engine);
  const stats = read(FILES.stats);
  const notify = read(FILES.notify);
  const strip = read(FILES.strip);
  const rules = read(FILES.rules);

  errors.push(
    ...assertNeedles(helper, FILES.helper, [
      "BANK_UNMATCHED_7D_RULE_CODE",
      "UNMATCHED_7D_THRESHOLD_DAYS = 7",
      "ensureBankUnmatched7dRule",
      "ON CONFLICT (operating_company_id, rule_code) DO NOTHING",
      "accounting_integrity",
      '"stale_days": 7',
      "transaction_date",
      "bankLineIsUnmatchedSql",
      "resolveBankUnmatched7dEvents",
    ])
  );
  const pointer = read("apps/backend/src/banking/bank-line-match-pointer.ts");
  errors.push(
    ...assertNeedles(pointer, "apps/backend/src/banking/bank-line-match-pointer.ts", [
      "matched_bill_id",
      "matched_expense_id",
      "matched_invoice_id",
      "matched_settlement_id",
      "matched_deposit_id",
    ])
  );

  if (helper.includes("coa_account_id")) {
    errors.push(`${FILES.helper} must not key unmatched off coa_account_id (CATEGORIZE ≠ MATCH)`);
  }
  if (/created_at\s*>=/.test(helper)) {
    errors.push(`${FILES.helper} must not use created_at >= last-7-days (A1 is AGE, not recency)`);
  }
  if (/\b30\b|\b90\b/.test(helper)) {
    errors.push(`${FILES.helper} must keep the single 7-day threshold (no 30/90)`);
  }

  errors.push(
    ...assertNeedles(engine, FILES.engine, [
      "BANK_UNMATCHED_7D_RULE_CODE",
      "ensureBankUnmatched7dRule",
      "notifyOwnersBankUnmatched7d",
      "loadAgedUnmatchedDigest",
      "resolveBankUnmatched7dEvents",
    ])
  );

  // Standing order point 9 — single-fire. ENG-7D's watchdog is this cron; without a lease
  // both Render instances upsert the same digest and notify Owners twice every 6h.
  const cron = read(FILES.cron);
  errors.push(
    ...assertNeedles(cron, FILES.cron, [
      "JOB_LEASE_SECONDS",
      "leaseSeconds: JOB_LEASE_SECONDS",
      "wrapBackgroundJobTick",
      "safety.integrity_alert_engine_cron",
    ])
  );
  // Unleased call ends at app.log) — leased call has app.log, { leaseSeconds: … }.
  if (/wrapBackgroundJobTick\([\s\S]*?app\.log\s*\)/.test(cron) && !/leaseSeconds:\s*JOB_LEASE_SECONDS/.test(cron)) {
    errors.push(`${FILES.cron} wrapBackgroundJobTick must pass { leaseSeconds } (both instances would fire)`);
  }

  errors.push(
    ...assertNeedles(stats, FILES.stats, [
      "unmatched_7d_alert_open",
      "unmatched_7d_alert_id",
      "loadAgedUnmatchedDigest",
      "threshold_days",
    ])
  );
  if (stats.includes("created_at >= (now() - interval '7 day')") && stats.includes("coa_account_id IS NULL")) {
    errors.push(`${FILES.stats} still counts last-7-days uncategorized as unmatched_7d`);
  }

  errors.push(
    ...assertNeedles(notify, FILES.notify, [
      "notifyOwnersBankUnmatched7d",
      "banking.transaction.flagged",
    ])
  );

  errors.push(
    ...assertNeedles(strip, FILES.strip, [
      "unmatched-7d-alert",
      "unmatchedAged7d",
      "ALERT",
    ])
  );
  errors.push(
    ...assertNeedles(rules, FILES.rules, [
      "unmatched-7d-alert",
      "getCategorizationRulesStats",
    ])
  );

  if (errors.length) fail(errors);
  console.log(`${LABEL}: OK — 7-day unmatched is an alert (integrity + page + Home/Rules), not a recency counter`);
}

function selftest() {
  const helper = read(FILES.helper);
  const planted = helper.replace("UNMATCHED_7D_THRESHOLD_DAYS = 7", "UNMATCHED_7D_THRESHOLD_DAYS = 30");
  if (planted.includes("UNMATCHED_7D_THRESHOLD_DAYS = 7")) {
    console.error(`${LABEL} --selftest: plant did not change source`);
    process.exit(1);
  }
  const caught = planted.includes("UNMATCHED_7D_THRESHOLD_DAYS = 30");
  if (!caught) {
    console.error(`${LABEL} --selftest FAILED: mutation not visible`);
    process.exit(1);
  }

  // Lease plant: strip the option argument. Option must vanish; wrap must remain.
  // Comments may still say "leaseSeconds" — assert the code option only.
  const cron = read(FILES.cron);
  if (!/leaseSeconds:\s*JOB_LEASE_SECONDS/.test(cron)) {
    console.error(`${LABEL} --selftest: cron fixture missing leaseSeconds (tree not green)`);
    process.exit(1);
  }
  const unleased = cron.replace(/,\s*\{\s*leaseSeconds:\s*JOB_LEASE_SECONDS\s*\}/, "");
  if (/leaseSeconds:\s*JOB_LEASE_SECONDS/.test(unleased)) {
    console.error(`${LABEL} --selftest: lease plant did not remove leaseSeconds option`);
    process.exit(1);
  }
  if (!/wrapBackgroundJobTick/.test(unleased)) {
    console.error(`${LABEL} --selftest: lease plant removed wrapBackgroundJobTick`);
    process.exit(1);
  }
  if (!/wrapBackgroundJobTick\([\s\S]*?app\.log\s*\)/.test(unleased)) {
    console.error(`${LABEL} --selftest: unleased wrap must end at app.log) so liveCheck can catch it`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: OK (threshold plant + lease plant visible)`);
}

const arg = process.argv[2] ?? "";
if (arg === "--selftest") selftest();
else liveCheck();
