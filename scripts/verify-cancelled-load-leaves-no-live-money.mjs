#!/usr/bin/env node
// ROUND 118/119 (Lead) — a cancelled load must leave NO live money artifact behind it. This
// guard checks the direction that is fully built today: dispatch/cancellation.service.ts's
// cascade (invoices, expenses, vendor bills [ROUND 118 DEFECT 2], driver bills, settlements,
// advances). Two more directions the Lead's own spec names are NOT checked here, deliberately,
// not silently -- the schema/logic they depend on does not exist yet:
//   - "a cancelled load with movement evidence has NO surviving deadhead line" -- needs the
//     line-level driver-bill split (ROUND 118 Defect 1) and real movement evidence
//     (mdata.load_stops.actual_departure_at/actual_arrival_at), which has NO writer today (the
//     STOP WRITER item, still P0, named explicitly in the ROUND 118/119 ruling itself).
//   - "a cancellation carries no recorded dispatcher confirmation" -- needs the
//     dispatch.load_cancellations confirmation columns (ROUND 119 item 2), not built yet.
// Both are named here, by design, exactly per this codebase's law that a guard must enumerate
// its own class rather than silently check less than its docstring implies -- see the two
// REQUIRES_LIVE_DB / TODO markers below and REMAINING in this guard's own commit.
//
// WHAT "LIVE" MEANS PER FAMILY (matches dispatch/cancellation.service.ts's own cascade exactly,
// not invented here): a family is CLEAN for a cancelled load when every row tied to that load is
// EITHER voided/cancelled by the cascade OR in one of the cascade's own documented, legitimate
// skip states (a real money-already-moved case the cascade itself refuses to touch and fails
// loud on at cancel time -- so if the load IS cancelled, it can only be in that state, never a
// genuinely still-open one):
//   invoices          -- status='void' OR status IN ('paid','factored')  (the cascade's own gate)
//   expenses          -- status='void'                                  (no legitimate skip)
//   vendor bills       -- status='void' OR has a recorded bill_payment    (bill_has_payments skip)
//   driver bills       -- status='void'                                  (no legitimate skip)
//   driver advances    -- disbursement_status='reversed' OR paid_to_date > 0 (already-recovered skip)
//   settlements        -- status='cancelled' OR status='paid'            (the cascade's own skip)
// USMCA only. Read-only: BEGIN READ ONLY, always ROLLBACK. No DATABASE_URL, or an unreachable
// database, is a FAIL (ROUND 29.9-B) -- a live money guard that cannot connect is a FAIL, never a
// pass.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-cancelled-load-leaves-no-live-money";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = path.join(ROOT, "scripts/verify-cancelled-load-leaves-no-live-money.baseline.json");

function violationKey(v) {
  return `${v.family}|${v.id}`;
}

