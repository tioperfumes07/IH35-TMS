#!/usr/bin/env node
import fs from "node:fs";

const DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";
const COSTS = "apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx";

function violations(drawer, costs) {
  const errors = [];
  if (!drawer.includes('"Costs",') || !drawer.includes('activeTab === "Costs"') || !drawer.includes("<LoadDetailCostsTab")) errors.push("13th Costs tab is not mounted");
  if (!costs.includes("listExpenses(opco, { load_id: load.id") || !costs.includes("listBills(opco, { load_id: load.id")) errors.push("existing load-scoped expense/bill reads are missing");
  if (!costs.includes('data-cost-driver-column="driver_uuid"') || !costs.includes('data-cost-driver-column="driver_id"')) errors.push("expense.driver_uuid and bill.driver_id identities are not explicit");
  if (!costs.includes('type CostChoice = "expense" | "bill" | null') || !costs.includes("Choose a cost type to continue.")) errors.push("Expense-or-Bill choice no longer starts with no default");
  if (!costs.includes("Approximate · before settlement") || !costs.includes("No costs on this load yet.")) errors.push("honest margin or empty-state copy is missing");
  if (costs.includes('method: "POST"') || costs.includes("dispatch.load_costs")) errors.push("Costs tab introduced a writer or parallel ledger");
  return errors;
}

function check(drawer, costs) {
  const errors = violations(drawer, costs);
  if (errors.length) throw new Error(errors.join("; "));
}

const drawer = fs.readFileSync(DRAWER, "utf8");
const costs = fs.readFileSync(COSTS, "utf8");

if (process.argv.includes("--selftest")) {
  const mutations = [
    [drawer.replace('"Costs",', '"Former costs",'), costs],
    [drawer, costs.replace('data-cost-driver-column="driver_id"', 'data-cost-driver-column="driver_uuid"')],
    [drawer, costs.replace('type CostChoice = "expense" | "bill" | null', 'type CostChoice = "expense" | "bill"')],
    [drawer, costs.replaceAll("No costs on this load yet.", "No rows.")],
  ];
  let caught = 0;
  for (const [mutatedDrawer, mutatedCosts] of mutations) {
    try { check(mutatedDrawer, mutatedCosts); } catch { caught += 1; }
  }
  if (caught !== mutations.length) throw new Error(`selftest caught ${caught}/${mutations.length} planted regressions`);
  console.log(`PASS verify-load-detail-costs-tab --selftest (${caught}/${mutations.length})`);
} else {
  check(drawer, costs);
  console.log("PASS verify-load-detail-costs-tab");
}
