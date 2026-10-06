#!/usr/bin/env node
/**
 * verify-no-internal-payload-in-notes — an internal key never travels in text a person reads.
 *   1. (original) the vendor-profile payload prefix never renders on a vendor screen.
 *   2. (ROUND 390.3) no backend writer composes a memo / description that interpolates an internal id (`${...Id}`,
 *      `${..._id}`, `${x.id}`). An id in a memo is a key doing a string's job: the owner reads it, and code ends up
 *      matching on it (recon-adjustments keyed idempotency on `memo = ...session <uuid>` — two sessions' identical
 *      charges collided). Link the record on the spine (accounting.transaction_source_links) and write a human memo.
 *      The writers that predate the rule are a counted, SHRINK-ONLY baseline: a new site fails; a fixed site must be
 *      removed from the baseline (a stale count fails too).
 *   3. (ROUND 390.3, live, USMCA) no journal entry or expense memo carries "· session <uuid>" once 202615390930 has run.
 *   --selftest exercises 2.
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const ROOT = process.cwd();
const FRONTEND_DIR = path.join(ROOT, "apps", "frontend", "src");
const PREFIX = "IH35_VENDOR_PROFILE_V1::";
const ALLOWED_PREFIX_FILES = new Set([
  path.join("apps", "frontend", "src", "lib", "vendorProfileMeta.ts"),
]);

function listFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full));
    else if (entry.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) files.push(full);
  }
  return files;
}

export function verifyNoInternalPayloadInNotes() {
  if (!fs.existsSync(FRONTEND_DIR)) throw new Error("frontend source directory not found");

  const violations = [];
  for (const file of listFiles(FRONTEND_DIR)) {
    const relative = path.relative(ROOT, file);
    const text = fs.readFileSync(file, "utf8");
    if (text.includes(PREFIX) && !ALLOWED_PREFIX_FILES.has(relative)) {
      violations.push(`${relative} contains internal vendor payload prefix`);
    }
    if (relative.endsWith("/pages/Vendors.tsx") && (text.includes("selectedVendor.notes ??") || text.includes("{selectedVendor.notes}"))) {
      violations.push(`${relative} renders selectedVendor.notes directly`);
    }
  }
  if (violations.length > 0) {
    throw new Error(`internal notes payload exposure detected:\n${violations.join("\n")}`);
  }
}

export const REQUIRES_LIVE_DB = "rule 3 reads USMCA memos on the live database";

/** file|field|interpolated ids -> count, measured 2026-10-03. Shrink-only. */
export const MEMO_ID_BASELINE = new Map([
  ["apps/backend/src/accounting/bills.service.ts|memo|billId", 1],
  ["apps/backend/src/accounting/broker-advances.service.ts|memo|input.driverBillId", 1],
  ["apps/backend/src/accounting/bulk-void.service.ts|memo|id", 1],
  ["apps/backend/src/accounting/escrow/service.ts|memo|input.escrow_account_id", 1],
  ["apps/backend/src/accounting/finance-hub-amortization-posting/loan-payment-posting.service.ts|memo|input.loanId", 1],
  ["apps/backend/src/accounting/from-load.ts|memo|input.loadId", 1],
  ["apps/backend/src/accounting/invoices.routes.ts|memo|params.data.id", 1],
  ["apps/backend/src/accounting/lease-asc842/lease-posting.service.ts|description|a.fixed_asset_id", 2],
  ["apps/backend/src/accounting/reclassify/reclassify.service.ts|memo|batchId", 1],
  ["apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts|memo|input.settlementId", 1],
  ["apps/backend/src/accounting/void-document.service.ts|memo|input.id", 1],
  ["apps/backend/src/dispatch/cancellation.service.ts|memo|inv.id", 1],
  ["apps/backend/src/driver-finance/settlement-dispute.service.ts|description|input.dispute_id", 2],
  ["apps/backend/src/driver-finance/settlement-dispute.service.ts|description|params.disputeId", 2],
  ["apps/backend/src/driver-finance/settlement-dispute.service.ts|memo|input.dispute_id", 1],
  ["apps/backend/src/driver-finance/settlement-dispute.service.ts|memo|params.disputeId", 1],
  ["apps/backend/src/governance/void-cancel-executors.ts|memo|entityId", 7],
  ["apps/backend/src/insurance/dispersal.service.ts|memo|policy.id", 2],
  ["apps/backend/src/payroll/driver-settlement.service.deprecated.ts|memo|settlement.id", 3],
  ["apps/backend/src/routes/safety/dot-inspections.ts|description|inspection.id", 2],
  ["apps/backend/src/safety/safety-v5.routes.ts|description|inspection.id", 1],
]);

