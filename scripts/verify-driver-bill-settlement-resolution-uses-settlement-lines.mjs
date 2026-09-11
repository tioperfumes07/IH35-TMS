#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["data_integrity","settlement_resolution"],"leafRe":"^accounting\\.parity\\.bills_settlement_column$","task":"ACCT-F26140-BILLS-SETTLEMENT-COLUMN"} */
/**
 * ACCT-F26140 — driver bill / load settlement-number resolution must go through
 * driver_finance.settlement_lines, never the dead driver_finance.driver_bills.settled_in_settlement_id
 * column (live-verified 0/94 populated company-wide before this fix, and the pattern already
 * documented in apps/backend/src/accounting/load-cost-rollup.sql.ts's own NEW-23 comment: the real
 * settlement is assigned at BOOKING time into settlement_lines via source_driver_bill_id, in the
 * same transaction that creates the load's driver bill — settled_in_settlement_id is stamped only
 * when a bill is fully closed/paid, far later, and 0/many populated in practice).
 *
 * This guard is a STATIC source check, not a live DB check — it greps the known-fixed files (and
 * fails on any OTHER file this repo introduces that reads settled_in_settlement_id as its ONLY
 * signal for resolving/gating a settlement number or "is this bill settled" question) to lock the
 * fix in place. Files that legitimately keep the raw column (as a secondary/audit signal alongside
 * the real settlement_lines join, or genuinely unused/pass-through) are allowlisted below with the
 * reason.
 *
 * FIXED (must show a settlement_lines-based join, not a bare settled_in_settlement_id join/filter):
 *   - apps/backend/src/accounting/bills.routes.ts (the /register handler feeding BillsPage.tsx)
 *   - apps/backend/src/driver-finance/driver-bills-list.routes.ts (feeds LoadCostsBoardPage.tsx's
 *     driver_pay rows)
 *   - apps/backend/src/cash-flow/cash-flow.service.ts (rolling-ledger driver_bills section)
 *
 * ALSO FIXED — a related but distinct defect class, found by the system-wide BUG-3 sweep: NOT the
 * dead column, but a bookend-only (first_load_id OR last_load_id) settlement join with no
 * settlement_lines fallback, which silently misses any load that is a MIDDLE leg of a multi-load
 * settlement. Same "must show a settlement_lines join" assertion applies:
 *   - apps/backend/src/accounting/bills.service.ts (listBillsByVendor + listAllBillsForCompany —
 *     feeds Vendors.tsx's transaction-drill table and BillsPage.tsx's vendor-bill rows)
 *   - apps/backend/src/mdata/customer-invoices.routes.ts (feeds Customers.tsx's transaction-drill
 *     table)
 *
 * ALREADY CORRECT (union both settled_in_settlement_id AND settlement_lines, never gate on the
 * dead column alone — confirmed by the owner's own packet, not re-diagnosed here):
 *   - apps/backend/src/accounting/settlement-posting/settlement-bill-payment-posting.service.ts
 *   - apps/backend/src/driver-finance/settlement-historical-attribution.service.ts
 *
 * KNOWN-INERT (selects settled_in_settlement_id but never reads/renders it — zero behavioral
 * effect; not touched, flagged so a future guard-tightening pass can clean them up deliberately):
 *   - apps/backend/src/accounting/void-tree.service.ts
 *   - apps/backend/src/driver-finance/tour-readout.routes.ts (and its frontend pass-through,
 *     apps/frontend/src/api/tourReadout.ts — confirmed no consumer renders the field)
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-driver-bill-settlement-resolution-uses-settlement-lines";

const MUST_USE_SETTLEMENT_LINES_JOIN = [
  "apps/backend/src/accounting/bills.routes.ts",
  "apps/backend/src/driver-finance/driver-bills-list.routes.ts",
  "apps/backend/src/cash-flow/cash-flow.service.ts",
  "apps/backend/src/accounting/bills.service.ts",
  "apps/backend/src/mdata/customer-invoices.routes.ts",
];

// A file passes if, wherever it references settled_in_settlement_id, it ALSO contains a real
// settlement_lines-based resolution nearby (join or NOT EXISTS/EXISTS check against
// source_driver_bill_id) — i.e. the dead column is at most a passthrough/secondary field, never
// the ONLY thing a settlement number or "is settled" decision is computed from.
function fileUsesSettlementLinesJoin(src) {
  return /settlement_lines[\s\S]{0,400}source_driver_bill_id|source_driver_bill_id[\s\S]{0,400}settlement_lines/.test(src);
}

function checkFile(relPath, root) {
  const abs = `${root}/${relPath}`;
  let src;
  try {
    src = readFileSync(abs, "utf8");
  } catch {
    return `${relPath}: FILE NOT FOUND (moved/renamed? update this guard)`;
  }
  if (!fileUsesSettlementLinesJoin(src)) {
    return `${relPath}: no settlement_lines/source_driver_bill_id join found — regressed back to the dead settled_in_settlement_id column?`;
  }
  return null;
}

function runSelftest() {
  const cases = [
    {
      name: "file with a real settlement_lines join — passes",
      src: `SELECT ds.display_id FROM driver_finance.settlement_lines sl JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id WHERE sl.source_driver_bill_id = db.id`,
      wantOk: true,
    },
    {
      name: "file with ONLY the dead column join — fails",
      src: `LEFT JOIN driver_finance.driver_settlements ds ON ds.id = db.settled_in_settlement_id`,
      wantOk: false,
    },
    {
      name: "file with the NOT EXISTS filter form — passes",
      src: `AND NOT EXISTS (SELECT 1 FROM driver_finance.settlement_lines sl2 WHERE sl2.source_driver_bill_id = db.id)`,
      wantOk: true,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const ok = fileUsesSettlementLinesJoin(c.src);
    if (ok !== c.wantOk) {
      failed++;
      console.error(`  ✗ ${c.name}: expected ok=${c.wantOk}, got ok=${ok}`);
    } else {
      console.log(`  ok    ${c.name}`);
    }
  }
  if (failed > 0) {
    console.error(`${LABEL} --selftest FAILED (${failed} case(s))`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${cases.length}/${cases.length} cases)`);
}

if (process.argv.includes("--selftest")) {
  runSelftest();
  process.exit(0);
}

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const problems = MUST_USE_SETTLEMENT_LINES_JOIN.map((f) => checkFile(f, root)).filter(Boolean);
if (problems.length > 0) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — all ${MUST_USE_SETTLEMENT_LINES_JOIN.length} known-fixed files still resolve settlement numbers via settlement_lines, not the dead settled_in_settlement_id column.`);
