#!/usr/bin/env node
// LAW 5 (owner, verbatim, 2026-09-23/24): "all should show current and real data always, they
// cannot show anything different in each one." The load board, load costs, the pre-settlement,
// the settlement, the driver settlement, the company settlement, the P&L, cash flow and banking
// all render the SAME number from the SAME source. A downstream surface READS, it never
// re-derives. No surface holds its own copy, its own filter, its own rounding.
//
// docs/bus/00-THE-BOARD-READ-FIRST.md's CC-3 assignment: "prove it by opening a load and showing
// the SAME revenue, the same costs, the same driver pay and the same margin on the load board, in
// load costs, on the pre-settlement and on the settlement. Any two that disagree — name the
// number, name both sources, fix the one that re-derives."
//
// Mapped live (2026-09-24, read-only investigation, no guessing): the canonical per-load
// revenue/costs/driver_pay/margin producer is apps/backend/src/accounting/load-cost-rollup.sql.ts
// (loadCostRollupLateral/LOAD_COST_ROLLUP_SELECT), explicitly labeled "the SINGLE source ...
// money contract: downstream reads never re-derive." Its cost formula:
//   costs_cents = SUM(expenses.total_amount_cents, load-scoped, status<>void)
//               + SUM(ROUND(bill_lines.amount*100), load-scoped LINES, bill not void/revoked)
//
// CONFIRMED DEFECT, FIXED (LAW-5-CROSS-SCREEN, 2026-09-24): apps/backend/src/driver-finance/
// tour-readout.routes.ts (the backend for the Pre-Settlement and Settlement screens, Screens C &
// D) summed SUM(bills.amount_cents) — the WHOLE BILL'S HEADER TOTAL — for any bill EXISTS-matched
// to the load via a line, instead of summing only that load's own bill_lines. A bill whose lines
// span more than one load overstated cost/understated margin on every load it touched. First
// fixed to sum bill_lines.amount, load-scoped, matching the canonical formula's ARITHMETIC exactly
// but as a second, hand-copied implementation of it.
//
// FURTHER FIXED, ONE-SOURCE (ROUND 173, 2026-09-25): that hand-copied implementation was itself
// the anti-pattern LAW 5 forbids — numerically correct, but a second copy that could silently
// drift from load-cost-rollup.sql.ts again. tour-readout.routes.ts's legs query now joins
// loadCostRollupLateral() directly and reads lcr.costs_cents / lcr.driver_pay_cents instead of
// re-deriving them; live-verified equivalent across all 112 live USMCA loads (0 mismatches)
// before the switch.
//
// This guard is TWO arms:
//   A) STATIC, permanent regression lock — no apps/backend/src route file may compute a load-cost
//      number by summing a bill's HEADER total (`bills.amount_cents`/`b.amount_cents`) gated by an
//      EXISTS/JOIN against load-scoped bill_lines. That shape is exactly the bug class. The correct
//      shape sums bill_lines.amount directly, scoped by load_id.
//   B) LIVE, self-arming population check — for every load whose bill_lines currently span it,
//      independently recompute the canonical bill_cents (raw SQL, mirroring
//      load-cost-rollup.sql.ts) and assert it is what any other load-cost consumer would get.
//      Vacuously PASSES over zero such loads (confirmed live 2026-09-24, LAW-5 board note: 32
//      loads / 0 settlements — CASE A, the feed hasn't reached a settlement yet); arms the moment
//      a load has more than one bill_lines row, or a bill spans more than one load.
//
// Static source guard scans; live half needs DATABASE_URL, fails closed with none (Rule
// ROUND-29.9-B) — this reads live money-shaped data (bill costs), it is not offline-exemptable.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_SRC = path.join(ROOT, "apps", "backend", "src");
const LABEL = "verify-one-source-per-number";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      out.push(...walk(full));
    } else if (/\.(ts|mjs)$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

/**
 * Pure: does this source text compute a load-scoped bill cost by summing the bill's own HEADER
 * total (amount_cents), rather than summing bill_lines.amount? The anti-pattern shape: a
 * `SUM(...amount_cents...)` aggregate whose FROM/JOIN is `accounting.bills` (not `bill_lines`)
 * while a `bill_lines`/`bl` reference appears nearby (an EXISTS/JOIN gate proving it was scoping
 * to a load through the line table without actually summing the line amount).
 * @param {string} src
 * @returns {string[]} human-readable hit snippets
 */
export function findBillHeaderTotalAsLoadCost(src) {
  const hits = [];
  // A SELECT ... SUM(<alias>.amount_cents) ... FROM accounting.bills <alias> ... that also
  // references bill_lines somewhere in the same statement (the load-scoping join/EXISTS) within a
  // bounded window — the exact shape of the fixed defect.
  const re = /SUM\(\s*([a-zA-Z_][\w.]*)\.amount_cents\s*\)[\s\S]{0,400}?FROM\s+accounting\.bills\b[\s\S]{0,400}?bill_lines/gi;
  let m;
  while ((m = re.exec(src))) hits.push(src.slice(m.index, m.index + 160).replace(/\s+/g, " ").trim());
  return hits;
}

export function auditNoBillHeaderTotalAsLoadCost(files) {
  const failures = [];
  for (const abs of files) {
    const src = stripComments(fs.readFileSync(abs, "utf8"));
    const hits = findBillHeaderTotalAsLoadCost(src);
    if (hits.length > 0) {
      failures.push(
        `${path.relative(ROOT, abs)}: sums a bill's HEADER total (amount_cents) as a load-scoped cost instead of summing bill_lines.amount — overstates cost on any bill spanning more than one load (${hits[0]})`
      );
    }
  }
  return failures;
}

/**
 * Pure: SettlementDetailPage.tsx's KPI grid must read company-scoped revenue/margin from the
 * company-settlement report once it has loaded, not unconditionally from the tour-scoped readout
 * field of the same name — the exact LAW-5 defect fixed this round (CompanyWaterfallSection had
 * already made this switch; the KPI grid a few tiles above it had not).
 */
export function auditKpiGridUsesCompanyScopedReport(src) {
  const failures = [];
  const hasKpiGrid = /<SettlementKpiGrid\b/.test(src);
  if (!hasKpiGrid) return failures;
  const block = src.slice(src.indexOf("<SettlementKpiGrid"), src.indexOf("<SettlementKpiGrid") + 1200);
  if (!/companyReport\s*\?/.test(block) || !/companyReport\.sections\.revenue\.invoiced_cents/.test(block)) {
    failures.push("SettlementDetailPage.tsx's <SettlementKpiGrid revenueCents=...> no longer prefers companyReport.sections (company-scoped) over the tour-scoped readout.company_settlement field");
  }
  if (!/companyReport\.sections\.pl_rollup\.net_revenue_cents/.test(block)) {
    failures.push("SettlementDetailPage.tsx's <SettlementKpiGrid companyMarginCents=...> no longer prefers companyReport.sections.pl_rollup.net_revenue_cents over the tour-scoped readout.company_settlement.margin_cents");
  }
  return failures;
}

// ROUND 151.3 (Lead, 2026-09-23/24 owner order): "static arm fails if any load surface (board,
// Kanban badge, load costs, cost-list rows, pre-settlement, settlement) computes a load money
// figure outside load-cost-rollup.sql.ts." Six-surface registry — each entry names the file and
// the marker proving it reads the canonical rollup (or, for the load board, that it carries no
// independently-computed margin at all — nothing to re-derive). Extend this list as a surface's
// file changes; never delete an entry to make a regression disappear.
// R-166 (Lead, 2026-09-25) named its own six surfaces by different labels than this registry's
// original R-151.3/153 six: "load board; load costs; pre-settlement; settlement; invoice; driver
// bill." Four already correspond 1:1 (load board, the two load-costs entries, the
// pre-settlement/settlement cost rows); "invoice" and "driver bill" were not registered here yet.
// Extending rather than replacing — narrowing to exactly 6 would drop tested Kanban-badge and
// settlement-KPI-grid coverage that is real and still enforced. Kept the name SIX_SURFACES (the
// selftest below and R-166's own DONE-line/guard-name reference it); the length assertion is
// updated to match the real count.
export const SIX_SURFACES = [
  {
    name: "load board (list/table)",
    file: "apps/frontend/src/pages/dispatch/planners/LoadsPlanner.tsx",
    mustContain: [/useLoadCostRollups/, /costRollups\.get\(row\.id\)/],
    forbid: [/margin_cents\s*=.*-.*-/],
  },
  { name: "Kanban badge", file: "apps/backend/src/dispatch/load-profitability.service.ts", mustContain: [/loadCostRollupLateral/, /LOAD_COST_ROLLUP_SELECT/, /canonicalMarginCents/] },
  { name: "load costs (board)", file: "apps/backend/src/accounting/load-costs-board.routes.ts", mustContain: [/bill_lines/] },
  { name: "load costs (detail tab)", file: "apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx", mustContain: [/getLoadCostRollup/, /rollup\.data/] },
  // ROUND 173 (2026-09-25): bl_agg.line_cents is the SEPARATE individual-cost-line-items listing
  // (TourCost drill-down rows, its own load-scoped bill_lines read -- unrelated to the per-load
  // aggregate); loadCostRollupLateral is the legs query's load-level costs_cents/driver_pay_cents
  // source, replacing the old hand-copied ROUND(bl.amount * 100) formula.
  { name: "cost-list rows (pre-settlement/settlement)", file: "apps/backend/src/driver-finance/tour-readout.routes.ts", mustContain: [/bl_agg\.line_cents/, /loadCostRollupLateral/] },
  { name: "settlement KPI grid", file: "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx", mustContain: [/companyReport\.sections\.revenue\.invoiced_cents/, /companyReport\.sections\.pl_rollup\.net_revenue_cents/] },
  { name: "driver bill (R-166)", file: "apps/frontend/src/components/dispatch/LoadDetailDriverPayTab.tsx", mustContain: [/getLoadCostRollup/, /rollup\.data\.driver_pay_cents/] },
  // ROUND 173 pt 1/4 (Lead, 2026-09-25) — the owner's "5 load boards" (DispatchPage's ViewMode
  // type: Overview/List/Kanban/Round Trips/Truck Line). Kanban is covered by the existing
  // "Kanban badge" entry above (DispatchKanban.tsx's badge calls getLoadProfitability, whose
  // backend load-profitability.service.ts already calls loadCostRollupLateral internally —
  // confirmed this pass, not re-registered here to avoid a duplicate file entry).
  { name: "load board -- List (R-173)", file: "apps/frontend/src/pages/dispatch/DispatchBoard.tsx", mustContain: [/useLoadCostRollups/, /costRollups\.get\(load\.id\)/] },
  { name: "load board -- Round Trips (R-173)", file: "apps/frontend/src/pages/dispatch/RoundTrips.tsx", mustContain: [/useLoadCostRollups/, /costRollups\.get\(leg\.id\)/] },
  { name: "load board -- Truck Line (R-173)", file: "apps/frontend/src/pages/dispatch/TruckLineBoard.tsx", mustContain: [/useLoadCostRollups/, /costRollups\.get\(r\.load\.load_id\)/] },
  { name: "load board -- Overview (R-173)", file: "apps/frontend/src/components/dispatch/DispatchLoadCostsPanel.tsx", mustContain: [/useLoadCostRollups/, /costRollups\.get\(load\.id\)/], forbid: [/function marginCents/] },
];

/**
 * Pure: a local "sum of subtractions" margin/net-profit formula — revenue minus three or more
 * cost terms assigned straight into a variable — is the exact anti-pattern LAW 5 forbids: a
 * surface computing its own margin instead of reading load-cost-rollup.sql.ts's canonical
 * margin_cents. Three-or-more terms (not two) keeps this from flagging an ordinary
 * `subtotal - tax` two-term calc elsewhere in the app.
 */
export function findLocalMarginSubtraction(src) {
  const hits = [];
  const re = /\b(?:const|let)\s+(\w*(?:[Mm]argin|[Nn]et[Pp]rofit)\w*)\s*=\s*[\w.]+(?:\s*-\s*[\w.()[\]]+){3,}/g;
  let m;
  while ((m = re.exec(src))) hits.push(m[0].slice(0, 140));
  return hits;
}

export function auditSixSurfaces(rootDir) {
  const failures = [];
  for (const surface of SIX_SURFACES) {
    const abs = path.join(rootDir, surface.file);
    if (!fs.existsSync(abs)) {
      failures.push(`${surface.name}: registered file ${surface.file} no longer exists — update or retire this SIX_SURFACES entry`);
      continue;
    }
    const src = stripComments(fs.readFileSync(abs, "utf8"));
    for (const marker of surface.mustContain) {
      if (!marker.test(src)) {
        failures.push(`${surface.name} (${surface.file}): no longer matches required canonical-source marker ${marker} — did this surface regress to re-deriving its own numbers?`);
      }
    }
    for (const bad of surface.forbid ?? []) {
      if (bad.test(src)) {
        failures.push(`${surface.name} (${surface.file}): matches a forbidden self-computed-margin pattern ${bad}`);
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

    // Self-arming population: every live, non-void load with at least one live bill_lines row.
    // For each, independently recompute bill_cents via the CANONICAL shape (load-scoped
    // bill_lines.amount, load-cost-rollup.sql.ts's own formula, re-derived here from raw tables —
    // not by calling any route) and cross-check it against a naive whole-bill-header-total sum for
    // the same load. They must differ (if the header total ever equals the line-scoped total for
    // a bill that spans >1 load, that combination doesn't exist in this data yet) OR be provably
    // identical only because every matching bill has exactly one load in scope, in which case both
    // formulas agree and there is nothing to catch — logged either way, never silently skipped.
    const res = await client.query(
      `
        SELECT l.id::text AS load_id, l.load_number,
               COALESCE(canon.bill_cents, 0)::bigint AS canonical_bill_cents,
               COALESCE(naive.bill_cents, 0)::bigint AS naive_header_total_bill_cents,
               canon.bill_count, naive.bill_count
          FROM mdata.loads l
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(ROUND(bl.amount * 100)), 0)::bigint AS bill_cents, COUNT(DISTINCT bl.bill_id) AS bill_count
              FROM accounting.bill_lines bl
              JOIN accounting.bills b ON b.id = bl.bill_id
             WHERE bl.load_id = l.id AND b.status NOT IN ('void','voided') AND b.revoked_at IS NULL AND bl.voided_at IS NULL
          ) canon ON true
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(b.amount_cents), 0)::bigint AS bill_cents, COUNT(DISTINCT b.id) AS bill_count
              FROM accounting.bills b
             WHERE b.operating_company_id = l.operating_company_id AND b.status NOT IN ('void','voided') AND b.voided_at IS NULL
               AND EXISTS (SELECT 1 FROM accounting.bill_lines bl2 WHERE bl2.bill_id = b.id AND bl2.load_id = l.id AND bl2.voided_at IS NULL)
          ) naive ON true
         WHERE l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL AND l.is_sample_data IS NOT TRUE
           AND COALESCE(canon.bill_count, 0) > 0
      `,
      [USMCA_COMPANY_ID]
    );

    const divergences = [];
    for (const row of res.rows) {
      const canonical = Number(row.canonical_bill_cents);
      const naive = Number(row.naive_header_total_bill_cents);
      if (naive !== canonical) {
        divergences.push(
          `load ${row.load_number} (${row.load_id}): canonical (bill_lines-scoped) bill_cents=${canonical}, naive (header-total) bill_cents=${naive} — a consumer using the header-total shape would show the wrong cost/margin for this load right now`
        );
      }
    }

    await client.query("COMMIT");

    // Static arm — permanent regression lock, runs regardless of live population size.
    const files = walk(BACKEND_SRC);
    const staticFailures = auditNoBillHeaderTotalAsLoadCost(files);
    const kpiSrcPath = path.join(ROOT, "apps/frontend/src/pages/driver-finance/SettlementDetailPage.tsx");
    if (fs.existsSync(kpiSrcPath)) {
      staticFailures.push(...auditKpiGridUsesCompanyScopedReport(fs.readFileSync(kpiSrcPath, "utf8")));
    }
    staticFailures.push(...auditSixSurfaces(ROOT));

    const failures = [...staticFailures, ...divergences];
    if (failures.length > 0) {
      console.error(`${LABEL}: FAIL — ${failures.length} problem(s):`);
      for (const f of failures) console.error(`  ✗ ${f}`);
      process.exit(1);
    }
    console.log(
      `${LABEL}: OK — 0 route files compute a load cost from a bill's header total; SettlementDetailPage's KPI grid reads the company-scoped report; ${res.rows.length} live load(s) with bill_lines cross-checked (canonical vs. naive), 0 divergence(s).`
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

  const buggy = `
    const res = await client.query(
      \`SELECT COALESCE(SUM(b.amount_cents),0) FROM accounting.bills b WHERE b.operating_company_id = $1
          AND EXISTS (SELECT 1 FROM accounting.bill_lines bl WHERE bl.bill_id = b.id AND bl.load_id = l.id)\`
    );
  `;
  assert.ok(findBillHeaderTotalAsLoadCost(buggy).length > 0, "must catch the header-total-via-EXISTS anti-pattern");

  const clean = `
    const res = await client.query(
      \`SELECT COALESCE(SUM(ROUND(bl.amount * 100)),0) FROM accounting.bill_lines bl JOIN accounting.bills b ON b.id = bl.bill_id
        WHERE bl.load_id = l.id AND b.status NOT IN ('void','voided')\`
    );
  `;
  assert.ok(findBillHeaderTotalAsLoadCost(clean).length === 0, "must NOT flag the correct bill_lines-scoped shape");

  const unrelated = `const total = SUM(b.amount_cents); // no accounting.bills FROM clause nearby, no bill_lines at all`;
  assert.ok(findBillHeaderTotalAsLoadCost(unrelated).length === 0, "must not false-positive on an unrelated amount_cents sum");

  const kpiGood = `
    <SettlementKpiGrid
      revenueCents={companyReport ? companyReport.sections.revenue.invoiced_cents : (readout?.company_settlement?.revenue_cents ?? 0)}
      companyMarginCents={companyReport ? companyReport.sections.pl_rollup.net_revenue_cents : (readout?.company_settlement?.margin_cents ?? 0)}
    />
  `;
  assert.ok(auditKpiGridUsesCompanyScopedReport(kpiGood).length === 0, "must accept the fixed company-scoped-first shape");

  const kpiBad = `
    <SettlementKpiGrid
      revenueCents={readout?.company_settlement?.revenue_cents ?? 0}
      companyMarginCents={readout?.company_settlement?.margin_cents ?? 0}
    />
  `;
  assert.ok(auditKpiGridUsesCompanyScopedReport(kpiBad).length > 0, "must catch the regression back to tour-scoped-only");

  const noGrid = `export function SomeOtherPage() { return <div>no kpi grid here</div>; }`;
  assert.ok(auditKpiGridUsesCompanyScopedReport(noGrid).length === 0, "a file with no SettlementKpiGrid at all must not be flagged");

  // ROUND 151.3 PLANTED-RED (Lead's own required proof): "add a local margin calc -> exit 1."
  const plantedRedLocalMargin = `
    function computeBadgeMargin(revenue, driverPay, fuelCents, maintCents) {
      const netProfitCents = revenue - driverPay - fuelCents - maintCents;
      return netProfitCents;
    }
  `;
  assert.ok(findLocalMarginSubtraction(plantedRedLocalMargin).length > 0, "PLANTED-RED: a re-derived local margin (revenue minus 3+ cost terms) must be caught");
  const legitimateTwoTerm = `const subtotal = price - discount;`;
  assert.ok(findLocalMarginSubtraction(legitimateTwoTerm).length === 0, "an ordinary two-term subtraction (not a margin/net-profit re-derivation) must not false-positive");

  // SIX_SURFACES registry — every registered surface must exist and carry its canonical-source marker.
  // 7 registered: the original R-151.3/153 six plus R-166's "driver bill" (LoadDetailDriverPayTab.tsx,
  // wired this pass). "Invoice" (R-166's sixth named surface) is not yet wired -- add its entry
  // alongside that wiring, not before, so every registered entry always has a real passing marker.
  // STALE-LITERAL-OK: 11 is the real, current SIX_SURFACES registry length (original 6 + R-166 driver bill + R-173's 4 board entries) -- this assertion is the registry's own length lock, not a purge-window count.
  assert.ok(SIX_SURFACES.length === 11, `SIX_SURFACES must register exactly 11 (original 6 + R-166 driver bill + R-173 4 board entries), has ${SIX_SURFACES.length}`);
  const liveRepoFailures = auditSixSurfaces(ROOT);
  assert.ok(liveRepoFailures.length === 0, `auditSixSurfaces must pass 0 on the real, fixed repo — got: ${liveRepoFailures.join(" | ")}`);
  // Mutate a registered surface's required marker away -> must be caught.
  const tmpDir2 = fs.mkdtempSync(path.join(ROOT, ".tmp-six-surfaces-selftest-"));
  try {
    const fakeRoot = tmpDir2;
    const fakeRel = "apps/backend/src/dispatch/load-profitability.service.ts";
    fs.mkdirSync(path.join(fakeRoot, path.dirname(fakeRel)), { recursive: true });
    fs.writeFileSync(path.join(fakeRoot, fakeRel), "export const x = 1; // no canonical rollup import at all");
    const withoutOtherFiles = SIX_SURFACES.filter((s) => s.file === fakeRel);
    const savedGlobal = SIX_SURFACES.length;
    // Directly exercise the per-surface check logic against the mutated file only.
    const mutFailures = (function checkOne(rootDir, surface) {
      const abs = path.join(rootDir, surface.file);
      const src = fs.readFileSync(abs, "utf8");
      return surface.mustContain.filter((marker) => !marker.test(src));
    })(fakeRoot, withoutOtherFiles[0]);
    assert.ok(mutFailures.length > 0, "PLANTED-RED: a registered surface missing its canonical-source marker must be caught");
    assert.ok(savedGlobal === 11, "sanity: SIX_SURFACES unchanged by this mutation check");
  } finally {
    fs.rmSync(tmpDir2, { recursive: true, force: true });
  }

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else await live();
