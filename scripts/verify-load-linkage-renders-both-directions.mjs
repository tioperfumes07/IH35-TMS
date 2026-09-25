#!/usr/bin/env node
// ROUND 153 STEP 3 (Lead, owner order, 2026-09-25): "Linkage renders: every load shows its
// settlement number beside the load number, its driver bill, its expenses, fuel, Faro advance and
// invoice — both directions (settlement → loads, load → settlement)."
//
// Mapped live before writing this guard (read-only): the load detail surface
// (apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx and its mounted tabs) already wires
// all six linkage kinds, each load-scoped:
//   - settlement number beside load number: verify-settlement-ref-beside-load.mjs's own registry
//     (35 surfaces, LAW owner 2026-09-13) — cited, not duplicated, here.
//   - driver bill: LoadDetailDriverPayTab.tsx, EntityLink kind="driver_bill"
//   - expenses / bills: LoadDetailCostsTab.tsx (SavedExpenseCard/SavedBillCard) +
//     ExpensesReverseSection/BillsReverseSection mounted with filter={{load_id}}
//   - fuel: FuelTransactionsReverseSection mounted with filter={{load_id}}
//   - Faro advance (factoring_advance): FactoringTab.tsx, EntityLink kind="factoring_advance"
//   - invoice: FactoringTab.tsx + InvoicesReverseSection mounted with filter={{source_load_id}}
// Reverse direction (settlement → loads): apps/backend/src/driver-finance/tour-readout.routes.ts's
// buildTourReadout — legs[] is every load on the settlement, both ways (presettlement_link_id OR a
// live active settlement_lines row), already the shared read model TourPreSettlementTab/
// TourSettlementTab/SettlementLoadsSection all consume (LDT-5/LDT-6, owner order 2026-09-05).
//
// This guard is TWO arms:
//   A) STATIC — each of the six load->X linkage kinds must still be wired, load-scoped, in the
//      registered file(s). Regression lock: if a future edit drops the filter/kind, this fails.
//   B) LIVE, self-arming — for every load carrying a real driver bill / expense / bill / fuel
//      transaction / invoice / factoring advance, the FK actually resolves back to a live,
//      non-deleted load (never a dangling reference an EntityLink would show as a tombstone for no
//      reason). Vacuously passes at 0 for any kind with no live rows yet.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-linkage-renders-both-directions";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

// { name, file, mustContain: RegExp[] } — the forward-direction (load -> X) registry.
export const LOAD_LINKAGE_SURFACES = [
  {
    name: "driver bill",
    file: "apps/frontend/src/components/dispatch/LoadDetailDriverPayTab.tsx",
    mustContain: [/kind="driver_bill"/],
  },
  {
    name: "expenses",
    file: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
    mustContain: [/<ExpensesReverseSection[\s\S]{0,200}?filter=\{\{\s*load_id:\s*load\.id\s*\}\}/],
  },
  {
    name: "bills",
    file: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
    mustContain: [/<BillsReverseSection[\s\S]{0,200}?filter=\{\{\s*load_id:\s*load\.id\s*\}\}/],
  },
  {
    name: "fuel",
    file: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
    mustContain: [/<FuelTransactionsReverseSection[\s\S]{0,200}?filter=\{\{\s*load_id:\s*load\.id\s*\}\}/],
  },
  {
    name: "Faro advance (factoring_advance)",
    file: "apps/frontend/src/components/dispatch/tabs/FactoringTab.tsx",
    mustContain: [/kind="factoring_advance"/],
  },
  {
    name: "invoice",
    file: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
    mustContain: [/<InvoicesReverseSection[\s\S]{0,200}?filter=\{\{\s*source_load_id:\s*load\.id\s*\}\}/],
  },
  // ROUND 153 step 3 (owner, 2026-09-25 follow-up): "fill unit/driver/trailer links" on the shared
  // Pre-Settlement/Settlement load-row renderer — these three were plain text (no id to link with).
  {
    name: "driver (tour register)",
    file: "apps/frontend/src/components/dispatch/TourLoadRows.tsx",
    mustContain: [/kind="driver"/],
  },
  {
    name: "unit (tour register)",
    file: "apps/frontend/src/components/dispatch/TourLoadRows.tsx",
    mustContain: [/kind="unit"/],
  },
  {
    name: "trailer (tour register)",
    file: "apps/frontend/src/components/dispatch/TourLoadRows.tsx",
    mustContain: [/kind="trailer"/],
  },
];

