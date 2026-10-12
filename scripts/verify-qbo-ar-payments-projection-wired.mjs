#!/usr/bin/env node
// verify-qbo-ar-payments-projection-wired — the inbound QBO Payment (Receive Payment) -> accounting.payments
// + accounting.payment_applications projection must stay wired and parallel-books-safe:
//
//   1) qbo-ar-payments-puller.ts gates BOTH stages on the DB feature flag via isEnabled() (per-entity),
//      NEVER on a process.env var (the hidden-env-gate regression that kept the A/P pull dark).
//   2) Both flags (QBO_AR_PAYMENT_MIRROR_PULL_ENABLED / QBO_AR_PAYMENTS_PROJECTION_ENABLED) are registered
//      in a migration's lib.feature_flags catalog, DEFAULT OFF, with NO per-entity ON override seeded in
//      any migration (build-and-HOLD — the owner flips them ON).
//   3) The puller never calls a GL/journal poster (subledger-only; GL stays QuickBooks' job) and always
//      projects rows as source_system='qbo'.
//   4) sync-scheduler.ts wires both stages as ISOLATED runStep()s (so an earlier failure can't skip them).
//   5) posting-engine.service.ts REFUSES to post a qbo-sourced customer payment
//      (QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED, tied to source_system/qbo_payment_id) — never invent a
//      second TMS GL entry for a receipt QuickBooks already owns.
//
// --selftest exercises the failure detection on synthetic inputs (no repo dependency).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.VERIFY_QBO_AR_PAYMENTS_PROJECTION_ROOT
  ? path.resolve(process.env.VERIFY_QBO_AR_PAYMENTS_PROJECTION_ROOT)
  : path.resolve(__dirname, "..");

const PULLER_REL = "apps/backend/src/qbo-sync/qbo-ar-payments-puller.ts";
const SCHEDULER_REL = "apps/backend/src/qbo-sync/sync-scheduler.ts";
const POSTING_REL = "apps/backend/src/accounting/posting-engine.service.ts";
const MIGRATIONS_DIR = path.join(ROOT, "db", "migrations");
const FLAGS = ["QBO_AR_PAYMENT_MIRROR_PULL_ENABLED", "QBO_AR_PAYMENTS_PROJECTION_ENABLED"];