/** [{ rel, src }] -> Map(key -> count) of memo / description templates that interpolate an internal id. */
export function memoIdSites(files) {
  const out = new Map();
  for (const { rel, src } of files) {
    for (const m of src.matchAll(/\b(memo|description)\s*:\s*`([^`]*)`/g)) {
      const ids = [...m[2].matchAll(/\$\{([^}]*)\}/g)]
        .map((x) => x[1].trim())
        .filter((e) => /(^|\.)(id|[a-zA-Z]+Id|[a-z_]+_id)$/.test(e.split(/\s*\?\?\s*/).pop()) && !/display_id|_number|number$/i.test(e.split(/\s*\?\?\s*/)[0]));
      if (!ids.length) continue;
      const key = `${rel}|${m[1]}|${ids.join(",")}`;
      out.set(key, (out.get(key) ?? 0) + 1);
    }
  }
  return out;
}

export function memoIdProblems(sites, baseline = MEMO_ID_BASELINE) {
  const problems = [];
  for (const [key, n] of sites) {
    const allowed = baseline.get(key) ?? 0;
    if (n > allowed) problems.push(`${key}: ${n} memo/description template(s) interpolate an internal id (baseline ${allowed}) — link the record on the spine and write a human memo (ROUND 390.3)`);
  }
  for (const [key, allowed] of baseline) {
    const n = sites.get(key) ?? 0;
    if (n < allowed) problems.push(`${key}: baseline ${allowed} but only ${n} left — lower it (shrink-only)`);
  }
  return problems;
}

function backendFiles() {
  return execSync("git ls-files apps/backend/src", { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".ts") && !/__tests__|\.test\.ts$/.test(f))
    .map((rel) => ({ rel, src: fs.readFileSync(path.join(ROOT, rel), "utf8") }));
}

async function liveSessionMemos() {
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client: c, pool } = await requireLiveDbOrExit({ label: "verify-no-internal-payload-in-notes" });
  try {
    await c.query("BEGIN READ ONLY");
    await c.query("SET LOCAL app.bypass_rls = 'lucia'");
    const applied = (await c.query(`SELECT 1 FROM _system._schema_migrations WHERE filename = '202615390930_recon_adjustments_link_to_session.sql'`)).rowCount > 0;
    const r = (await c.query(`
      SELECT (SELECT count(*)::int FROM accounting.journal_entries
               WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80' AND memo ~ '· session [0-9a-f-]{36}') AS je,
             (SELECT count(*)::int FROM accounting.expenses
               WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80' AND memo ~ '· session [0-9a-f-]{36}') AS exp`)).rows[0];
    await c.query("ROLLBACK");
    return { applied, ...r };
  } finally {
    c.release();
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === new URL(import.meta.url).pathname) {
  if (process.argv.includes("--selftest")) {
    const f = (src) => [{ rel: "apps/backend/src/x.ts", src }];
    const cases = [
      ["an id in a memo FAILS", memoIdProblems(memoIdSites(f("x({ memo: `Bank reconciliation · session ${input.session_id}` })")), new Map()).length === 1],
      ["a human memo passes", memoIdProblems(memoIdSites(f("x({ memo: `Bank reconciliation service charge — ${date}` })")), new Map()).length === 0],
      ["a display number is not an id", memoIdProblems(memoIdSites(f("x({ memo: `Void: payment ${p.display_id ?? p.number}` })")), new Map()).length === 0],
      ["a fixed baseline site must be removed", memoIdProblems(new Map(), new Map([["a|memo|id", 1]])).length === 1],
      ["the real tree is within its baseline", memoIdProblems(memoIdSites(backendFiles())).length === 0],
    ];
    const bad = cases.filter(([, v]) => !v);
    if (bad.length) {
      console.error(`verify:no-internal-payload-in-notes selftest FAIL: ${bad.map(([n]) => n).join("; ")}`);
      for (const p of memoIdProblems(memoIdSites(backendFiles()))) console.error(`  ${p}`);
      process.exit(1);
    }
    console.log(`verify:no-internal-payload-in-notes selftest ${cases.length}/${cases.length}`);
    process.exit(0);
  }
  try {
    verifyNoInternalPayloadInNotes();
    const problems = memoIdProblems(memoIdSites(backendFiles()));
    const live = await liveSessionMemos();
    if (live.applied && live.je + live.exp > 0) problems.push(`${live.je} journal entr(ies) and ${live.exp} expense(s) on USMCA still carry "· session <uuid>" in the memo`);
    if (!live.applied) console.log(`verify:no-internal-payload-in-notes — PENDING DEPLOY 202615390930: ${live.je} JE + ${live.exp} expense memo(s) still carry a session uuid (reported, not enforced)`);
    if (problems.length) throw new Error(problems.join("\n"));
    console.log(`verify:no-internal-payload-in-notes — OK (${[...MEMO_ID_BASELINE.values()].reduce((a, b) => a + b, 0)} id-in-memo writer site(s) left in the shrink-only baseline)`);
  } catch (error) {
    console.error(`verify:no-internal-payload-in-notes — FAILED\n${String((error && error.message) || error)}`);
    process.exit(1);
  }
}
