#!/usr/bin/env node
/**
 * verify-settlement-net-pay-triple-figure-fixed — a driver settlement detail page must show ONE
 * net-pay figure, not three.
 *
 * Live defect (Jorge, Chrome walkthrough of S-13644, 2026-09-08): the same closed settlement
 * rendered $2,015.11 (TourSettlementTab top card), $2,409.44 (NetPaySummary bottom card), and the
 * true stored figure $1,802.86 (driver_finance.driver_settlements.net_pay). Three independent
 * causes, asserted statically below so none can silently regress:
 *
 * 1. SettlementDetailPage.tsx must feed money-math (earnings/deadhead/extra/reimbursements/
 *    deductions) from a voided-line-filtered array, never the raw unfiltered `lines`.
 * 2. toDeductionRows() must include line_type 'escrow_contribution', not just 'deduction'.
 * 3. TourSettlementTab.tsx must not add reimbursements_cents to `net` unconditionally at render —
 *    a CLOSED settlement's ds.net_cents already has them baked in.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-net-pay-triple-figure-fixed";
const DETAIL_PAGE = "apps/frontend/src/pages/driver-finance/SettlementStatementWorkflowPage.tsx";
// Line-map helpers may live in a sibling file (extracted refactor); guard checks both locations.
const LINE_MAPS_FILE = "apps/frontend/src/pages/driver-finance/settlementDetailLineMaps.ts";
const TOUR_TAB = "apps/frontend/src/components/dispatch/TourSettlementTab.tsx";

function assertDetailPage(src) {
  const errors = [];

  // (1) money-math must read from activeLines (voided-filtered), never straight off `lines`.
  // The filtering may happen either inline or via buildSettlementLineViews(activeLines, ...).
  const usesActiveLines =
    /buildSettlementLineViews\(\s*activeLines\b/.test(src) ||
    (/const earnings = (\w+)\.filter/.test(src) && !/const earnings = lines\.filter/.test(src));
  if (!usesActiveLines) {
    errors.push(`${DETAIL_PAGE}: money-math must pass activeLines (voided-filtered) to buildSettlementLineViews or individual filters — not the raw 'lines' array.`);
  }

  // The voided-filter array must exist somewhere in this file.
  if (!/\.filter\(\(line\) => !line\.voided_at && line\.is_active !== false\)/.test(src)) {
    errors.push(`${DETAIL_PAGE}: no array filters out voided_at/is_active===false lines before feeding money math.`);
  }

  // (2) toDeductionRows may have been extracted to settlementDetailLineMaps.ts — checked there.
  // But if it is still inline, verify it includes escrow_contribution.
  const inlineMatch = src.match(/function toDeductionRows\([\s\S]*?\n\s*\}/);
  if (inlineMatch) {
    const body = inlineMatch[0];
    if (!/escrow_contribution/.test(body)) {
      errors.push(`${DETAIL_PAGE}: inline toDeductionRows() no longer includes 'escrow_contribution' — the missing-$25-deduction regression would return.`);
    }
    if (!/["']deduction["']/.test(body)) {
      errors.push(`${DETAIL_PAGE}: inline toDeductionRows() no longer includes 'deduction' — that's the primary deduction line_type.`);
    }
  }

  return errors;
}

function assertLineMapsFile(src) {
  const errors = [];
  // toDeductionRows (whether inline or in the extracted helper) must include both line_types.
  const match = src.match(/function toDeductionRows\([\s\S]*?\n\s*\}/);
  if (!match) {
    // May not be defined here — that's fine (it could be inline).
    return errors;
  }
  const body = match[0];
  if (!/escrow_contribution/.test(body)) {
    errors.push(`${LINE_MAPS_FILE}: toDeductionRows() no longer includes 'escrow_contribution' — the missing-$25-deduction regression would return.`);
  }
  if (!/["']deduction["']/.test(body)) {
    errors.push(`${LINE_MAPS_FILE}: toDeductionRows() no longer includes 'deduction' — that's the primary deduction line_type.`);
  }
  return errors;
}

function assertTourTab(src) {
  const errors = [];
  // The rendered net-pay row must NOT be `net + (ds.reimbursements_cents || 0)` unconditionally —
  // that double-adds reimbursements for a closed settlement (ds.net_cents already includes them).
  if (/data-testid="driver-net">\{money\(net \+ \(ds\.reimbursements_cents \|\| 0\)/.test(src)) {
    errors.push(
      `${TOUR_TAB}: the driver-net row still renders "net + reimbursements_cents" directly — this double-counts reimbursements for a CLOSED settlement, whose ds.net_cents already includes them.`
    );
  }
  // Expect a variable that conditions the reimbursements addition on t.is_open (only add once, on
  // the open-tour branch where `net` doesn't yet include them).
  if (!/t\.is_open \? net \+ \(ds\.reimbursements_cents \|\| 0\) : net/.test(src)) {
    errors.push(
      `${TOUR_TAB}: expected a net-pay variable that adds reimbursements only when t.is_open (open tours' derived \`net\` excludes them; closed settlements' stored net_cents already includes them).`
    );
  }
  return errors;
}

function selftest() {
  // bad: uses raw `lines` with no voided filter and no buildSettlementLineViews
  const badDetail = `
    const lines = (settlement.lines as any) ?? [];
    const earnings = lines.filter((line) => String(line.line_type) === "earnings").map((line) => ({}));
  `;
  const badErrors = assertDetailPage(badDetail);
  if (badErrors.length === 0) throw new Error(`${LABEL} selftest: expected bad detail-page source to fail`);

  // good: uses buildSettlementLineViews(activeLines, ...) with the voided filter present
  const goodDetail = `
    const lines = (settlement.lines as any) ?? [];
    const activeLines = lines.filter((line) => !line.voided_at && line.is_active !== false);
    const { earnings, deadhead, extraWithSeq, reimbursementsWithSeq, deductionsWithSeq } = useMemo(
      () => buildSettlementLineViews(activeLines, settlementDisplayId),
      [activeLines, settlementDisplayId]
    );
  `;
  const goodErrors = assertDetailPage(goodDetail);
  if (goodErrors.length !== 0) throw new Error(`${LABEL} selftest: expected good detail-page source to pass, got: ${goodErrors.join("; ")}`);

  // line-maps file: toDeductionRows must include both types
  const badMaps = `
    export function toDeductionRows(lines) {
      return lines.filter((line) => String(line.line_type) === "deduction").map((x) => x);
    }
  `;
  const badMapsErrors = assertLineMapsFile(badMaps);
  if (badMapsErrors.length === 0) throw new Error(`${LABEL} selftest: expected bad line-maps source to fail`);

  const goodMaps = `
    export function toDeductionRows(lines) {
      return lines.filter((line) => ["deduction", "escrow_contribution"].includes(String(line.line_type))).map((x) => x);
    }
  `;
  const goodMapsErrors = assertLineMapsFile(goodMaps);
  if (goodMapsErrors.length !== 0) throw new Error(`${LABEL} selftest: expected good line-maps source to pass, got: ${goodMapsErrors.join("; ")}`);

  const badTour = `
    const net = t.is_open ? gross - ds.escrow_cents - ds.recoveries_cents : ds.net_cents;
    <span data-testid="driver-net">{money(net + (ds.reimbursements_cents || 0), currencyCode)}</span>
  `;
  const badTourErrors = assertTourTab(badTour);
  if (badTourErrors.length === 0) throw new Error(`${LABEL} selftest: expected bad tour-tab source to fail`);

  const goodTour = `
    const net = t.is_open ? gross - ds.escrow_cents - ds.recoveries_cents : ds.net_cents;
    const netTotal = t.is_open ? net + (ds.reimbursements_cents || 0) : net;
    <span data-testid="driver-net">{money(netTotal, currencyCode)}</span>
  `;
  const goodTourErrors = assertTourTab(goodTour);
  if (goodTourErrors.length !== 0) throw new Error(`${LABEL} selftest: expected good tour-tab source to pass, got: ${goodTourErrors.join("; ")}`);

  console.log(`${LABEL}: selftest OK`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const detailSrc = fs.readFileSync(path.join(ROOT, DETAIL_PAGE), "utf8");
  const tourSrc = fs.readFileSync(path.join(ROOT, TOUR_TAB), "utf8");
  const lineMapsPath = path.join(ROOT, LINE_MAPS_FILE);
  const lineMapsErrors = fs.existsSync(lineMapsPath)
    ? assertLineMapsFile(fs.readFileSync(lineMapsPath, "utf8"))
    : [];
  const errors = [...assertDetailPage(detailSrc), ...assertTourTab(tourSrc), ...lineMapsErrors];
  if (errors.length) {
    console.error(`${LABEL}: FAIL`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS`);
}

main();