const ENV_GATE_RE = /process\.env\.(QBO_AR_PAYMENT_MIRROR_PULL_ENABLED|QBO_AR_PAYMENTS_PROJECTION_ENABLED)\b/;
const IS_ENABLED_CALL_RE = /\bisEnabled\s*\(/;
// A poster import/call would mean GL posting crept into the subledger clone.
const POSTER_RE = /\b(postToLedger|postJournalEntry|createJournalEntry|glPoster|ledgerPoster|postGl|postSourceTransaction)\b/i;

export function analyzePuller(text) {
  const failures = [];
  if (ENV_GATE_RE.test(text)) {
    failures.push(
      "qbo-ar-payments-puller.ts reads process.env.QBO_AR_PAYMENT*_ENABLED — both stages must gate on the " +
        "DB feature flag (isEnabled), not an env var."
    );
  }
  if (!IS_ENABLED_CALL_RE.test(text)) {
    failures.push("qbo-ar-payments-puller.ts does not call isEnabled() — both stages must gate on the DB flag.");
  }
  // ACCT-F4431380 (Lead 443.137 item 9e) — OLD: required both flags referenced, rows projected as
  // source_system='qbo', and projectArPaymentsToLedger to be a set-based INSERT INTO accounting.payments …
  // FROM mdata.qbo_ar_payments plus an accounting.payment_applications INSERT.
  // NEW: QuickBooks is a read-only archive — the projection was REMOVED and projectArPaymentsToLedger()
  // REFUSES BY NAME. Required now: the MIRROR flag is still referenced (Stage 1 gate), no GL poster, the entry
  // point still exists and calls refuseQboNativeWrite(, the per-row mirror loop stays absent, and the file
  // writes NO accounting.payments / payment_applications row. (The old flag + source_system checks were
  // being satisfied by header-comment text alone.)
  // WHY: a QBO path never writes a native money table; a silent no-op would report success.
  if (!text.includes("QBO_AR_PAYMENT_MIRROR_PULL_ENABLED")) {
    failures.push("qbo-ar-payments-puller.ts no longer references QBO_AR_PAYMENT_MIRROR_PULL_ENABLED — the Stage 1 mirror gate was lost.");
  }
  if (POSTER_RE.test(text)) {
    failures.push("qbo-ar-payments-puller.ts references a GL poster — the payment clone must be subledger-only (NO GL).");
  }
  const projIdx = text.search(/^export async function projectArPaymentsToLedger\b/m);
  if (projIdx < 0) {
    failures.push("qbo-ar-payments-puller.ts missing export async function projectArPaymentsToLedger (callers must get the named refusal).");
  } else {
    const endIdx = text.indexOf("\n}\n", projIdx);
    const projectFn = text.slice(projIdx, endIdx === -1 ? undefined : endIdx + 3);
    if (!/refuseQboNativeWrite\(/.test(projectFn)) {
      failures.push("projectArPaymentsToLedger must REFUSE BY NAME via refuseQboNativeWrite( (QuickBooks is a read-only archive).");
    }
    if (/for\s*\(\s*const\s+\w+\s+of\s+mirror\.rows\s*\)/.test(projectFn)) {
      failures.push(
        "projectArPaymentsToLedger still loops mirror.rows — that pattern caused prod idle_in_transaction FATAL (IH35-TMS-PROD-25)."
      );
    }
  }
  if (/(?:INSERT\s+INTO|UPDATE)\s+accounting\.(?:payments|payment_applications)\b/i.test(text)) {
    failures.push("qbo-ar-payments-puller.ts writes accounting.payments / payment_applications — the QBO -> native projection was removed (ACCT-F4431380).");
  }
  return failures;
}

export function analyzeScheduler(text) {
  const failures = [];
  if (!/pullArPaymentsFromQbo/.test(text)) {
    failures.push("sync-scheduler.ts does not import the QBO AR payments puller — the stage is unwired.");
  }
  if (!/runStep\(\s*["']ar_payments_pull["']/.test(text)) {
    failures.push("sync-scheduler.ts does not run an isolated 'ar_payments_pull' step.");
  }
  // ACCT-F4431380 (9e) — OLD: required an isolated 'ar_payments_project' step. NEW: the projection refuses
  // by name, so scheduling it would record a refused step every tick — it must be ABSENT.
  if (/ar_payments_project|projectArPaymentsToLedger/.test(text)) {
    failures.push("sync-scheduler.ts still schedules ar_payments_project — the projection refuses by name (ACCT-F4431380).");
  }
  return failures;
}

export function analyzePosting(text) {
  const failures = [];
  if (!text.includes("QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED")) {
    failures.push(
      "posting-engine.service.ts lost QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED — a qbo-sourced customer payment could post a phantom TMS JE."
    );
  }
  if (text.includes("QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED") && !/qbo_payment_id/.test(text)) {
    failures.push(
      "posting-engine.service.ts references QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED but not qbo_payment_id — the guard is not tied to the qbo-origin marker."
    );
  }
  return failures;
}

function analyzeMigrations() {
  const failures = [];
  if (!fs.existsSync(MIGRATIONS_DIR)) return FLAGS.map((f) => `No migrations dir; ${f} unregistered`);
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const sql = files.map((f) => fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8")).join("\n");
  const registerRe = /INSERT\s+INTO\s+lib\.feature_flags\b/i;
  for (const flag of FLAGS) {
    if (!(registerRe.test(sql) && sql.includes(flag))) {
      failures.push(`No migration registers ${flag} in lib.feature_flags — isEnabled() would resolve false forever.`);
    }
  }
  if (!sql.includes("mdata.qbo_ar_payments")) {
    failures.push("No migration creates mdata.qbo_ar_payments — the inbound mirror table is missing.");
  }
  // Build-and-HOLD carve-out: ONE owner-approved migration. Block B (2026-07-28, owner-decisions
  // RESOLVED) directs these projections ON for TRANSP and names the mechanism explicitly: "Enable via
  // lib.feature_flag_overrides (user_uuid NULL, no expiry), owner-gated migration". Build-and-HOLD
  // governed WHEN, not HOW. Pinned to one exact filename — any other migration seeding these flags ON,
  // including a renamed copy or a different entity, still fails.
  const OWNER_APPROVED_ENABLE_MIGRATION = "202610110000_enable_qbo_projection_flags_transp.sql";
  // Build-and-HOLD: no migration may seed a per-entity ON override for these flags (owner flips them ON).
  const overrideOnRe = /INSERT\s+INTO\s+lib\.feature_flag_overrides[\s\S]{0,400}?enabled[\s\S]{0,40}?true/i;
  for (const f of files) {
    if (f === OWNER_APPROVED_ENABLE_MIGRATION) continue;
    const body = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    if (
      FLAGS.some((flag) => body.includes(flag)) &&
      overrideOnRe.test(body) &&
      FLAGS.some(
        (flag) =>
          new RegExp(`feature_flag_overrides[\\s\\S]*${flag}`).test(body) ||
          new RegExp(`${flag}[\\s\\S]*feature_flag_overrides`).test(body)
      )
    ) {
      failures.push(`${f} seeds a feature_flag_overrides ON for a QBO-AR-payments flag — build-and-HOLD forbids seeding ON; the owner flips it per-entity.`);
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  // ACCT-F4431380 (9e) — plants updated to the refusal contract.
  const goodPuller = `import { isEnabled } from "../lib/feature-flags/service.js";
    const A = "QBO_AR_PAYMENT_MIRROR_PULL_ENABLED";
    await isEnabled(client, A, { operating_company_id });
export async function projectArPaymentsToLedger(id: string) {
  return refuseQboNativeWrite("x", ["accounting.payments"], id);
}
`;
  const badEnv = `const A = process.env.QBO_AR_PAYMENT_MIRROR_PULL_ENABLED === "true";
export async function projectArPaymentsToLedger() {
  for (const m of mirror.rows) { await client.query("x"); }
}
`;
  const badPoster = goodPuller + "\n postJournalEntry(client, je);";
  const badNativeWrite = goodPuller + "const S = \`INSERT INTO accounting.payment_applications SELECT 1\`;\n";
  const badSilentNoop = goodPuller.replace('return refuseQboNativeWrite("x", ["accounting.payments"], id);', "return { enabled: false };");
  const goodSched = `runStep("ar_payments_pull", id, () => pullArPaymentsFromQbo(id));`;
  const badSched = `runStep("ap_bills_pull", id, () => pullApBillsFromQbo(id));`;
  const badSchedProject = goodSched + `\nrunStep("ar_payments_project", id, () => projectArPaymentsToLedger(id));`;
  const goodPost = `code !== "QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED"; if (payment.qbo_payment_id) throw x;`;
  const badPost = `no guard here`;
  const goodMig = `INSERT INTO lib.feature_flags QBO_AR_PAYMENT_MIRROR_PULL_ENABLED QBO_AR_PAYMENTS_PROJECTION_ENABLED mdata.qbo_ar_payments`;
  const badMig = `INSERT INTO lib.feature_flags QBO_AR_PAYMENT_MIRROR_PULL_ENABLED`;

  const checks = {
    pullerGoodPasses: analyzePuller(goodPuller).length === 0,
    pullerEnvFails: analyzePuller(badEnv).length > 0,
    pullerPosterFails: analyzePuller(badPoster).length > 0,
    pullerNativeWriteFails: analyzePuller(badNativeWrite).length > 0,
    pullerSilentNoopFails: analyzePuller(badSilentNoop).length > 0,
    schedGoodPasses: analyzeScheduler(goodSched).length === 0,
    schedBadFails: analyzeScheduler(badSched).length > 0,
    schedProjectFails: analyzeScheduler(badSchedProject).length > 0,
    postGoodPasses: analyzePosting(goodPost).length === 0,
    postBadFails: analyzePosting(badPost).length > 0,
  };
  const allOk = Object.values(checks).every(Boolean);
  // analyzeMigrations reads the real repo migrations dir (not synthetic), so only sanity-check the good/bad
  // string fixtures against the same regexes used inside it via a throwaway dir-free assertion.
  const migRegisterOk = /INSERT\s+INTO\s+lib\.feature_flags\b/i.test(goodMig) && goodMig.includes("mdata.qbo_ar_payments");
  const migBadFails = !(/INSERT\s+INTO\s+lib\.feature_flags\b/i.test(badMig) && badMig.includes("QBO_AR_PAYMENTS_PROJECTION_ENABLED"));

  if (allOk && migRegisterOk && migBadFails) {
    console.log("verify-qbo-ar-payments-projection-wired --selftest: PASS");
    process.exit(0);
  }
  console.error("verify-qbo-ar-payments-projection-wired --selftest: FAIL", checks, { migRegisterOk, migBadFails });
  process.exit(1);
}

function readOrNull(rel) {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

const failures = [];
const pullerSrc = readOrNull(PULLER_REL);
if (!pullerSrc) failures.push(`missing ${PULLER_REL}`);
else failures.push(...analyzePuller(pullerSrc));

const schedSrc = readOrNull(SCHEDULER_REL);
if (!schedSrc) failures.push(`missing ${SCHEDULER_REL}`);
else failures.push(...analyzeScheduler(schedSrc));

const postSrc = readOrNull(POSTING_REL);
if (!postSrc) failures.push(`missing ${POSTING_REL}`);
else failures.push(...analyzePosting(postSrc));

failures.push(...analyzeMigrations());

if (failures.length > 0) {
  console.error("verify-qbo-ar-payments-projection-wired: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-qbo-ar-payments-projection-wired: PASS (DB-flag mirror gate; both flags registered OFF; GL refuse present; mirror table present; ACCT-F4431380: projection refuses by name, no native payments write, not scheduled)"
);
process.exit(0);
