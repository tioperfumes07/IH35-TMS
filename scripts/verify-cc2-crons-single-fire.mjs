#!/usr/bin/env node
// Standing order point 9 — single-fire. Two backend instances run every node-cron schedule. Every CC-2 cron runs its
// tick under a lease (wrapBackgroundJobTick(..., { leaseSeconds }) -> withJobLease) or its own claim, and the lease
// claim stays one atomic statement on _system.job_leases (migration 202615340700).
// Static only. A new CC-2 cron file without a lease or claim FAILS; --selftest plants each regression.
export const ALLOW_OFFLINE_SKIP = "static source contract — never touches the database";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-cc2-crons-single-fire";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HELPER = "apps/backend/src/lib/background-jobs.ts";
const CC2_CRON = /(bank|banking|factor|faro|fuel|relay|plaid|reconcil|overage|wallet|dreamline|loves)/i;
/** Files the keyword match catches that are NOT CC-2's — each named with its owner (single-fire there is that lane's). */
const NOT_CC2 = {
  "apps/backend/src/cron/evidence-presence-reconcile.cron.ts": "CC-3 (evidence / crons) — board EVIDENCE-PRESENCE-CRON-UNION-ORDER-BY-2026100304",
  "apps/backend/src/cron/reconciliation-worker.cron.ts": "QBO / Samsara reference-data reconciliation (not banking) — board CRONS-WITHOUT-LEASE-2026100310",
};
/** Crons that single-fire through their own per-company claim (not the shared lease) — each named with its mechanism. */
const OWN_CLAIM = {
  "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts": "claimRelayTick: pg_advisory_xact_lock + 30-minute claim row",
  "apps/backend/src/integrations/samsara/fuel-purchase-push.cron.ts": "pg_try_advisory lock per tick",
  "apps/backend/src/reconciler/reconciler.cron.ts": "pg_try_advisory lock per tick",
};

function cronFiles() {
  const out = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const rel = path.join(d, e.name);
      if (e.isDirectory()) { if (!["node_modules", "__tests__"].includes(e.name)) walk(rel); }
      else if (/\.(cron|job)\.ts$/.test(e.name) && CC2_CRON.test(rel)) out.push(rel);
    }
  };
  walk("apps/backend/src");
  return out.sort();
}

/** Every wrapBackgroundJobTick(...) call, by paren matching (a lazy regex stops at the first ")" inside the body). */
export function wrapCalls(src) {
  const out = [];
  const re = /wrapBackgroundJobTick\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    let i = m.index + m[0].length, depth = 1;
    while (depth && i < src.length) { if (src[i] === "(") depth++; else if (src[i] === ")") depth--; i++; }
    out.push(src.slice(m.index, i));
    re.lastIndex = i;
  }
  return out;
}

export function check(helper, files) {
  const f = [];
  if (!/ON CONFLICT \(job_name\) DO UPDATE[\s\S]{0,200}WHERE _system\.job_leases\.leased_until < now\(\)/.test(helper)) {
    f.push(`${HELPER}: the lease claim must be one atomic INSERT ... ON CONFLICT DO UPDATE ... WHERE the lease expired`);
  }
  if (!/const outcome = await withJobLease\(jobName, opts\.leaseSeconds, fn\);\s*if \(outcome === "skipped"\) return;/.test(helper)) {
    f.push(`${HELPER}: wrapBackgroundJobTick must run a leased tick through withJobLease and skip when not the holder`);
  }
  for (const [file, src] of Object.entries(files)) {
    if (!/cron\.schedule\(|setInterval\(/.test(src)) continue;
    if (OWN_CLAIM[file] || NOT_CC2[file]) continue;
    const calls = wrapCalls(src);
    if (calls.length === 0) { f.push(`${file}: a scheduled CC-2 job with neither a lease nor a named own claim`); continue; }
    const unleased = calls.filter((c) => !/leaseSeconds/.test(c));
    if (unleased.length) f.push(`${file}: ${unleased.length} wrapBackgroundJobTick call(s) without { leaseSeconds } — both instances would run it`);
  }
  return f;
}

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

if (process.argv.includes("--selftest")) {
  const helper = read(HELPER);
  const files = Object.fromEntries(cronFiles().map((f) => [f, read(f)]));
  const fails = [];
  if (check(helper, files).length) fails.push(`tree not clean: ${check(helper, files).join("; ")}`);
  const tieout = "apps/backend/src/banking/bank-tieout.cron.ts";
  const plants = [
    ["lease dropped from a cron", helper, { ...files, [tieout]: files[tieout].replace(", { leaseSeconds: JOB_LEASE_SECONDS }", "") }],
    ["non-atomic claim", helper.replace("WHERE _system.job_leases.leased_until < now()", ""), files],
    ["skip ignored", helper.replace('if (outcome === "skipped") return;', ""), files],
    ["new unleased cron", helper, { ...files, "apps/backend/src/cron/bank-new.cron.ts": 'cron.schedule("0 1 * * *", async () => { await wrapBackgroundJobTick("x", async () => {}, app.log); });' }],
  ];
  for (const [name, h, fs2] of plants) {
    if (h === helper && JSON.stringify(fs2) === JSON.stringify(files)) fails.push(`plant did not change the source: ${name}`);
    else if (check(h, fs2).length === 0) fails.push(`plant escaped: ${name}`);
  }
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`);
  process.exit(0);
}

const files = cronFiles();
const fails = check(read(HELPER), Object.fromEntries(files.map((f) => [f, read(f)])));
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — ${files.length} CC-2 cron file(s): every scheduled tick leased or under a named own claim`);
