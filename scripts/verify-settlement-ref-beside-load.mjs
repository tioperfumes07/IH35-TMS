#!/usr/bin/env node
// ALL-SEATS LAW (owner, 2026-09-13, verbatim): "in every window where we have a load number, we
// must also have a column with a pre-settlement, or settlement or tour number." CC-2 authors this
// guard because CC-2 authors <SettlementRefCell> — all three seats register their own converted
// surfaces here as they land (CC-1: 5 Accounting + Cash Flow; CC-2: 11 Driver/Finance + 2 Fuel;
// CC-3: 6 Dispatch + 5 Safety/Insurance + 5 Fleet/Reports/Docs).
//
// Fails when:
//   1) A registered surface (SURFACES) renders its load-number column without also rendering
//      SettlementRefCell (or importing the canonical settlementNumber.ts helper directly, for a
//      surface that composes the cell's logic manually).
//   2) ANY file under apps/frontend/src renders `display_id` in a context that names it a
//      "settlement" — driver_finance.driver_settlements.display_id (the retired internal
//      S-YYYY-NNNN counter) must NEVER be the human-visible settlement/tour number; only
//      source_document_ref may render.
//
// The registry starts EMPTY in this PR (which ships the shared component + guard alone, per the
// Lead's own build order — "ship these BEFORE your own 13 surfaces"); each seat extends SURFACES
// as their own conversions land.
//
// CC-2's own 13 surfaces (11 Driver/Finance + 2 Fuel) landed in the CC-2-settlement-ref-sweep-1 PR.
// DriverInbox.tsx (one of the originally-assigned 13) is NOT registered: read in full, it never
// renders a load number at all today (only "Cash advances" has a real backend; "Load updates" is an
// honest empty state per its own header comment) — there is no load-number column to put a
// settlement column beside, and registering it would fail auditRegisteredSurfaces' own
// loadNumberNeedle check.
//
// DISCLOSED CROSS-SEAT FINDING (2026-09-12, CC-2): apps/frontend/src/components/settlements/
// SettlementReferenceCell.tsx + hooks/useSettlementReferences.ts + api/driverFinance.ts's
// getSettlementReferences() is a SECOND, independently-built implementation of this exact law —
// verified by reading it line-by-line: "Not on a tour" (no id), "Open" (presettlement, no label),
// a bare "—" (closed settlement, no source_document_ref yet), and a real deep link, all sourced from
// settlements.routes.ts's source_document_ref (never the retired display_id, despite the confusingly
//-named settlement_display_id/presettlement_display_id response fields — traced to
// driver-finance/settlements.routes.ts:190, the value is source_document_ref). It already covers ~11
// other surfaces spanning what look like CC-1's accounting (RevenueRecognitionPage) and CC-3's
// dispatch/factoring/reports assignments (SubmissionQueue, FactoringQueuePage, DetentionBoardPage,
// PodReviewPage, InTransitIssuesPage, AssignmentHistoryPage, BorderCrossingHistory, LoadsPlanner,
// InvoiceSearchReportPage, DispatchMarginPage). Not consolidated here — those are other seats' files
// (never edit another seat's file without coordination) — but SETTLEMENT_CELL_RE below accepts it as
// an equally-valid marker so those surfaces can register once their owning seat confirms, rather
// than forcing a risky rip-and-replace across 11 files this PR didn't touch. Posted to the Lead/
// OUTBOX for a canonical-component decision; EscrowDeductionsPendingTab.tsx (CC-2's own file, already
// using this second component) is registered below as-is, unmodified.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND_SRC = path.join(ROOT, "apps", "frontend", "src");

