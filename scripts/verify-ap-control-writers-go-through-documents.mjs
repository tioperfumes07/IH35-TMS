#!/usr/bin/env node
/**
 * GUARD (LST-F414): every backend file that names the A/P control role is either a READER or a DOCUMENT POSTER.
 *
 * ROUND 393.1 (202615380200, trg_ap_control_written_only_by_documents) refuses at WRITE TIME any posting on the
 * ap_control account that is not a bill, a bill payment, a vendor credit or settlement deductions (debit). A poster
 * that resolves ap_control and writes its own journal lines therefore throws the first time it runs — measured
 * 2026-10-06: the insurance cancellation refund, the refund-obligation drain and the fleet add/remove wrote raw
 * `insurance_policy` / `refund_obligation` lines on ap_control (fixed here: they now issue the insurer's bill or vendor
 * credit). The lease rent, accident-liability absorb, fuel "ap" branch and retired payroll poster did too; each is fixed
 * (LST-F422, F424, F415, F426).
 *
 * Every file under apps/backend/src (tests excluded) that contains the literal "ap_control" must be listed below:
 *   READERS          — resolve it to label / report / reconcile / declare a role; they write no posting.
 *   DOCUMENT_POSTERS — post A/P only as bill / bill_payment / vendor_credit / driver_settlement (debit) documents.
 *   KNOWN_DEBT       — CLOSED at zero (LST-F426 payroll writer deleted, LST-F422 lease rent is a bill, LST-F424 accident
 *                      absorb is an accrued claim). Any entry FAILS; a new file not listed FAILS.
 *
 * Run: node scripts/verify-ap-control-writers-go-through-documents.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "apps/backend/src";
const LABEL = "verify-ap-control-writers-go-through-documents";

export const READERS = new Set([
  "apps/backend/src/accounting/account-balances.routes.ts",
  "apps/backend/src/accounting/account-balances.service.ts",
  "apps/backend/src/accounting/account-register.routes.ts",
  "apps/backend/src/accounting/account-register.service.ts",
  "apps/backend/src/accounting/balance-sheet.routes.ts",
  "apps/backend/src/accounting/cash-basis/engine.ts",
  "apps/backend/src/accounting/cash-basis/period-close-snapshot.service.ts",
  "apps/backend/src/accounting/cash-basis/report-transforms.ts",
  "apps/backend/src/accounting/coa-roles/entity-required-roles.ts",
  "apps/backend/src/accounting/coa-roles/refund-roles-guard.ts",
  "apps/backend/src/accounting/coa-roles/resolver.service.ts",
  "apps/backend/src/accounting/comparison-report.service.ts",
  "apps/backend/src/accounting/subledger-gl-control-rec.service.ts",
  "apps/backend/src/accounting/trial-balance.routes.ts",
  "apps/backend/src/driver-finance/driver-bills.routes.ts", // preview of the settlement bill's lines; writes nothing
  "apps/backend/src/health/ledger-financial-health.checks.ts",
  "apps/backend/src/home/scenario-registry.ts", // scenario JE contracts (text), no writer
  "apps/backend/src/insurance/policy-cancel.service.ts", // audit payload names the intended role; the refund is a vendor credit
  "apps/backend/src/insurance/refund-obligation.service.ts", // stored debit_role default; the drain issues a vendor credit
  "apps/backend/src/reconciliation/ledger-integrity-detectors.service.ts",
]);

export const DOCUMENT_POSTERS = new Set([
  "apps/backend/src/accounting/posting-engine.service.ts", // bill / bill_payment / vendor_credit source posters
  "apps/backend/src/accounting/bill-gl-draft.service.ts", // a bill's own GL lines
  "apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts", // bill_payment
  "apps/backend/src/driver-finance/settlement-ap-chain.service.ts", // the settlement's bills + their payment
]);

export const KNOWN_DEBT = new Map([]);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      walk(p, out);
    } else if (/\.(ts|tsx|mts)$/.test(e.name) && !/\.test\.(ts|tsx|mts)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

/** files: Map<relPath, source>. Returns the problem list. */
export function collectProblems(files, lists = { READERS, DOCUMENT_POSTERS, KNOWN_DEBT }) {
  const problems = [];
  const naming = [...files.entries()].filter(([, src]) => src.includes('"ap_control"')).map(([rel]) => rel);
  for (const rel of naming) {
    if (lists.READERS.has(rel) || lists.DOCUMENT_POSTERS.has(rel) || lists.KNOWN_DEBT.has(rel)) continue;
    problems.push(
      `${rel} names "ap_control" and is not a listed reader or document poster. ROUND 393.1 refuses any ap_control ` +
        `posting that is not a bill / bill payment / vendor credit at write time — issue the vendor's document ` +
        `(createBill / createVendorCreditInClientTx), or list the file as a READER if it writes no posting.`
    );
  }
  // The debt list is closed at zero: every A/P writer posts through a document. A new entry is a defect, not a policy.
  for (const rel of lists.KNOWN_DEBT.keys()) {
    problems.push(`${rel} is listed as KNOWN_DEBT — the list closed at zero (LST-F426/F422/F424); issue the vendor's document instead.`);
  }
  const namingSet = new Set(naming);
  for (const rel of [...lists.READERS, ...lists.DOCUMENT_POSTERS, ...lists.KNOWN_DEBT.keys()]) {
    if (!namingSet.has(rel)) problems.push(`${rel} is listed but no longer names "ap_control" — remove the stale entry (shrink-only).`);
  }
  return problems;
}

