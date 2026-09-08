#!/usr/bin/env node
// NEW-08 + NEW-09 (owner raw findings dump, 2026-09-07 ~21:00Z, routed to CC-1):
//   NEW-08: "Every load leaving Laredo must be assigned a settlement number the moment it's
//     created -- Load Costs needs a Settlement # column." Live-verified: the assignment already
//     happens at booking (SET-01/SET-02, book-load.service.ts) -- this guard asserts the Load Costs
//     Board actually SURFACES that already-real linkage (settlement_info CTE + col-settlement),
//     rather than re-verifying the booking-time write path itself (already guarded elsewhere).
//   NEW-09: "unit 168 / a load already invoiced should not still be sitting in Load Costs as an
//     open item." A 2026-09-07 pass put 'invoiced' in CLOSED (not DELIVERED) reasoning
//     mdata.loads.status reaches 'invoiced' once a real invoice exists -- that pass's OWN guard
//     checked only the static CLOSED/DELIVERED array membership, which stayed green forever, but
//     never actually fixed anything: live-reconfirmed 2026-09-08 that ZERO loads system-wide ever
//     carry status='invoiced' -- nothing writes it. Load 13569 (unit T168, real SENT invoice) sat
//     in delivered_pending_docs, still an open bucket, the whole time. Real fix: load-costs-
//     board.routes.ts's invoice_info CTE computes is_invoiced from accounting.invoices directly (a
//     non-draft/non-proforma/non-void row exists), and the board's isClosed() helper checks that
//     real signal instead of trusting the status literal. This guard now asserts THAT wiring, not
//     just the array-membership shape the earlier pass checked (kept as a secondary assertion --
//     harmless, still true, but not sufficient on its own, which is exactly how this slipped through
//     once already). (The settlement-inheritance half of NEW-09 -- "load 13577 should auto-inherit
//     the same settlement number" -- was independently confirmed ALREADY WORKING live on prod: both
//     13569 and 13577 share settlement S-13727 via the existing SET-01/SET-02 tour-continuation
//     mechanism, so no code change was needed for that half.)
//
// Run: node scripts/verify-load-costs-settlement-column-and-invoiced-not-open.mjs [--selftest]
import fs from "node:fs";

const LABEL = "verify-load-costs-settlement-column-and-invoiced-not-open";
const BACKEND_ROUTE_FILE = "apps/backend/src/accounting/load-costs-board.routes.ts";
const BOARD_FILE = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";

export function backendSurfacesSettlementColumn(src) {
  return (
    /settlement_info AS \(/.test(src) &&
    /JOIN driver_finance\.settlement_lines sl ON sl\.source_driver_bill_id = db\.id/.test(src) &&
    /JOIN driver_finance\.driver_settlements ds ON ds\.id = sl\.settlement_id/.test(src) &&
    /si\.settlement_display_id,\s*si\.settlement_id/.test(src) &&
    /LEFT JOIN settlement_info si ON si\.load_id=l\.id/.test(src) &&
    /"settlement",\s*\n\s*\]\)\.default\("load"\)/.test(src)
  );
}

export function frontendHasSettlementColumn(src) {
  return (
    /key: "settlement", label: "Settlement #", testId: "col-settlement"/.test(src) &&
    /settlement_display_id: string \| null;/.test(src) &&
    /settlement_id: string \| null;/.test(src)
  );
}

export function invoicedIsClosedNotDelivered(src) {
  const closedMatch = src.match(/const CLOSED = \[([^\]]*)\];/);
  const deliveredMatch = src.match(/const DELIVERED = \[([^\]]*)\];/);
  if (!closedMatch || !deliveredMatch) return false;
  const closedHasInvoiced = /"invoiced"/.test(closedMatch[1]);
  const deliveredHasInvoiced = /"invoiced"/.test(deliveredMatch[1]);
  return closedHasInvoiced && !deliveredHasInvoiced;
}