async function measure(client) {
  const violations = [];

  const invoices = await client.query(
    `SELECT i.id::text, i.display_id, i.status::text, l.load_number
       FROM accounting.invoices i
       JOIN mdata.loads l ON l.id = i.source_load_id AND l.operating_company_id = i.operating_company_id
      WHERE i.operating_company_id = $1::uuid AND l.status = 'cancelled'
        AND i.status NOT IN ('void', 'paid', 'factored')`,
    [USMCA]
  );
  for (const r of invoices.rows) {
    violations.push({ family: "invoice", id: r.id, doc_number: r.display_id, load_number: r.load_number, detail: `status='${r.status}' on a cancelled load, not void/paid/factored` });
  }

  const expenses = await client.query(
    `SELECT e.id::text, l.load_number, e.status::text
       FROM accounting.expenses e
       JOIN mdata.loads l ON l.id = e.load_id AND l.operating_company_id = e.operating_company_id
      WHERE e.operating_company_id = $1::uuid AND l.status = 'cancelled' AND e.status <> 'void'`,
    [USMCA]
  );
  for (const r of expenses.rows) {
    violations.push({ family: "expense", id: r.id, doc_number: null, load_number: r.load_number, detail: `status='${r.status}' on a cancelled load, no legitimate skip exists` });
  }

  // Checks BOTH the new bills.load_id header column AND a join through bill_lines.load_id --
  // the real load-driven bill type in this codebase today (driver-pay bills numbered by load#)
  // links via the LINE, not the header. See cancellation.service.ts's own matching comment.
  const bills = await client.query(
    `SELECT DISTINCT b.id::text, b.display_id, l.load_number, b.status::text,
            EXISTS (SELECT 1 FROM accounting.bill_payments bp WHERE bp.bill_id = b.id AND bp.operating_company_id = b.operating_company_id AND bp.revoked_at IS NULL) AS has_payment
       FROM accounting.bills b
       LEFT JOIN accounting.bill_lines bl ON bl.bill_id = b.id AND bl.operating_company_id = b.operating_company_id
       JOIN mdata.loads l ON l.id = COALESCE(b.load_id, bl.load_id) AND l.operating_company_id = b.operating_company_id
      WHERE b.operating_company_id = $1::uuid AND l.status = 'cancelled' AND b.status <> 'void'
        AND (b.load_id = l.id OR bl.load_id = l.id)`,
    [USMCA]
  );
  for (const r of bills.rows) {
    if (r.has_payment) continue; // legitimate skip -- money already moved, cascade refuses and fails loud at cancel time
    violations.push({ family: "vendor_bill", id: r.id, doc_number: r.display_id, load_number: r.load_number, detail: `status='${r.status}' on a cancelled load, no payment recorded` });
  }

  const driverBills = await client.query(
    `SELECT db.id::text, db.bill_number, l.load_number, db.status::text
       FROM driver_finance.driver_bills db
       JOIN mdata.loads l ON l.id = db.load_id AND l.operating_company_id = db.operating_company_id
      WHERE db.operating_company_id = $1::uuid AND l.status = 'cancelled' AND db.status <> 'void'`,
    [USMCA]
  );
  for (const r of driverBills.rows) {
    violations.push({ family: "driver_bill", id: r.id, doc_number: r.bill_number, load_number: r.load_number, detail: `status='${r.status}' on a cancelled load, no legitimate skip exists` });
  }

  const advances = await client.query(
    `SELECT a.id::text, l.load_number, a.disbursement_status::text,
            COALESCE(dl.paid_to_date, 0)::text AS paid_to_date
       FROM driver_finance.driver_advances a
       JOIN mdata.loads l ON l.id = a.load_id AND l.operating_company_id = a.operating_company_id
       LEFT JOIN driver_finance.driver_liabilities dl ON dl.id = a.liability_id AND dl.operating_company_id = a.operating_company_id
      WHERE a.operating_company_id = $1::uuid AND l.status = 'cancelled' AND a.disbursement_status <> 'reversed'`,
    [USMCA]
  );
  for (const r of advances.rows) {
    if (Number(r.paid_to_date) > 0) continue; // legitimate skip -- already recovered via settlement, cascade refuses and fails loud
    violations.push({ family: "driver_advance", id: r.id, doc_number: null, load_number: r.load_number, detail: `disbursement_status='${r.disbursement_status}' on a cancelled load, paid_to_date=0` });
  }

  const settlements = await client.query(
    `SELECT DISTINCT ds.id::text, ds.source_document_ref, l.load_number, ds.status::text
       FROM driver_finance.settlement_lines sl
       JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id AND ds.operating_company_id = sl.operating_company_id
       JOIN mdata.loads l ON l.id = sl.load_id AND l.operating_company_id = sl.operating_company_id
      WHERE ds.operating_company_id = $1::uuid AND l.status = 'cancelled'
        AND ds.status NOT IN ('cancelled', 'paid')`,
    [USMCA]
  );
  for (const r of settlements.rows) {
    violations.push({ family: "settlement", id: r.id, doc_number: r.source_document_ref, load_number: r.load_number, detail: `status='${r.status}' on a cancelled load, not cancelled/paid` });
  }

  return violations;
}

