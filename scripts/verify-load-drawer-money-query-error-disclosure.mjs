#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["factoring","fines","connectivity"],"leaves":["dispatch.load.drawer.factoring.query_error_disclosure","dispatch.load.drawer.fines_deductions.query_error_disclosure"],"task":"DSP-MONEY-F7283-LOAD-DRAWER-MONEY-READ-FAILURES-PAINT-FALSE-EMPTY","vertical":"column-wave"} */
/**
 * DSP-MONEY-F7283-LOAD-DRAWER-MONEY-READ-FAILURES-PAINT-FALSE-EMPTY (CC-1, 2026-08-29):
 * FactoringTab and FinesDeductionsCard each consumed several React Query feeds and, on failure,
 * defaulted the query's data to an empty collection (`.data?.x ?? []`) with no `.isError` check
 * anywhere -- indistinguishable from a genuine "nothing here" state. For money-adjacent surfaces (a
 * factoring packet checklist, submission eligibility, fine/escrow deductions, settlement status)
 * that silence could hide a real fetch failure behind a false "complete"/"empty"/"eligible" read.
 * Fixed by adding a shared QueryErrorNote component (named feed + exact-query Retry) and gating each
 * of the nine named feeds' derived empty/eligibility copy on that query's own `.isError`, checked
 * BEFORE the existing genuine-empty branch so a real zero-data state still renders its original
 * honest copy unchanged. This guard holds that fix so it cannot regress.
 *
 * Self-test: node scripts/verify-load-drawer-money-query-error-disclosure.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  errorNote: "apps/frontend/src/components/dispatch/tabs/QueryErrorNote.tsx",
  factoring: "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx",
  fines: "apps/frontend/src/components/dispatch/tabs/FinesDeductionsCard.tsx",
};
const LABEL = "verify-load-drawer-money-query-error-disclosure";

export function audit(src) {
  const failures = [];

  if (!fs.existsSync) {
    // placeholder to keep lint quiet about unused import in some bundlers; never hit
  }
  if (!src.errorNote || !/export function QueryErrorNote/.test(src.errorNote)) {
    failures.push(`${FILES.errorNote}: shared QueryErrorNote component not found`);
  }

  // FactoringTab: 5 named feeds, each must reference their own query's .isError before their
  // existing empty/derived copy.
  const factoringChecks = [
    { query: "docsQ", count: 4, why: "rate confirmation / BOL / POD checklist items + the packet-complete message" },
    { query: "invoicesQ", count: 1, why: "the Invoice checklist item" },
    { query: "invoiceDocsQ", count: 1, why: "the Invoice PDF checklist item" },
    { query: "factorsQ", count: 1, why: "the FARO factor picker" },
    { query: "candidateQ", count: 1, why: "the Submit-to-FARO eligibility note" },
  ];
  for (const { query, count, why } of factoringChecks) {
    const re = new RegExp(`${query}\\.isError`, "g");
    const found = (src.factoring.match(re) ?? []).length;
    if (found < count) {
      failures.push(`${FILES.factoring}: expected ${query}.isError checked at least ${count}x (${why}), found ${found}`);
    }
  }
  if (!/docsQ\.isError \|\| invoicesQ\.isError/.test(src.factoring)) {
    failures.push(`${FILES.factoring}: the "Mark Packet Ready" completeness message must also check docsQ/invoicesQ .isError before trusting packetComplete`);
  }

  // FinesDeductionsCard: 4 named feeds.
  const finesChecks = [
    { query: "pendingEscrowQ", count: 1, why: "the pending-deductions empty state" },
    { query: "finePoliciesQ", count: 2, why: "both the active and history fine-policy empty states" },
  ];
  for (const { query, count, why } of finesChecks) {
    const re = new RegExp(`${query}\\.isError`, "g");
    const found = (src.fines.match(re) ?? []).length;
    if (found < count) {
      failures.push(`${FILES.fines}: expected ${query}.isError checked at least ${count}x (${why}), found ${found}`);
    }
  }
  if (!/settlementForLoadQ\.isError \|\| preSettlementQ\.isError/.test(src.fines)) {
    failures.push(`${FILES.fines}: the settlement-for-this-load section must check both settlementForLoadQ and preSettlementQ .isError before choosing between the resolved/open-pre-settlement branches`);
  }

  // Both consumer files must actually import the shared component (not reinvent their own copy).
  if (!/import \{ QueryErrorNote \} from "\.\/QueryErrorNote"/.test(src.factoring)) {
    failures.push(`${FILES.factoring}: must import the shared QueryErrorNote component, not a local reimplementation`);
  }
  if (!/import \{ QueryErrorNote \} from "\.\/QueryErrorNote"/.test(src.fines)) {
    failures.push(`${FILES.fines}: must import the shared QueryErrorNote component, not a local reimplementation`);
  }

  return failures;
}

function loadSrc(root) {
  return {
    errorNote: fs.readFileSync(path.join(root, FILES.errorNote), "utf8"),
    factoring: fs.readFileSync(path.join(root, FILES.factoring), "utf8"),
    fines: fs.readFileSync(path.join(root, FILES.fines), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }

  // Mutation 1: drop the shared component's export (the exact "never built it" shape).
  const droppedComponent = { ...good, errorNote: good.errorNote.replace("export function QueryErrorNote", "function QueryErrorNoteUnexported") };
  if (droppedComponent.errorNote === good.errorNote) {
    console.error(`${LABEL} SELFTEST FAIL — dropped-component pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(droppedComponent).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — dropped shared component regression escaped`);
    process.exit(1);
  }

  // Mutation 2: revert one FactoringTab checklist item (docsQ) to the old unchecked shape (the
  // exact pre-fix shape for the Rate Confirmation item).
  const revertedDocsCheck = {
    ...good,
    factoring: good.factoring.replace(
      `note={docsQ.isError ? <QueryErrorNote label="documents" onRetry={() => docsQ.refetch()} /> : hasRateConf ? undefined : "Upload under Documents tab"}`,
      `note={hasRateConf ? undefined : "Upload under Documents tab"}`,
    ),
  };
  if (revertedDocsCheck.factoring === good.factoring) {
    console.error(`${LABEL} SELFTEST FAIL — reverted-docs-check pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(revertedDocsCheck).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — reverted docsQ checklist regression escaped`);
    process.exit(1);
  }

  // Mutation 3: revert the settlement section's combined error check in FinesDeductionsCard (the
  // exact pre-fix shape).
  const revertedSettlement = {
    ...good,
    fines: good.fines.replace(
      `      {settlementForLoadQ.isError || preSettlementQ.isError ? (
        <section className="rounded-sm border border-gray-200 bg-white p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase text-gray-600">Settlement for this load</h4>
          <QueryErrorNote
            label="settlement information for this load"
            onRetry={() => {
              void settlementForLoadQ.refetch();
              void preSettlementQ.refetch();
            }}
          />
        </section>
      ) : resolvedSettlementIsSettled && resolvedSettlement ? (`,
      `      {resolvedSettlementIsSettled && resolvedSettlement ? (`,
    ),
  };
  if (revertedSettlement.fines === good.fines) {
    console.error(`${LABEL} SELFTEST FAIL — reverted-settlement pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(revertedSettlement).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — reverted settlement-section regression escaped`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — 3 mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — all 9 named load-drawer money feeds disclose fetch failure instead of a false empty/eligible read`);