// { file, loadNumberNeedle: RegExp, note }. loadNumberNeedle proves the surface actually renders a
// load-number column (so this guard is meaningful for it); a converted surface must ALSO match
// SETTLEMENT_CELL_RE somewhere in the same file.
export const SURFACES = [
  // CC-2 — 11 Driver/Finance + 1 Fuel surface (DriverInbox.tsx, the other originally-assigned Fuel
  // surface, is not registered — see the disclosure above).
  { file: "apps/frontend/src/pages/driver-finance/DriverBillDetailPage.tsx", loadNumberNeedle: /bill\.load_number/ },
  { file: "apps/frontend/src/pages/driver-finance/EscrowDeductionsPendingTab.tsx", loadNumberNeedle: /row\.load_number/ },
  { file: "apps/frontend/src/pages/driver-finance/components/DeadheadPaySection.tsx", loadNumberNeedle: /line\.load_number/ },
  { file: "apps/frontend/src/pages/driver-finance/components/DeductionsSection.tsx", loadNumberNeedle: /row\.load_number/ },
  { file: "apps/frontend/src/pages/driver-finance/components/EarningsSection.tsx", loadNumberNeedle: /line\.load_number/ },
  { file: "apps/frontend/src/pages/driver-finance/components/ExtraPaySection.tsx", loadNumberNeedle: /line\.load_number/ },
  { file: "apps/frontend/src/pages/driver-finance/components/ReimbursementsSection.tsx", loadNumberNeedle: /line\.load_number/ },
  { file: "apps/frontend/src/pages/driver-finance/components/SettlementLoadsSection.tsx", loadNumberNeedle: /l\.load_number/ },
  { file: "apps/frontend/src/components/driver-profile/LoadsSection.tsx", loadNumberNeedle: /row\.load_number/ },
  { file: "apps/frontend/src/components/drivers/LoadHistoryTab.tsx", loadNumberNeedle: /row\.load_number/ },
  { file: "apps/frontend/src/pages/fuel/FuelTransactionsTable.tsx", loadNumberNeedle: /row\.load_number/ },
  { file: "apps/frontend/src/pages/fuel/components/ActiveTripStrip.tsx", loadNumberNeedle: /load_display_id/ },
  // CC-3 — 6 Dispatch surfaces. DetentionBoardPage/InTransitIssuesPage/PodReviewPage already carried
  // a settlement column before this law (via the pre-existing SettlementReferenceCell +
  // useSettlementReferences pattern, its own systemwide guard verify-settlement-presettlement-column-
  // systemwide.mjs) and are registered there, not duplicated here, to avoid two guards asserting the
  // same fact about the same file. TourLegsCell.tsx is the LOAD side of an already-compliant pairing
  // on its own 2 real consumer pages (SettlementsToursRegister.tsx, LoadCostsBoardPage.tsx) and is not
  // a target. documents/UploadModal.tsx is a pure upload form with no load-number display at all.
  { file: "apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx", loadNumberNeedle: /key: "load_number"/ },
  { file: "apps/frontend/src/components/dispatch/DispatchKanban.tsx", loadNumberNeedle: /cardPrimaryLabel\(load\)|cardSecondaryLoadNumber\(load\)/ },
  // CC-3 — 5 Safety/Insurance surfaces.
  { file: "apps/frontend/src/pages/safety/AccidentsPage.tsx", loadNumberNeedle: /key: "load_id"/ },
  { file: "apps/frontend/src/pages/safety/InternalFinesPage.tsx", loadNumberNeedle: /key: "related_load_id"/ },
  { file: "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx", loadNumberNeedle: /key: "related_load_id"/ },
  { file: "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx", loadNumberNeedle: /key: "load_id"/ },
  { file: "apps/frontend/src/pages/insurance/ClaimsTab.tsx", loadNumberNeedle: /key: "load_id"/ },
  // CC-3 — 5 Fleet/Reports/Docs surfaces (Documents.tsx converted conditionally — the cell only
  // appears when a row's own link happens to be load-typed, per that page's generic multi-entity
  // shape; still registered here since the file does render a load-number-carrying label).
  { file: "apps/frontend/src/components/vehicle-profile/UnitMaintenanceHistorySection.tsx", loadNumberNeedle: /key: "load_number"/ },
  { file: "apps/frontend/src/pages/units/UnitDriverHistoryStrip.tsx", loadNumberNeedle: /key: "load_number"/ },
  { file: "apps/frontend/src/components/reports/LaneDetailModal.tsx", loadNumberNeedle: /key: "load_number"/ },
  { file: "apps/frontend/src/pages/Documents.tsx", loadNumberNeedle: /docsFileEntityLabel/ },
  // CC-1 — 5 Accounting surfaces + 1 Cash Flow surface (A4, 2026-09-13).
  { file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx", loadNumberNeedle: /key: "load_number"/ },
  { file: "apps/frontend/src/pages/accounting/InvoicesListPage.tsx", loadNumberNeedle: /key: "source_load_id"/ },
  { file: "apps/frontend/src/pages/accounting/BillDetailPage.tsx", loadNumberNeedle: /key: "load_id"/ },
  // AbandonmentQueuePage.tsx already carried a "Settlement" column beside its "Load" column before
  // this law (applied_to_settlement_id / settlement_display_id) -- the backend already aliases
  // settlement_display_id FROM source_document_ref (abandonment.routes.ts), so the value was always
  // law-compliant; only the render was rewired through the canonical settlementLabel() helper here
  // so this guard can see it, without changing which settlement is shown (the chargeback's own
  // applied-to settlement, not necessarily the load's current tour -- a deliberately different fact
  // from what SettlementRefCell resolves).
  { file: "apps/frontend/src/pages/accounting/AbandonmentQueuePage.tsx", loadNumberNeedle: /key: "load_id"/ },
  // RevenueRecognitionPage.tsx already satisfied this law before it existed -- CC-2 found it uses
  // SettlementReferenceCell (the disclosed second implementation) + useSettlementReferences,
  // verified line-by-line correct (source_document_ref, never display_id). Registered here with
  // zero code changes, per CC-2's own note in docs/bus/INBOX-CC-1.md.
  { file: "apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx", loadNumberNeedle: /key: "load"/ },
  { file: "apps/frontend/src/pages/cash-flow/tabs/RollingLedgerTab.tsx", loadNumberNeedle: /key: "load"/ },
];

// SettlementReferenceCell — see the disclosed cross-seat finding above: a second, independently-
// built, functionally-equivalent implementation of the identical 4-state rule. Accepted here rather
// than forcing every one of its ~11 existing consumers to migrate before they can register.
const SETTLEMENT_CELL_RE = /<SettlementRefCell\b|<SettlementReferenceCell\b|settlementLabel\s*\(|settlementNumber\s*\(/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.tsx") && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function relFile(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join("/");
}

export function auditRegisteredSurfaces() {
  const failures = [];
  for (const s of SURFACES) {
    const full = path.join(ROOT, s.file);
    if (!fs.existsSync(full)) {
      failures.push(`${s.file}: registered surface no longer exists — remove it from SURFACES if intentional`);
      continue;
    }
    const src = fs.readFileSync(full, "utf8");
    if (!s.loadNumberNeedle.test(src)) {
      failures.push(`${s.file}: registered surface no longer matches its own loadNumberNeedle — fixture/guard out of sync`);
      continue;
    }
    if (!SETTLEMENT_CELL_RE.test(src)) {
      failures.push(`${s.file}: renders a load number but never renders <SettlementRefCell> / settlementLabel() / settlementNumber() — every load-number column needs a settlement/tour column beside it`);
    }
  }
  return failures;
}

/** driver_finance.driver_settlements.display_id (S-YYYY-NNNN) must never be the human-visible
 * settlement number — only source_document_ref may render. Scoped to JSX-rendered expressions
 * that name themselves "settlement" AND access `.display_id`, so an unrelated entity's own
 * legitimate display_id (an invoice, a bill) is not falsely flagged. */
function findDisplayIdAsSettlementNumber(src) {
  const hits = [];
  const re = /\{[^{}]*settlement[a-zA-Z_]*\.display_id[^{}]*\}/gi;
  let m;
  while ((m = re.exec(src))) hits.push(m[0]);
  return hits;
}

export function auditNoDisplayIdAsSettlementNumber(files) {
  const failures = [];
  for (const abs of files) {
    const src = fs.readFileSync(abs, "utf8");
    const hits = findDisplayIdAsSettlementNumber(src);
    if (hits.length > 0) {
      failures.push(`${relFile(abs)}: renders a settlement's display_id as a user-visible number (${hits[0]}) — only source_document_ref may render (settlementNumber.ts)`);
    }
  }
  return failures;
}

function auditAll() {
  const files = walk(FRONTEND_SRC);
  return [...auditRegisteredSurfaces(), ...auditNoDisplayIdAsSettlementNumber(files)];
}

function run() {
  const failures = auditAll();
  if (failures.length > 0) {
    console.error("verify-settlement-ref-beside-load FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(
    `verify-settlement-ref-beside-load OK — ${SURFACES.length} registered surface(s) all render SettlementRefCell/settlementLabel beside their load number, 0 files render a settlement's display_id as a user-visible number.`
  );
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  assert.equal(auditAll().length, 0, "all checks should pass on real source (empty registry, no real display_id-as-settlement violations)");

  // MUTATION 1 — a registered surface that renders a load number but never SettlementRefCell.
  const tmpDir = fs.mkdtempSync(path.join(ROOT, ".tmp-settlement-ref-selftest-"));
  try {
    const f1 = path.join(tmpDir, "NoSettlementColumn.tsx");
    fs.writeFileSync(f1, `export const x = <span>{row.load_number}</span>;\n`);
    const fakeSurfaces = [{ file: path.relative(ROOT, f1).split(path.sep).join("/"), loadNumberNeedle: /row\.load_number/ }];
    const failures1 = (function auditWith(surfaces) {
      const fs2 = [];
      for (const s of surfaces) {
        const full = path.join(ROOT, s.file);
        const src = fs.readFileSync(full, "utf8");
        if (!s.loadNumberNeedle.test(src)) continue;
        if (!SETTLEMENT_CELL_RE.test(src)) fs2.push(`${s.file}: missing SettlementRefCell`);
      }
      return fs2;
    })(fakeSurfaces);
    assert.ok(failures1.length > 0, "MUTATION 1 (load number rendered with no settlement cell) escaped detection");

    // MUTATION 2 — settlement.display_id rendered as a user-visible number.
    const f2 = path.join(tmpDir, "RogueSettlementDisplay.tsx");
    fs.writeFileSync(f2, `export const x = <span>{settlement.display_id}</span>;\n`);
    assert.ok(auditNoDisplayIdAsSettlementNumber([f2]).length > 0, "MUTATION 2 (settlement.display_id rendered) escaped detection");

    // MUTATION 3 — an unrelated entity's own display_id must NOT be falsely flagged.
    const f3 = path.join(tmpDir, "InvoiceRow.tsx");
    fs.writeFileSync(f3, `export const x = <span>{invoice.display_id}</span>;\n`);
    assert.equal(auditNoDisplayIdAsSettlementNumber([f3]).length, 0, "MUTATION 3 false-positived on an unrelated entity's own display_id");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log("verify-settlement-ref-beside-load --selftest PASS (3/3 mutations caught)");
  process.exit(0);
}

run();