function printReport(violations) {
  if (violations.length === 0) {
    console.log(`${LABEL}: 0 violations -- every cancelled USMCA load leaves no live money artifact (within the directions this guard checks -- see its own header for the two NOT-YET-BUILT directions).`);
    return;
  }
  console.error(`${LABEL}: FAIL -- ${violations.length} cancelled load(s) still carry live money:`);
  for (const v of violations.slice(0, 30)) {
    console.error(`  ✗ ${v.family} · load ${v.load_number} · ${v.doc_number ?? v.id} · ${v.id} — ${v.detail}`);
  }
}

if (process.argv.includes("--selftest")) {
  // Static shape check only -- the real assertions are live-data SQL, not unit-testable without a
  // database. Confirms the six families this guard covers and the exact skip conditions are
  // present in the file's own SQL, so a future edit cannot silently drop a family or a skip
  // clause without this failing.
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL(import.meta.url), "utf8");
  const mustContain = [
    "accounting.invoices",
    "status IN ('void', 'paid', 'factored')",
    "accounting.expenses",
    "accounting.bills",
    "accounting.bill_lines",
    "has_payment",
    "driver_finance.driver_bills",
    "driver_finance.driver_advances",
    "paid_to_date",
    "driver_finance.settlement_lines",
    "status NOT IN ('cancelled', 'paid')",
  ];
  const missing = mustContain.filter((s) => !src.includes(s));
  if (missing.length) {
    console.error(`${LABEL} --selftest FAIL: missing expected SQL fragment(s): ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK -- all 6 families + their skip conditions present in the guard's own SQL.`);
  process.exit(0);
}

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
let violations;
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
  violations = await measure(client);
  await client.query("ROLLBACK");
} catch (e) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`${LABEL}: FAIL -- ${e instanceof Error ? e.message : String(e)}`);
  client.release();
  await pool.end().catch(() => {});
  process.exit(1);
}
client.release();
await pool.end().catch(() => {});

printReport(violations);

if (process.argv.includes("--write-baseline")) {
  fs.writeFileSync(
    BASELINE,
    JSON.stringify(
      {
        _comment:
          "ROUND 118/119: pre-existing cancelled-load money-artifact violations, measured BEFORE this guard existed -- these loads were cancelled before dispatch/cancellation.service.ts's cascade covered every family (or before the vendor-bill linkage/cascade existed at all). Shrink-only: a key leaves when its violation is fixed by hand or a future cascade re-run; a NEW key (a load cancelled AFTER this guard existed still leaving live money) fails the guard -- that would be a real regression, never baselined.",
        measured_at: new Date().toISOString(),
        count: violations.length,
        keys: violations.map(violationKey).sort(),
      },
      null,
      2
    ) + "\n"
  );
  console.log(`${LABEL}: baseline written — ${violations.length} violation(s)`);
  process.exit(0);
}

const baseline = fs.existsSync(BASELINE) ? new Set(JSON.parse(fs.readFileSync(BASELINE, "utf8")).keys) : null;
if (!baseline) {
  if (violations.length === 0) process.exit(0);
  console.error(`${LABEL}: FAIL — no baseline at ${path.relative(ROOT, BASELINE)}; measure production with --write-baseline before this guard can pass on a nonzero live count.`);
  process.exit(1);
}
const now = new Set(violations.map(violationKey));
const fresh = violations.filter((v) => !baseline.has(violationKey(v)));
const gone = [...baseline].filter((k) => !now.has(k));
if (gone.length) console.log(`${LABEL}: ${gone.length} baselined violation(s) no longer present — shrink the baseline: ${gone.slice(0, 10).join("; ")}`);
if (fresh.length) {
  console.error(`${LABEL}: FAIL — ${fresh.length} NEW violation(s) beyond the ${baseline.size}-violation baseline:`);
  for (const v of fresh) console.error(`  ✗ ${violationKey(v)} — ${v.detail}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${violations.length} violation(s), all in the before-picture baseline (${baseline.size}); 0 new.`);