// The REAL fix, live-behavior-checked (not just array-membership): backend computes is_invoiced from
// an actual accounting.invoices row (excluding draft/proforma/void, matching "genuinely issued"),
// and the frontend's isClosed() -- the single choke point matches() must route through -- honors it.
export function backendComputesIsInvoicedFromRealInvoices(src) {
  return (
    /invoice_info AS \(/.test(src) &&
    /FROM accounting\.invoices i/.test(src) &&
    /i\.status NOT IN \('draft', 'proforma', 'void'\)/.test(src) &&
    /COALESCE\(ii\.is_invoiced, false\) AS is_invoiced/.test(src) &&
    /LEFT JOIN invoice_info ii ON ii\.load_id=l\.id/.test(src)
  );
}

export function frontendIsClosedHonorsIsInvoiced(src) {
  return (
    /is_invoiced: boolean;/.test(src) &&
    /const isClosed = \(r: BoardRow\) => CLOSED\.includes\(r\.status\) \|\| r\.is_invoiced;/.test(src) &&
    /function matches\(r: BoardRow, f: FilterPill\)[\s\S]*?isClosed\(r\)[\s\S]*?isClosed\(r\)[\s\S]*?isClosed\(r\)/.test(src)
  );
}

function violations(backendSrc, boardSrc) {
  const errors = [];
  if (!backendSurfacesSettlementColumn(backendSrc)) errors.push("load-costs-board.routes.ts does not surface a settlement_info-backed settlement column (NEW-08)");
  if (!frontendHasSettlementColumn(boardSrc)) errors.push("LoadCostsBoardPage.tsx has no Settlement # column wired to settlement_display_id/settlement_id (NEW-08)");
  if (!invoicedIsClosedNotDelivered(boardSrc)) errors.push("'invoiced' status is not in CLOSED (or still in DELIVERED) -- shape-only check (NEW-09)");
  if (!backendComputesIsInvoicedFromRealInvoices(backendSrc)) errors.push("load-costs-board.routes.ts no longer computes is_invoiced from a real, issued accounting.invoices row (NEW-09 -- the actual fix, not just the array shape)");
  if (!frontendIsClosedHonorsIsInvoiced(boardSrc)) errors.push("LoadCostsBoardPage.tsx's isClosed()/matches() no longer honors r.is_invoiced -- an invoiced load can show as open again even though mdata.loads.status never reaches 'invoiced' (NEW-09)");
  return errors;
}

function check(backendSrc, boardSrc) {
  const errors = violations(backendSrc, boardSrc);
  if (errors.length) throw new Error(errors.join("; "));
}

const backendSrc = fs.readFileSync(BACKEND_ROUTE_FILE, "utf8");
const boardSrc = fs.readFileSync(BOARD_FILE, "utf8");

if (process.argv.includes("--selftest")) {
  let caught = 0;
  const mutations = [
    [backendSrc.replace("LEFT JOIN settlement_info si ON si.load_id=l.id", ""), boardSrc],
    [backendSrc.replace('"settlement",\n      ]).default("load"),', ']).default("load"),'), boardSrc],
    [backendSrc, boardSrc.replace('key: "settlement", label: "Settlement #", testId: "col-settlement"', 'key: "settlement_removed"')],
    [backendSrc, boardSrc.replace('const CLOSED = ["cancelled", "abandoned", "closed", "paid", "invoiced", "driver_walkoff", "driver_no_show"];', 'const CLOSED = ["cancelled", "abandoned", "closed", "paid", "driver_walkoff", "driver_no_show"];')],
    [backendSrc, boardSrc.replace('const DELIVERED = ["delivered", "delivered_pending_docs", "completed_docs_received"];', 'const DELIVERED = ["delivered", "delivered_pending_docs", "completed_docs_received", "invoiced"];').replace('const CLOSED = ["cancelled", "abandoned", "closed", "paid", "invoiced", "driver_walkoff", "driver_no_show"];', 'const CLOSED = ["cancelled", "abandoned", "closed", "paid", "driver_walkoff", "driver_no_show"];')],
    [backendSrc.replace("i.status NOT IN ('draft', 'proforma', 'void')", "i.status <> 'void'"), boardSrc],
    [backendSrc.replace("LEFT JOIN invoice_info ii ON ii.load_id=l.id\n", ""), boardSrc],
    [backendSrc, boardSrc.replace("const isClosed = (r: BoardRow) => CLOSED.includes(r.status) || r.is_invoiced;", "const isClosed = (r: BoardRow) => CLOSED.includes(r.status);")],
    [backendSrc, boardSrc.replace('if (f === "delivered_open") return DELIVERED.includes(r.status) && !isClosed(r);', 'if (f === "delivered_open") return DELIVERED.includes(r.status);')],
  ];
  for (const [b, f] of mutations) {
    try { check(b, f); }
    catch { caught += 1; continue; }
    throw new Error("a mutation escaped detection");
  }
  check(backendSrc, boardSrc);
  console.log(`${LABEL} SELFTEST PASS (${caught}/${mutations.length} planted defects caught)`);
} else {
  check(backendSrc, boardSrc);
  console.log(`${LABEL} PASS -- Settlement # column surfaced from real driver_finance linkage; 'invoiced' loads no longer count as open`);
}