function loadRealFiles() {
  const files = new Map();
  for (const abs of walk(path.join(ROOT, SRC))) files.set(path.relative(ROOT, abs).split(path.sep).join("/"), fs.readFileSync(abs, "utf8"));
  return files;
}

if (process.argv.includes("--selftest")) {
  const real = loadRealFiles();
  const base = collectProblems(real);
  if (base.length) {
    console.error(`${LABEL} --selftest FAIL — real tree is not green:\n  - ${base.join("\n  - ")}`);
    process.exit(1);
  }
  const cases = [];
  // 1. The LST-F414 defect verbatim: a new poster writes raw lines on ap_control.
  const planted = new Map(real);
  planted.set("apps/backend/src/insurance/new-premium-poster.service.ts", 'const ap = await resolveRoleAccount(c, oc, "ap_control");');
  cases.push(["new unlisted ap_control writer", collectProblems(planted)]);
  // 2. The debt list reached zero (LST-F426 / F422 / F424): it is closed. Re-opening it with any entry FAILS, so a raw
  //    ap_control writer can never be parked as "known debt" again.
  const reopened = { READERS, DOCUMENT_POSTERS, KNOWN_DEBT: new Map([["apps/backend/src/insurance/new-premium-poster.service.ts", "parked"]]) };
  const withParked = new Map(real);
  withParked.set("apps/backend/src/insurance/new-premium-poster.service.ts", 'const ap = await resolveRoleAccount(c, oc, "ap_control");');
  cases.push(["debt list re-opened", collectProblems(withParked, reopened)]);
  // 3. The insurance fleet poster regressing to a raw ap_control line.
  const regressed = new Map(real);
  regressed.set(
    "apps/backend/src/insurance/policy-unit-fleet.service.ts",
    `${real.get("apps/backend/src/insurance/policy-unit-fleet.service.ts") ?? ""}\nconst p = await resolveRoleAccount(c, oc, "ap_control");`
  );
  cases.push(["fleet poster regresses to ap_control", collectProblems(regressed)]);
  // 4. Moving a debt file into READERS without fixing it is not caught by this check alone — it is caught because the
  //    reviewer sees the list change; the list is the record. Assert at least the list stays disjoint.
  const overlap = [...KNOWN_DEBT.keys()].filter((k) => READERS.has(k) || DOCUMENT_POSTERS.has(k));
  cases.push(["lists are disjoint", overlap.length ? ["overlap"] : []]);
  const failed = cases.filter(([name, p], i) => (i < 3 ? p.length === 0 : p.length !== 0)).map(([name]) => name);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL — not caught: ${failed.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — real tree clean; ${cases.length}/${cases.length} cases`);
  process.exit(0);
}

const problems = collectProblems(loadRealFiles());
if (problems.length) {
  console.error(`${LABEL}: FAIL — ${problems.length} issue(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — ${READERS.size} readers, ${DOCUMENT_POSTERS.size} document posters; known debt closed at zero`
);
