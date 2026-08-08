#!/usr/bin/env node
/**
 * GUARD: the settlement earnings line must ignore voided driver bills and must never skip silently.
 * ACCT-F206.
 *
 * TWO DEFECTS IN ONE FUNCTION — appendSettlementLineFromDriverBillIfMissing, the leg that decides
 * whether a driver is paid at all.
 *
 * 1. IT SOURCED FROM ANY BILL, INCLUDING A VOIDED ONE. The lookup was
 *      SELECT ... FROM driver_finance.driver_bills WHERE load_id=$1 AND driver_id=$2
 *      ORDER BY created_at DESC LIMIT 1
 *    with no status test. Voiding is a status flip that does NOT move created_at, so the moment the
 *    most recent bill for a load is voided and not replaced, the driver's earnings line would be
 *    built from a payable the company revoked. On prod today the three double-billed loads happen to
 *    carry the VOID one first, so the ordering saves it by accident — and an accident is not a control.
 *
 * 2. IT RETURNED SILENTLY WHEN THERE WAS NO BILL. A bare `return`, in a close path whose OTHER two
 *    legs both call recordPostingFlagSkip precisely "so the settlement close is never a silent no-op
 *    on this leg". The earnings leg — the one that matters most — was the only silent one.
 *    Measured consequence on prod: settlements d3ff8ea3 and c7422acc are both status='closed' with
 *    ZERO settlement_lines, for loads that never got a driver bill. The driver worked the load, is
 *    marked settled, was paid nothing, and NOTHING anywhere records why. A $0 settlement must be
 *    countable, not invisible.
 *
 * Run:  node scripts/verify-settlement-earnings-line-sourcing.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/driver-finance/settlement-engine.ts";
const LABEL = "verify-settlement-earnings-line-sourcing";

export function stripComments(src) {
  return src.replace(/--[^\n]*/g, "").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

/** The driver_bills lookup must exclude voided rows. */
export function billLookupExcludesVoid(src) {
  const clean = stripComments(src);
  const m = /FROM\s+driver_finance\.driver_bills([\s\S]{0,600}?)(?:LIMIT|`)/i.exec(clean);
  if (!m) return true; // no lookup here; nothing to judge
  return /status\s*(<>|!=)\s*'void'|status\s+NOT\s+IN\s*\(\s*'void'|voided_at\s+IS\s+NULL/i.test(m[1]);
}

/** The no-bill branch must record something, not return bare. */
export function noBillBranchIsAudited(src) {
  const clean = stripComments(src);
  const idx = clean.search(/if\s*\(\s*!bill\?\.\s*id\s*\)/);
  if (idx === -1) return true; // shape changed; the lookup check still applies
  const branch = clean.slice(idx, idx + 1400);
  return /appendCrudAudit|recordPostingFlagSkip|appendSettlementAudit/.test(branch);
}

export function collectProblems(src, file = TARGET) {
  const problems = [];
  if (!billLookupExcludesVoid(src)) {
    problems.push(
      `${file}: the driver_bills lookup for the settlement earnings line does not exclude voided ` +
        `bills. Voiding is a status flip that does not move created_at, so ORDER BY created_at DESC ` +
        `will source a driver's pay from a payable the company revoked (ACCT-F206).`
    );
  }
  if (!noBillBranchIsAudited(src)) {
    problems.push(
      `${file}: the "no eligible driver bill" branch returns silently. This is the leg that decides ` +
        `whether the driver is paid, and the same close path audits its other two legs so the close ` +
        `"is never a silent no-op". Prod holds two closed settlements with zero lines and no record ` +
        `of why — a $0 settlement must be countable (ACCT-F206).`
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const badLookup =
    "SELECT id FROM driver_finance.driver_bills WHERE load_id=$1 AND driver_id=$2 ORDER BY created_at DESC LIMIT 1";
  if (collectProblems(badLookup).length !== 1) failures.push("the void-inclusive lookup was NOT caught");

  const goodLookup =
    "SELECT id FROM driver_finance.driver_bills WHERE load_id=$1 AND driver_id=$2 AND status <> 'void' ORDER BY created_at DESC LIMIT 1";
  if (collectProblems(goodLookup).length !== 0) failures.push("the corrected lookup was flagged");

  const silent = goodLookup + "\nconst bill = r.rows[0];\nif (!bill?.id) { return; }";
  const silentProblems = collectProblems(silent);
  if (!silentProblems.some((p) => /silently/.test(p))) failures.push("the silent return was NOT caught");

  const audited =
    goodLookup + "\nconst bill = r.rows[0];\nif (!bill?.id) { await appendCrudAudit(client, u, 'x', {}); return; }";
  if (collectProblems(audited).length !== 0) failures.push("the audited skip branch was flagged");

  // A comment naming the fix must not satisfy either half.
  const commentOnly = "-- status <> 'void' and appendCrudAudit are handled elsewhere\n" + badLookup;
  if (collectProblems(commentOnly).length !== 1) {
    failures.push("a COMMENT naming the fix satisfied the check — false green");
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 5/5 (void-inclusive lookup caught, fixed lookup passes, silent return ` +
      `caught, audited skip passes, comment cannot fake a pass)`
  );
  process.exit(0);
}

const abs = path.join(root, TARGET);
if (!fs.existsSync(abs)) {
  console.error(`${LABEL} FAIL — ${TARGET} is missing; the settlement earnings leg cannot be verified.`);
  process.exit(1);
}
const problems = collectProblems(fs.readFileSync(abs, "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} issue(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — the settlement earnings line ignores voided driver bills and records its skips.`
);
