#!/usr/bin/env node
// verify-bank-automatch-observable (P2-BANK-AUTOMATCH)
// The nightly bank-recon auto-match tick must NOT silently discard its auto-matched metric (it used to do
// `void { ...auto_matched }`, so even an enabled run left no observable count). Asserts the tick returns a
// summary and logs it, and no longer void-discards the metric. Self-test: --selftest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CRON = "apps/backend/src/cron/bank-recon-auto-match.cron.ts";

export function check(src) {
  const failures = [];
  if (/void\s*\{[^}]*auto_matched/.test(src)) {
    failures.push("the auto-matched metric is void-discarded — surface it (log/return), never `void {...auto_matched}`");
  }
  if (!/return\s+summary|BankReconAutoMatchSummary/.test(src)) {
    failures.push("runBankReconAutoMatchTick must return an observable summary (companies/scanned/autoMatched)");
  }
  if (!/tick summary/.test(src)) {
    failures.push("the tick must log a summary each run so an enabled run is observable");
  }

  // LV-TXN-012 — A VISIBLE NUMBER MUST ALSO BE A TRUE ONE.
  //
  // This guard was written to stop the auto-matched metric being thrown away, and it did that. But
  // it only ever asked whether the number is SURFACED, never whether it is CORRECT — and it was not.
  // The tick counted `candidates.some((c) => c.auto_match)`, while findCandidates persists at most
  // ONE row and only for a candidate whose kind is in PERSISTABLE_MATCH_KINDS. Of the six
  // LedgerEntryKind members, 'bill' is excluded (the banking.reconciliation_matches CHECK constraint
  // rejects it; see the header comment in match.service.ts). So a transaction whose only confident
  // candidate was a bill got counted as auto-matched while NOTHING was written for it.
  //
  // An operator reading `autoMatched: 47` reasonably concludes 47 bank lines were reconciled. The
  // true figure could be zero. Rescuing a wrong number from being discarded makes it more dangerous,
  // not less — so the truth assertion belongs here, beside the visibility one, where the next reader
  // of this file will see both.
  const withoutComments = src.replace(/\/\/[^\n]*/g, "");
  if (!/auto_match\s*&&\s*PERSISTABLE_MATCH_KINDS\.has\(/.test(withoutComments)) {
    failures.push(
      "the auto-matched counter must mirror the PERSISTENCE predicate " +
        "(auto_match && PERSISTABLE_MATCH_KINDS.has(kind)), not merely `auto_match` — otherwise it " +
        "counts transactions for which no reconciliation_matches row was written (LV-TXN-012)"
    );
  }
  if (!/autoMatchUnpersistable/.test(withoutComments)) {
    failures.push(
      "the confident-but-unpersistable population must stay visible (autoMatchUnpersistable). " +
        "Excluding those transactions from autoMatched is correct; making them invisible trades an " +
        "inflated number for a silent blind spot"
    );
  }
  return failures;
}

export function run() {
  let src;
  try { src = fs.readFileSync(path.join(ROOT, CRON), "utf8"); } catch { return [`${CRON} not found`]; }
  return check(src);
}

if (process.argv.includes("--selftest")) {
  const truthful =
    `if (candidates.some((c) => c.auto_match && PERSISTABLE_MATCH_KINDS.has(c.ledger_entry_kind)))` +
    ` autoMatchUnpersistable;`;
  const good = `export type BankReconAutoMatchSummary = {}; async function t(){ totalAutoMatched+=n; ${truthful} const summary = {}; log?.info?.(summary,"tick summary"); return summary; }`;
  const bad = `async function t(){ void { operating_company_id: c, auto_matched: n }; }`;
  // LV-TXN-012 mutations: the REAL source with each half of the truth assertion broken. Both must be
  // caught, and both are run through check() rather than regex-tested in place -- a selftest that
  // inspects a string it just built cannot fail (that mistake shipped once already, in
  // verify-disp-wire-06, and had to be undone).
  const realSrc = (() => {
    try { return fs.readFileSync(path.join(ROOT, CRON), "utf8"); } catch { return null; }
  })();
  const countsCandidates =
    realSrc && realSrc.replace("c.auto_match && PERSISTABLE_MATCH_KINDS.has(c.ledger_entry_kind)", "c.auto_match");
  const hidesUnpersistable = realSrc && realSrc.replaceAll("autoMatchUnpersistable", "dropped");
  const checks = [
    ["observable tick passes", check(good).length === 0],
    ["void-discard tick is caught", check(bad).length > 0],
    ["truthful tick passes", check(good).length === 0],
    [
      "counting CANDIDATES instead of PERSISTED is caught (LV-TXN-012)",
      Boolean(countsCandidates) && countsCandidates !== realSrc && check(countsCandidates).length > 0,
    ],
    [
      "hiding the unpersistable population is caught",
      Boolean(hidesUnpersistable) && hidesUnpersistable !== realSrc && check(hidesUnpersistable).length > 0,
    ],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) { console.error("verify:bank-automatch-observable --selftest FAIL:"); for (const [n] of failed) console.error("  ✗ " + n); process.exit(1); }
  console.log(`verify:bank-automatch-observable --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:bank-automatch-observable FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:bank-automatch-observable PASS (auto-match metric is surfaced, not discarded)");
}
