#!/usr/bin/env node
import fs from "node:fs";

const DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";
const COSTS = "apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx";
const BOARD = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";
const ROUTES = "apps/frontend/src/routes/manifest.tsx";
const BACKEND = "apps/backend/src/accounting/load-costs-board.routes.ts";

function violations(drawer, costs, board, routes, backend) {
  const errors = [];
  if (!drawer.includes('"Costs",') || !drawer.includes('activeTab === "Costs"') || !drawer.includes("<LoadDetailCostsTab")) errors.push("13th Costs tab is not mounted");
  if (!costs.includes("listExpenses(opco, { load_id: load.id") || !costs.includes("listBills(opco, { load_id: load.id")) errors.push("existing load-scoped expense/bill reads are missing");
  if (!costs.includes('data-cost-driver-column="driver_uuid"') || !costs.includes('data-cost-driver-column="driver_id"')) errors.push("expense.driver_uuid and bill.driver_id identities are not explicit");
  if (!costs.includes('type CostChoice = "expense" | "bill" | null') || !costs.includes("Choose a cost type to continue.")) errors.push("Expense-or-Bill choice no longer starts with no default");
  if (!costs.includes("Approximate · before settlement") || !costs.includes("No costs on this load yet.")) errors.push("honest margin or empty-state copy is missing");
  if (costs.includes('method: "POST"') || costs.includes("dispatch.load_costs")) errors.push("Costs tab introduced a writer or parallel ledger");
  if (!board.includes('title="Load costs"') || !board.includes('to={`/dispatch/loads/${encodeURIComponent(row.load.id)}?tab=Costs`}')) errors.push("Accounting Costs board or canonical Costs-tab drill is missing");
  if (!board.includes("listAllLoads") || !board.includes("/api/v1/accounting/load-costs-board")) errors.push("Costs board is not composed from canonical load/accounting readers");
  if (!routes.includes('path="/accounting/load-costs"') || !drawer.includes('initialTab?: DrawerTab')) errors.push("Costs board route or drawer deep-link contract is missing");
  if (!backend.includes("FULL OUTER JOIN bill_costs") || !backend.includes("SUM(ROUND(bl.amount * 100))") || !backend.includes("e.load_id IS NOT NULL")) errors.push("per-load expense/bill allocation is not enforced");
  if (backend.includes("INSERT INTO") || backend.includes("UPDATE accounting") || backend.includes("DELETE FROM")) errors.push("Costs board backend introduced a writer");
  return errors;
}

function check(drawer, costs, board, routes, backend) {
  const errors = violations(drawer, costs, board, routes, backend);
  if (errors.length) throw new Error(errors.join("; "));
}

const drawer = fs.readFileSync(DRAWER, "utf8");
const costs = fs.readFileSync(COSTS, "utf8");
const board = fs.readFileSync(BOARD, "utf8");
const routes = fs.readFileSync(ROUTES, "utf8");
const backend = fs.readFileSync(BACKEND, "utf8");

if (process.argv.includes("--selftest")) {
  const mutations = [
    [drawer.replace('"Costs",', '"Former costs",'), costs, board, routes, backend],
    [drawer, costs.replace('data-cost-driver-column="driver_id"', 'data-cost-driver-column="driver_uuid"'), board, routes, backend],
    [drawer, costs.replace('type CostChoice = "expense" | "bill" | null', 'type CostChoice = "expense" | "bill"'), board, routes, backend],
    [drawer, costs.replaceAll("No costs on this load yet.", "No rows."), board, routes, backend],
    [drawer, costs, board.replaceAll("listAllLoads", "listRecentLoads"), routes, backend],
    [drawer, costs, board, routes.replace('path="/accounting/load-costs"', 'path="/accounting/costs"'), backend],
  ];
  let caught = 0;
  for (const [index, [mutatedDrawer, mutatedCosts, mutatedBoard, mutatedRoutes, mutatedBackend]] of mutations.entries()) {
    try { check(mutatedDrawer, mutatedCosts, mutatedBoard, mutatedRoutes, mutatedBackend); } catch { caught += 1; continue; }
    throw new Error(`selftest mutation ${index + 1} escaped detection`);
  }
  if (caught !== mutations.length) throw new Error(`selftest caught ${caught}/${mutations.length} planted regressions`);
  console.log(`PASS verify-load-detail-costs-tab --selftest (${caught}/${mutations.length})`);
} else {
  check(drawer, costs, board, routes, backend);
  console.log("PASS verify-load-detail-costs-tab");
}
