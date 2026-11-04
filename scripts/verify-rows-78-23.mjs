#!/usr/bin/env node
/**
 * Rows 78 + 23 (LEAD 11-03, ACCT-F11057).
 *
 * Row 78 — Dispatch › Load history (/dispatch/load-history, board V3-Dispatch-LoadHistory.dc.html): a list of every
 * load the company booked where every cell opens its record, plus a load panel (timeline · money · linked records).
 * No second engine: the list reads GET /api/v1/reports/loads-history (loads-history.service.ts: loads-report rows +
 * the canonical load-cost rollup); the panel reads the load history endpoint, the load-cost rollup, the load's
 * expenses and its docs. The single-load change timeline (/dispatch/loads/:id/history) stays.
 *
 * Row 23 — Accounting › Bill Payments lists bill payments only. Root cause: the settlement close engine stores every
 * settlement deduction (driver escrow contribution, advance / other recovery) as an accounting.bill_payments row
 * (settlement_deduction_noncash = true); list readers each carried their own WHERE and the vendor/driver
 * "Bill payments" tab + vendor profile activity listed them (USMCA 223 rows, 129 escrow). Every bill-payment LIST
 * reader now uses one predicate, apBillPaymentOnlySql; the per-bill drill keeps deductions (they apply to the bill).
 *
 * --selftest plants each defect in memory.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-rows-78-23";
const F = {
  page: "apps/frontend/src/pages/dispatch/LoadHistoryBoardPage.tsx",
  panel: "apps/frontend/src/components/dispatch/LoadHistoryDetailPanel.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  subnav: "apps/frontend/src/components/dispatch/DispatchSubnav.tsx",
  api: "apps/frontend/src/api/reports.ts",
  lhService: "apps/backend/src/reports/loads-history.service.ts",
  lhRoute: "apps/backend/src/reports/loads-history.routes.ts",
  pred: "apps/backend/src/accounting/ap-bill-payment-scope.sql.ts",
  bills: "apps/backend/src/accounting/bills.service.ts",
  vendorBp: "apps/backend/src/accounting/vendor-bill-payments.routes.ts",
  vendorProfile: "apps/backend/src/mdata/canonical/vendor-profile.service.ts",
};

function fnBody(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return "";
  const j = src.indexOf("\nexport ", i + sig.length);
  return src.slice(i, j < 0 ? undefined : j);
}

export function findDefects(s) {
  const out = [];
  // ---- Row 78 ----
  if (!/path="\/dispatch\/load-history"[\s\S]{0,120}<LoadHistoryBoardPage \/>/.test(s.manifest)) out.push("/dispatch/load-history is not routed to LoadHistoryBoardPage");
  if (!/path="\/dispatch\/loads\/:id\/history"[\s\S]{0,120}<LoadHistoryPage \/>/.test(s.manifest)) out.push("the single-load change timeline route was removed");
  if (!/\{ label: "Load history", href: "\/dispatch\/load-history" \}/.test(s.subnav)) out.push("Dispatch subnav has no Load history tab");
  if (!/\/api\/v1\/reports\/loads-history\?/.test(s.api)) out.push("the frontend client does not read the loads-history endpoint");
  if (!/getLoadsHistory\(/.test(s.page)) out.push("the board does not read the loads-history hub (second engine?)");
  if (/apiRequest\(|(?<![.\w])fetch\(/.test(s.page) || /apiRequest\(|(?<![.\w])fetch\(/.test(s.panel)) out.push("the board/panel calls an endpoint directly instead of the shared api clients");
  for (const k of ["load", "customer", "driver", "unit", "invoice", "settlement"]) {
    if (!new RegExp(`<EntityLink kind="${k}"`).test(s.page)) out.push(`the list's ${k} cell does not open its record`);
  }
  if (!/onClick=\{\(\) => openPanel\(r\)\}/.test(s.page)) out.push("non-record cells do not open the load panel");
  if (!/formatDateUS/.test(s.page) || !/formatPersonName/.test(s.page) || !/formatCompanyName/.test(s.page) || !/formatUsdCents/.test(s.page)) out.push("the board formats dates/names/money by hand");
  if (!/getDispatchLoadHistory\(/.test(s.panel)) out.push("the panel timeline does not read the load history engine");
  if (!/getLoadCostRollup\(/.test(s.panel)) out.push("the panel money does not read the canonical load-cost rollup");
  if (!/listLoadExpenses\(/.test(s.panel)) out.push("the panel does not list the load's fuel and expenses");
  if (!/listFiles\(\{[^}]*entity_type: "load"/.test(s.panel)) out.push("the panel does not list the load's documents");
  for (const k of ["customer", "driver", "unit", "trailer", "factoring_advance", "document", "expense"]) {
    if (!new RegExp(`kind="${k}"`).test(s.panel)) out.push(`the panel's linked ${k} does not open its record`);
  }
  if (!/LOADS_REPORT_SCOPE_SQL/.test(s.lhService) || !/l\.status::text NOT IN \('draft', 'voided'\)/.test(s.lhService)) out.push("loads-history scope no longer derives from the loads-report scope");
  if (!/GROUP BY l\.status/.test(s.lhService) || !/ignoreStatus: true, includeCancelled: true/.test(s.lhService)) out.push("status counts do not count cancelled / follow the status filter");
  if (!/inv\.id IS NULL OR inv\.id = first_inv\.id/.test(s.lhService)) out.push("loads-history totals double-count loads with two live invoices");
  if (!/include_cancelled/.test(s.lhRoute)) out.push("the loads-history route cannot include cancelled loads");
  // ---- Row 23 ----
  if (!/settlement_deduction_noncash IS NOT TRUE/.test(s.pred) || !/bill_id IS NOT NULL/.test(s.pred) || !/FROM accounting\.bills ap_bill/.test(s.pred)) out.push("the A/P bill-payment predicate no longer excludes settlement deductions / requires an A/P bill");
  if (!/apBillPaymentOnlySql\("bp"\)/.test(fnBody(s.bills, "export async function listBillPayments("))) out.push("Accounting › Bill Payments list reader does not use the A/P bill-payment predicate");
  if (/apBillPaymentOnlySql/.test(fnBody(s.bills, "export async function listBillPaymentsForBill("))) out.push("the per-bill drill hides settlement deductions applied to that bill");
  if (!/AND \$\{apBillPaymentOnlySql\("bp"\)\}/.test(s.vendorBp)) out.push("vendor/driver Bill payments tab lists settlement deductions (escrow) as bill payments");
  if (!/AND \$\{apBillPaymentOnlySql\("bp"\)\}/.test(s.vendorProfile)) out.push("vendor profile activity lists settlement deductions (escrow) as bill payments");
  return out;
}

const src = Object.fromEntries(Object.entries(F).map(([k, f]) => [k, readFileSync(path.join(ROOT, f), "utf8")]));
if (process.argv.includes("--selftest")) {
  const plant = (k, a, b) => ({ ...src, [k]: src[k].split(a).join(b) });
  const plants = [
    ["route dropped", plant("manifest", 'path="/dispatch/load-history"', 'path="/dispatch/load-history-x"')],
    ["change timeline removed", plant("manifest", 'path="/dispatch/loads/:id/history"', 'path="/x"')],
    ["subnav tab dropped", plant("subnav", '{ label: "Load history", href: "/dispatch/load-history" },', "")],
    ["second engine", plant("page", "getLoadsHistory(", "getSomethingElse(")],
    ["customer cell dead", plant("page", '<EntityLink kind="customer"', '<span data-kind="customer"')],
    ["cells do not open panel", plant("page", "onClick={() => openPanel(r)}", "onClick={() => undefined}")],
    ["timeline not from history", plant("panel", "getDispatchLoadHistory(", "getOther(")],
    ["money not from rollup", plant("panel", "getLoadCostRollup(", "getOther(")],
    ["direct fetch", plant("panel", "const loadId = row.load_id;", "const loadId = row.load_id; void fetch(\"/x\");")],
    ["docs dropped", plant("panel", 'entity_type: "load"', 'entity_type: "driver"')],
    ["status counts lose cancelled", plant("lhService", "ignoreStatus: true, includeCancelled: true", "ignoreStatus: true")],
    ["totals double count", plant("lhService", "inv.id IS NULL OR inv.id = first_inv.id", "TRUE")],
    ["predicate lets escrow in", plant("pred", "settlement_deduction_noncash IS NOT TRUE", "settlement_deduction_noncash IS NOT NULL")],
    ["list reader bypasses predicate", plant("bills", '      apBillPaymentOnlySql("bp"),\n', '      "TRUE",\n')],
    ["vendor tab bypasses predicate", plant("vendorBp", 'AND ${apBillPaymentOnlySql("bp")}', "")],
    ["vendor profile bypasses predicate", plant("vendorProfile", 'AND ${apBillPaymentOnlySql("bp")}', "")],
  ];
  let caught = 0;
  for (const [name, planted] of plants) {
    const changed = Object.keys(F).some((k) => planted[k] !== src[k]);
    const hit = changed && findDefects(planted).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}`);
    if (hit) caught++;
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${plants.length} planted defects caught`);
  process.exit(caught === plants.length ? 0 : 1);
}
const defects = findDefects(src);
if (defects.length) {
  console.error(`${LABEL} FAIL:\n - ${defects.join("\n - ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — Dispatch Load history lists every load from the hub with its panel; Bill Payments lists A/P bill payments only`);
