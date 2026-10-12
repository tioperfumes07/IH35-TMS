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
  pointer: "apps/backend/src/banking/bank-line-match-pointer.ts",
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

/** Every check, over in-memory sources keyed like FILES — so --selftest can plant regressions. */
export function findErrors(src) {
  const errors = [];
  const helper = src.helper;
  const engine = src.engine;
  const stats = src.stats;
  const notify = src.notify;
  const strip = src.strip;
  const rules = src.rules;

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
  const pointer = src.pointer;
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
  const cron = src.cron;
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

  return errors;
}

function readAll() {
  return Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
}

function liveCheck() {
  const errors = findErrors(readAll());
  if (errors.length) fail(errors);
  console.log(`${LABEL}: OK — 7-day unmatched is an alert (integrity + page + Home/Rules), not a recency counter`);
}

function selftest() {
  const sources = readAll();
  const planted = [
    ["threshold raised to 30 days", { helper: sources.helper.replace("UNMATCHED_7D_THRESHOLD_DAYS = 7", "UNMATCHED_7D_THRESHOLD_DAYS = 30") }],
    ["unmatched keyed off coa_account_id (categorize != match)", { helper: sources.helper + "\nconst q = `WHERE bt.coa_account_id IS NULL`;\n" }],
    ["age replaced by created_at recency", { helper: sources.helper + "\nconst q = `AND bt.created_at >= now() - interval '7 day'`;\n" }],
    ["cron lease option stripped (both instances fire)", { cron: sources.cron.replace(/,\s*\{\s*leaseSeconds:\s*JOB_LEASE_SECONDS\s*\}/, "") }],
    ["owners never paged", { engine: sources.engine.replaceAll("notifyOwnersBankUnmatched7d", "logBankUnmatched7d") }],
    ["stats back to last-7-days uncategorized", { stats: sources.stats + "\n// created_at >= (now() - interval '7 day') AND coa_account_id IS NULL\n" }],
    ["Home strip drops the alert", { strip: sources.strip.replaceAll("unmatched-7d-alert", "unmatched-7d-count") }],
    ["pointer list loses matched_invoice_id", { pointer: sources.pointer.replaceAll("matched_invoice_id", "matched_other_id") }],
  ];
  let caught = 0;
  for (const [name, patch] of planted) {
    if (findErrors({ ...sources, ...patch }).length > 0) caught += 1;
    else console.error(`${LABEL} SELFTEST: planted violation escaped — ${name}`);
  }
  const clean = findErrors(sources);
  if (clean.length) console.error(`${LABEL} SELFTEST: clean sources flagged — ${clean.join("; ")}`);
  console.log(`${LABEL} SELFTEST: ${caught}/${planted.length} planted violations caught`);
  process.exit(caught === planted.length && clean.length === 0 ? 0 : 1);
}

if (process.argv.includes("--selftest")) selftest();
else liveCheck();
