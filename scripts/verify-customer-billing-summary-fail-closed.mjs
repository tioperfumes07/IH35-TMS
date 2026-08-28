#!/usr/bin/env node
/**
 * verify-customer-billing-summary-fail-closed.mjs (CUST-MONEY-F6984)
 *
 * CustomerDetail.tsx's Billing & Receivables tab renders three DataPanel cards (Factoring Config,
 * Credit Terms, Detention + Layover Defaults) and a Receivables Aging card entirely from
 * billingSummaryQuery.data. React Query RETAINS `data` from the last successful fetch across a
 * FAILED refetch, so a stale billingSummary kept factoring eligibility, recourse, vendor, credit
 * terms, outstanding balance, detention/layover defaults, and A/R aging on screen -- looking
 * current -- at the same time the page's own ListErrorBanner was telling the user the load had
 * failed. Same class already fixed for this file's payment history (CUST-MONEY-F6278) and its
 * sibling FreeTimeDetentionEditor.tsx component (CUST-MONEY-F6985).
 *
 * This guard asserts, against the REAL file, that:
 *   1. the three economics DataPanels are wrapped in a `!billingSummaryQuery.isError` gate.
 *   2. the Receivables Aging card's content is also gated on `billingSummaryQuery.isError`.
 *
 * FAIL if either gate regresses to rendering unconditionally on stale billingSummary data.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-billing-summary-fail-closed";
const TARGET_FILE = "apps/frontend/src/pages/CustomerDetail.tsx";

function readReal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * Injectable core: pass `src` to exercise this exact function against synthetic content; omit it
 * to check the real repo file.
 */
export function check(src) {
  const failures = [];
  const source = src != null ? src : (() => { try { return readReal(TARGET_FILE); } catch { return null; } })();
  if (source == null) return [`${TARGET_FILE} not found`];

  // Anchor on the "Factoring Config" DataPanel itself (not the first billingSummaryQuery.isError
  // match in the file, which is the ListErrorBanner's own unrelated conditional a few lines above).
  const factoringPanelIdx = source.indexOf('<DataPanel title="Factoring Config">');
  if (factoringPanelIdx < 0) {
    failures.push(`${TARGET_FILE}: "Factoring Config" DataPanel not found -- extractor may be stale`);
  } else {
    const before = source.slice(Math.max(0, factoringPanelIdx - 400), factoringPanelIdx);
    if (!/!billingSummaryQuery\.isError\s*\?/.test(before)) {
      failures.push(
        `${TARGET_FILE}: the Factoring Config / Credit Terms / Detention+Layover economics cards are ` +
          `no longer gated on !billingSummaryQuery.isError -- a failed refetch would show retained ` +
          `factoring/credit/detention economics as if they were current`
      );
    }
  }

  // Anchor on the "Receivables Aging" HEADING TAG, not the bare phrase -- the phrase alone also
  // appears in this fix's own explanatory comment above the economics cards, which is a decoy match
  // that would make this extractor blind to a real regression right after it.
  const agingHeadingIdx = source.indexOf(">Receivables Aging</div>");
  if (agingHeadingIdx < 0) {
    failures.push(`${TARGET_FILE}: "Receivables Aging" heading not found -- extractor may be stale`);
  } else {
    const after = source.slice(agingHeadingIdx, agingHeadingIdx + 400);
    if (!/billingSummaryQuery\.isError\s*\?\s*null/.test(after)) {
      failures.push(
        `${TARGET_FILE}: the Receivables Aging card is no longer gated on billingSummaryQuery.isError -- ` +
          `a failed refetch would show retained A/R aging buckets as if they were current`
      );
    }
  }

  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  // Each fixture includes the SAME decoy phrase this fix's own explanatory comment introduces
  // ("...Receivables Aging card below...") to prove the extractor anchors on the heading tag, not
  // the bare phrase.
  const good = `
    {/* the Receivables Aging card below also needs a gate */}
    {billingSummaryQuery.isError ? (
      <ListErrorBanner />
    ) : null}
    {!billingSummaryQuery.isError ? (
      <>
        <DataPanel title="Factoring Config">card</DataPanel>
      </>
    ) : null}
    <div>
      <div>Receivables Aging</div>
      {billingSummaryQuery.isError ? null : !hasOpenInvoices ? (
        <div>empty</div>
      ) : (
        <div>aging rows</div>
      )}
    </div>
  `;
  const regressedFactoring = `
    {/* the Receivables Aging card below also needs a gate */}
    {billingSummaryQuery.isError ? (
      <ListErrorBanner />
    ) : null}
    <DataPanel title="Factoring Config">card</DataPanel>
    <div>
      <div>Receivables Aging</div>
      {billingSummaryQuery.isError ? null : !hasOpenInvoices ? (
        <div>empty</div>
      ) : (
        <div>aging rows</div>
      )}
    </div>
  `;
  const regressedAging = `
    {/* the Receivables Aging card below also needs a gate */}
    {billingSummaryQuery.isError ? (
      <ListErrorBanner />
    ) : null}
    {!billingSummaryQuery.isError ? (
      <>
        <DataPanel title="Factoring Config">card</DataPanel>
      </>
    ) : null}
    <div>
      <div>Receivables Aging</div>
      {!hasOpenInvoices ? (
        <div>empty</div>
      ) : (
        <div>aging rows</div>
      )}
    </div>
  `;

  const checks = [
    ["fully-fixed shape produces zero failures", check(good).length === 0],
    ["economics cards regressing to no gate is caught", check(regressedFactoring).some((f) => f.includes("economics cards are"))],
    ["aging card regressing to no gate is caught", check(regressedAging).some((f) => f.includes("Receivables Aging card is"))],
    ["real repo file currently satisfies this guard (no args = real file)", check().length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — customer billing-summary economics cards and aging fail closed on a failed refetch`);
}
