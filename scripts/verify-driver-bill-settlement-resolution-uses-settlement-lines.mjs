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
 *
 * FIXED (frontend consumer, 2026-09-11, INBOX-CC-1 "FROM CC-2" item): even after
 * driver-bills-list.routes.ts started returning a real, settlement_lines-resolved settlement_id
 * alongside settlement_display_id, its own consumer — LoadCostsBoardPage.tsx's driver_pay register
 * row mapping — still read the dead settled_in_settlement_id for the row's settlementId (the field
 * an EntityLink actually navigates on). The backend fix alone did not complete this surface; the
 * frontend had to be told to use the field that was already sitting right next to it.
 *   - apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx (driver_pay register mapping)
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

// ACCT-F26140 follow-up (2026-09-11): bills.routes.ts/driver-bills-list.routes.ts/cash-flow.
// service.ts now IMPORT the join from a shared module (settlement-resolution.sql.ts) instead of
// each carrying its own literal copy — the exact fix for the drift that let two of these three
// silently disagree with the register on cancelled settlements. A file that imports the shared
// predicate module is checked against the SHARED module's text, not required to re-embed the raw
// SQL tokens itself.
const SHARED_MODULE_REL_PATH = "apps/backend/src/driver-finance/settlement-resolution.sql.ts";

const FRONTEND_CONSUMER_PATH = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";

/** Pure: does the driver_pay register mapping assign settlementId from the dead column instead of
 *  the real, backend-resolved settlement_id field? */
export function frontendAssignsDeadSettlementId(src) {
  return /settlementId:\s*d\.settled_in_settlement_id/.test(src);
}

function checkFile(relPath, root) {
  const abs = `${root}/${relPath}`;
  let src;
  try {
    src = readFileSync(abs, "utf8");
  } catch {
    return `${relPath}: FILE NOT FOUND (moved/renamed? update this guard)`;
  }
  if (/from\s+"[^"]*settlement-resolution\.sql\.js"/.test(src)) {
    let shared;
    try {
      shared = readFileSync(`${root}/${SHARED_MODULE_REL_PATH}`, "utf8");
    } catch {
      return `${relPath}: imports settlement-resolution.sql.js but ${SHARED_MODULE_REL_PATH} is missing`;
    }
    if (!fileUsesSettlementLinesJoin(shared)) {
      return `${SHARED_MODULE_REL_PATH}: no settlement_lines/source_driver_bill_id join found in the shared predicate — regressed back to the dead settled_in_settlement_id column?`;
    }
    return null;
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
  const frontendCases = [
    { name: "frontend assigns dead settled_in_settlement_id — fails", src: `settlementId: d.settled_in_settlement_id,`, wantBad: true },
    { name: "frontend assigns real settlement_id — passes", src: `settlementId: d.settlement_id,`, wantBad: false },
  ];
  for (const c of frontendCases) {
    const bad = frontendAssignsDeadSettlementId(c.src);
    if (bad !== c.wantBad) {
      failed++;
      console.error(`  ✗ ${c.name}: expected bad=${c.wantBad}, got bad=${bad}`);
    } else {
      console.log(`  ok    ${c.name}`);
    }
  }

  if (failed > 0) {
    console.error(`${LABEL} --selftest FAILED (${failed} case(s))`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${cases.length + frontendCases.length}/${cases.length + frontendCases.length} cases)`);
}

if (process.argv.includes("--selftest")) {
  runSelftest();
  process.exit(0);
}

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const problems = MUST_USE_SETTLEMENT_LINES_JOIN.map((f) => checkFile(f, root)).filter(Boolean);

let frontendSrc;
try {
  frontendSrc = readFileSync(`${root}/${FRONTEND_CONSUMER_PATH}`, "utf8");
} catch {
  problems.push(`${FRONTEND_CONSUMER_PATH}: FILE NOT FOUND (moved/renamed? update this guard)`);
  frontendSrc = null;
}
if (frontendSrc && frontendAssignsDeadSettlementId(frontendSrc)) {
  problems.push(`${FRONTEND_CONSUMER_PATH}: driver_pay register still assigns settlementId from the dead settled_in_settlement_id column, not the real settlement_id field driver-bills-list.routes.ts already returns`);
}

if (problems.length > 0) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — all ${MUST_USE_SETTLEMENT_LINES_JOIN.length} known-fixed backend files still resolve settlement numbers via settlement_lines, not the dead settled_in_settlement_id column, and the frontend consumer uses the real settlement_id field.`);
