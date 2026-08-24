#!/usr/bin/env node
/**
 * verify-wo-pdf-cost-breakdown-line-fallback.mjs (WO-PDF-COST-BREAKDOWN-LINES-FALLBACK,
 * verify-step 7920)
 *
 * Root cause: no product write path (create WO, the two-section labor/parts form, or the WAVE3
 * expense-proof-of-path script) ever writes `maintenance.work_orders.labor_hours` or
 * `.parts_cost_cents` — grepped the whole frontend, zero references to either column. Every real
 * WO's itemized cost instead lives in `maintenance.work_order_lines`. The WO print letter
 * (`/api/v1/work-orders/:id/pdf`) read ONLY the legacy hours/rate/parts columns for its "Cost
 * breakdown" table, so Labor/Parts/Other printed "—" on EVERY real work order in production, even
 * ones with real, itemized dollar costs (live-confirmed: WO 4b809614-a486-4d27-8f14-6acc19b80b85
 * has a real $1,200.00 labor line in work_order_lines, printed "Labor —").
 *
 * Fix: the /pdf route now sums `work_order_lines.total_cost` grouped by `line_type` (labor / part
 *+parts / disposal+other) and passes those sums into the PDF model as a fallback the renderer
 * uses only when the legacy hours/rate/parts/other fields are unset — so the printed letter never
 * shows an em-dash for a WO whose own detail page already shows real line-item costs.
 *
 * Usage:
 *   node scripts/verify-wo-pdf-cost-breakdown-line-fallback.mjs            # scan
 *   node scripts/verify-wo-pdf-cost-breakdown-line-fallback.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const RENDERER = "apps/backend/src/work-orders/wo-pdf-renderer.service.ts";
const ROUTES = "apps/backend/src/work-orders/work-orders.routes.ts";

export function checkWoPdfCostBreakdownLineFallback(rendererSrc, routesSrc) {
  const offenders = [];

  if (!/lineLaborCents/.test(rendererSrc) || !/linePartsCents/.test(rendererSrc) || !/lineOtherCents/.test(rendererSrc)) {
    offenders.push(`${RENDERER}: WorkOrderPdfModel is missing the line*Cents fallback fields.`);
  }
  if (!/model\.lineLaborCents/.test(rendererSrc)) {
    offenders.push(`${RENDERER}: the Labor row does not fall back to lineLaborCents when hours/rate are unset.`);
  }
  if (!/model\.partsCostCents \?\? model\.linePartsCents/.test(rendererSrc)) {
    offenders.push(`${RENDERER}: the Parts row does not fall back to linePartsCents when partsCostCents is unset.`);
  }
  if (!/model\.otherCostCents \?\? model\.lineOtherCents/.test(rendererSrc)) {
    offenders.push(`${RENDERER}: the Other row does not fall back to lineOtherCents when otherCostCents is unset.`);
  }

  if (!/FROM maintenance\.work_order_lines/.test(routesSrc) || !/GROUP BY line_type/.test(routesSrc)) {
    offenders.push(`${ROUTES}: the /pdf route no longer sums maintenance.work_order_lines by line_type.`);
  }
  if (!/lineTotals:\s*\{\s*laborCents,\s*partsCents,\s*otherCents\s*\}/.test(routesSrc)) {
    offenders.push(`${ROUTES}: buildPdfModel is not called with the computed lineTotals.`);
  }

  return offenders;
}

export function run() {
  const rendererSrc = fs.readFileSync(path.join(repoRoot, RENDERER), "utf8");
  const routesSrc = fs.readFileSync(path.join(repoRoot, ROUTES), "utf8");
  const offenders = checkWoPdfCostBreakdownLineFallback(rendererSrc, routesSrc);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggyRenderer = `
    export type WorkOrderPdfModel = { laborHours: number | null; laborRateCents: number | null; partsCostCents: number | null; otherCostCents: number | null };
    export function renderWorkOrderPdfHtml(model) {
      const parts = moneyOrDash(model.partsCostCents ?? null);
      const other = moneyOrDash(model.otherCostCents ?? null);
    }
  `;
  const buggyRoutes = `
    function buildPdfModel(params) { return { partsCostCents: partsCost }; }
  `;
  const buggyOffenders = checkWoPdfCostBreakdownLineFallback(buggyRenderer, buggyRoutes);

  const rendererSrc = fs.readFileSync(path.join(repoRoot, RENDERER), "utf8");
  const routesSrc = fs.readFileSync(path.join(repoRoot, ROUTES), "utf8");
  const fixedOffenders = checkWoPdfCostBreakdownLineFallback(rendererSrc, routesSrc);

  if (buggyOffenders.length >= 1 && fixedOffenders.length === 0) {
    console.log("verify-wo-pdf-cost-breakdown-line-fallback selftest OK");
    process.exit(0);
  }
  console.error("verify-wo-pdf-cost-breakdown-line-fallback selftest FAILED", { buggyOffenders, fixedOffenders });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-wo-pdf-cost-breakdown-line-fallback FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-wo-pdf-cost-breakdown-line-fallback OK — WO PDF Cost breakdown falls back to real work_order_lines sums, never a bare em-dash when real line-item dollars exist",
  );
}