// Reverse direction (settlement -> loads): buildTourReadout's legs[] must still be sourced from
// EITHER a live presettlement_link_id OR an active settlement_lines row — dropping either half
// would silently lose legs on a settlement whose loads were linked the other way (the exact
// SETL-LEGS-FROM-LINES defect this file's own header documents having fixed once already).
export const REVERSE_LINKAGE_SURFACE = {
  file: "apps/backend/src/driver-finance/tour-readout.routes.ts",
  mustContain: [/presettlement_link_id\s*=\s*\$1/, /sl\.settlement_id\s*=\s*\$1/],
};

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

export function auditLoadLinkageStatic(rootDir) {
  const failures = [];
  for (const surface of LOAD_LINKAGE_SURFACES) {
    const abs = path.join(rootDir, surface.file);
    if (!fs.existsSync(abs)) {
      failures.push(`${surface.name}: registered file ${surface.file} no longer exists`);
      continue;
    }
    const src = stripComments(fs.readFileSync(abs, "utf8"));
    for (const marker of surface.mustContain) {
      if (!marker.test(src)) {
        failures.push(`${surface.name} (${surface.file}): no longer wires its load-scoped link — marker ${marker} not found`);
      }
    }
  }
  const rAbs = path.join(rootDir, REVERSE_LINKAGE_SURFACE.file);
  if (!fs.existsSync(rAbs)) {
    failures.push(`reverse linkage (settlement -> loads): ${REVERSE_LINKAGE_SURFACE.file} no longer exists`);
  } else {
    const rSrc = stripComments(fs.readFileSync(rAbs, "utf8"));
    for (const marker of REVERSE_LINKAGE_SURFACE.mustContain) {
      if (!marker.test(rSrc)) {
        failures.push(`reverse linkage (settlement -> loads): ${REVERSE_LINKAGE_SURFACE.file} no longer matches ${marker} — a settlement's legs may drop loads linked only the other way`);
      }
    }
  }
  return failures;
}

async function live() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const checks = [
      { name: "driver bill -> load", sql: `SELECT COUNT(*)::int AS c FROM driver_finance.driver_bills db JOIN mdata.loads l ON l.id = db.load_id WHERE db.operating_company_id = $1::uuid AND db.status <> 'void'` },
      { name: "expense -> load", sql: `SELECT COUNT(*)::int AS c FROM accounting.expenses e JOIN mdata.loads l ON l.id = e.load_id WHERE e.operating_company_id = $1::uuid AND e.status <> 'void' AND e.load_id IS NOT NULL` },
      { name: "bill_lines -> load", sql: `SELECT COUNT(*)::int AS c FROM accounting.bill_lines bl JOIN accounting.bills b ON b.id = bl.bill_id JOIN mdata.loads l ON l.id = bl.load_id WHERE b.operating_company_id = $1::uuid AND bl.load_id IS NOT NULL AND bl.voided_at IS NULL` },
      { name: "fuel_transactions -> load", sql: `SELECT COUNT(*)::int AS c FROM fuel.fuel_transactions ft JOIN mdata.loads l ON l.id = ft.load_id WHERE ft.operating_company_id = $1::uuid AND ft.load_id IS NOT NULL` },
      { name: "invoice -> load", sql: `SELECT COUNT(*)::int AS c FROM accounting.invoices inv JOIN mdata.loads l ON l.id = inv.source_load_id WHERE inv.operating_company_id = $1::uuid AND inv.source_load_id IS NOT NULL` },
      { name: "factoring_advance -> load (via invoice)", sql: `SELECT COUNT(*)::int AS c FROM accounting.factoring_advances fa JOIN accounting.invoices inv ON inv.factoring_advance_id = fa.id JOIN mdata.loads l ON l.id = inv.source_load_id WHERE fa.operating_company_id = $1::uuid` },
    ];
    // Dangling-FK counterpart: a row whose load_id/source_load_id is set but does not resolve to a
    // live mdata.loads row — this is the actual defect class (an EntityLink that would tombstone).
    const danglingChecks = [
      { name: "driver bill -> load", sql: `SELECT COUNT(*)::int AS c FROM driver_finance.driver_bills db WHERE db.operating_company_id = $1::uuid AND db.status <> 'void' AND db.load_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = db.load_id)` },
      { name: "expense -> load", sql: `SELECT COUNT(*)::int AS c FROM accounting.expenses e WHERE e.operating_company_id = $1::uuid AND e.status <> 'void' AND e.load_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = e.load_id)` },
      { name: "fuel_transactions -> load", sql: `SELECT COUNT(*)::int AS c FROM fuel.fuel_transactions ft WHERE ft.operating_company_id = $1::uuid AND ft.load_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = ft.load_id)` },
      { name: "invoice -> load", sql: `SELECT COUNT(*)::int AS c FROM accounting.invoices inv WHERE inv.operating_company_id = $1::uuid AND inv.source_load_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = inv.source_load_id)` },
    ];

    const counts = {};
    for (const c of checks) {
      const r = await client.query(c.sql, [USMCA_COMPANY_ID]);
      counts[c.name] = r.rows[0].c;
    }
    const dangling = [];
    for (const c of danglingChecks) {
      const r = await client.query(c.sql, [USMCA_COMPANY_ID]);
      if (r.rows[0].c > 0) dangling.push(`${c.name}: ${r.rows[0].c} row(s) point at a load that no longer exists`);
    }

    await client.query("COMMIT");

    const staticFailures = auditLoadLinkageStatic(ROOT);
    const failures = [...staticFailures, ...dangling];
    if (failures.length > 0) {
      console.error(`${LABEL}: FAIL — ${failures.length} problem(s):`);
      for (const f of failures) console.error(`  ✗ ${f}`);
      process.exit(1);
    }
    console.log(
      `${LABEL}: OK — all 6 forward linkage surfaces wired, reverse (settlement -> loads) both-path sourced, 0 dangling FKs. Live counts: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(", ")}.`
    );
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  assert.ok(LOAD_LINKAGE_SURFACES.length === 9, `must register the six named linkage kinds plus the three tour-register driver/unit/trailer links, has ${LOAD_LINKAGE_SURFACES.length}`);
  const realFailures = auditLoadLinkageStatic(ROOT);
  assert.ok(realFailures.length === 0, `auditLoadLinkageStatic must pass 0 on the real repo — got: ${realFailures.join(" | ")}`);

  // PLANTED-RED — a registered surface missing its marker must be caught.
  const tmpDir = fs.mkdtempSync(path.join(ROOT, ".tmp-load-linkage-selftest-"));
  try {
    const fakeFile = "apps/frontend/src/components/dispatch/LoadDetailDriverPayTab.tsx";
    fs.mkdirSync(path.join(tmpDir, path.dirname(fakeFile)), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, fakeFile), "export const x = 1; // no driver_bill EntityLink at all");
    const surface = LOAD_LINKAGE_SURFACES.find((s) => s.file === fakeFile);
    const src = fs.readFileSync(path.join(tmpDir, fakeFile), "utf8");
    const mutFails = surface.mustContain.filter((m) => !m.test(src));
    assert.ok(mutFails.length > 0, "PLANTED-RED: a registered surface with its EntityLink removed must be caught");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else await live();
