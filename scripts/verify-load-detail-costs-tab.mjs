#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";
const COSTS = "apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx";
const BOARD = "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx";
const ROUTES = "apps/frontend/src/routes/manifest.tsx";
const BACKEND = "apps/backend/src/accounting/load-costs-board.routes.ts";
const FINANCE = "apps/frontend/src/pages/finance/FinanceModuleTabs.tsx";
const SIDEBAR = "apps/frontend/src/components/layout/sidebar-config.ts";
const DISPATCH = "apps/frontend/src/pages/dispatch/DispatchOverview.tsx";
const PANEL = "apps/frontend/src/components/dispatch/DispatchLoadCostsPanel.tsx";
const SUBNAV = "apps/frontend/src/pages/accounting/subnav-manifest.ts";
const DNAV = "apps/frontend/src/components/dispatch/DispatchSubnav.tsx";
const DPAGE = "apps/frontend/src/pages/Dispatch.tsx";

function violations(drawer, costs, board, routes, backend, finance, sidebar, dispatch, panel, subnav, dnav, dpage) {
  const errors = [];
  if (!drawer.includes('"Costs",') || !drawer.includes('activeTab === "Costs"') || !drawer.includes("<LoadDetailCostsTab")) errors.push("13th Costs tab is not mounted");
  if (!costs.includes("listExpenses(opco, { load_id: load.id") || !costs.includes("listBills(opco, { load_id: load.id")) errors.push("existing load-scoped expense/bill reads are missing");
  if (!costs.includes('data-cost-driver-column="driver_uuid"') || !costs.includes('data-cost-driver-column="driver_id"')) errors.push("expense.driver_uuid and bill.driver_id identities are not explicit");
  if (!costs.includes('type CostChoice = "expense" | "bill" | null') || !costs.includes("Choose a cost type to continue.")) errors.push("Expense-or-Bill choice no longer starts with no default");
  if (costs.includes('method: "POST"') || costs.includes("dispatch.load_costs")) errors.push("Costs tab introduced a writer or parallel ledger");
  if (!costs.includes("Approximate · before settlement") || !costs.includes("No costs on this load yet.")) errors.push("honest margin or empty-state copy is missing");
  if (!board.includes('title="Load costs"') || !board.includes('to={`/dispatch/loads/${encodeURIComponent(row.load.id)}?tab=Costs`}')) errors.push("Accounting Costs board or canonical Costs-tab drill is missing");
  if (!board.includes("listAllLoads") || !board.includes("/api/v1/accounting/load-costs-board")) errors.push("Costs board is not composed from canonical load/accounting readers");
  if (!board.includes("Incurred") || !board.includes("formatDateUS(row.load.created_at)")) errors.push("Load costs board missing visible incurred date");
  if (!routes.includes('path="/accounting/load-costs"') || !drawer.includes('initialTab?: DrawerTab')) errors.push("Costs board route or drawer deep-link contract is missing");
  if (!backend.includes("FULL OUTER JOIN bill_costs") || !backend.includes("SUM(ROUND(bl.amount * 100))") || !backend.includes("e.load_id IS NOT NULL")) errors.push("per-load expense/bill allocation is not enforced");
  if (!backend.includes("LOAD_COSTS_HUB_LINKAGE") || !backend.includes("org.companies") || !backend.includes("maintenance.work_orders")) errors.push("Load costs board is missing the twelve-hub declaration");
  if (backend.includes("INSERT INTO") || backend.includes("UPDATE accounting") || backend.includes("DELETE FROM")) errors.push("Costs board backend introduced a writer");
  if (!backend.includes('"Dispatcher"')) errors.push("load-costs-board GET must stay readable while dispatching");
  if (!finance.includes('to: "/accounting/load-costs"') || !finance.includes('label: "Load costs"')) errors.push("Finance hub door to the same Load costs page is missing");
  if (finance.includes("LoadCostsBoardPage")) errors.push("Finance hub forked Load costs instead of linking the one page");
  if (!sidebar.includes('{ label: "Load costs", to: "/accounting/load-costs" }')) errors.push("Finance flyout door to Load costs is missing");
  if (!dispatch.includes("<DispatchLoadCostsPanel") || !panel.includes("/api/v1/accounting/load-costs-board") || !panel.includes("listAllLoads")) errors.push("Dispatch does not reuse the load-costs-board read model");
  if (!panel.includes("Approximate") || !panel.includes("data-testid=\"dispatch-load-costs-panel\"")) errors.push("Dispatch load-cost metrics dropped Approximate or the live proof hook");
  if (panel.includes('method: "POST"') || panel.includes("INSERT INTO")) errors.push("Dispatch load-cost panel writes");
  if (!subnav.includes('{ label: "Load costs", path: "/accounting/load-costs", section: "expenses" }')) errors.push("Expenses dropdown Load costs entry was removed");
  if (!dnav.includes('{ label: "Load costs", href: "/accounting/load-costs" }')) errors.push("Dispatch menu has no Load costs entry — a buried panel is not a door");
  if (!dpage.includes('{ id: "load_costs", label: "Load costs" }')) errors.push("Dispatch tab strip is missing Load costs next to the boards");
  return errors;
}

function check(...args) {
  const errors = violations(...args);
  if (errors.length) throw new Error(errors.join("; "));
}

function runBookLoadGuard() {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "verify-book-load-money-and-controls.mjs");
  const args = process.argv.includes("--selftest") ? [script, "--selftest"] : [script];
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const drawer = fs.readFileSync(DRAWER, "utf8");
const costs = fs.readFileSync(COSTS, "utf8");
const board = fs.readFileSync(BOARD, "utf8");
const routes = fs.readFileSync(ROUTES, "utf8");
const backend = fs.readFileSync(BACKEND, "utf8");
const finance = fs.readFileSync(FINANCE, "utf8");
const sidebar = fs.readFileSync(SIDEBAR, "utf8");
const dispatch = fs.readFileSync(DISPATCH, "utf8");
const panel = fs.readFileSync(PANEL, "utf8");
const subnav = fs.readFileSync(SUBNAV, "utf8");
const dnav = fs.readFileSync(DNAV, "utf8");
const dpage = fs.readFileSync(DPAGE, "utf8");

if (process.argv.includes("--selftest")) {
  const base = [drawer, costs, board, routes, backend, finance, sidebar, dispatch, panel, subnav, dnav, dpage];
  const mutations = [
    [drawer.replace('"Costs",', '"Former costs",'), costs, board, routes, backend, finance, sidebar, dispatch, panel, subnav, dnav, dpage],
    [drawer, costs.replace('data-cost-driver-column="driver_id"', 'data-cost-driver-column="driver_uuid"'), board, routes, backend, finance, sidebar, dispatch, panel, subnav, dnav, dpage],
    [drawer, costs.replace('type CostChoice = "expense" | "bill" | null', 'type CostChoice = "expense" | "bill"'), board, routes, backend, finance, sidebar, dispatch, panel, subnav, dnav, dpage],
    [drawer, costs.replaceAll("No costs on this load yet.", "No rows."), board, routes, backend, finance, sidebar, dispatch, panel, subnav, dnav, dpage],
    [drawer, costs, board.replaceAll("listAllLoads", "listRecentLoads"), routes, backend, finance, sidebar, dispatch, panel, subnav, dnav, dpage],
    [drawer, costs, board, routes.replace('path="/accounting/load-costs"', 'path="/accounting/costs"'), backend, finance, sidebar, dispatch, panel, subnav, dnav, dpage],
    [drawer, costs, board, routes, backend, finance.replaceAll("/accounting/load-costs", "/finance/load-costs"), sidebar, dispatch, panel, subnav, dnav, dpage],
    [drawer, costs, board, routes, backend, finance, sidebar.replaceAll("Load costs", "Load P&L"), dispatch, panel, subnav, dnav, dpage],
    [drawer, costs, board, routes, backend, finance, sidebar, dispatch.replace("<DispatchLoadCostsPanel", "<div"), panel, subnav, dnav, dpage],
    [drawer, costs, board, routes, backend, finance, sidebar, dispatch, panel.replaceAll("Approximate", "Final"), subnav, dnav, dpage],
    [drawer, costs, board, routes, backend, finance, sidebar, dispatch, panel, subnav.replace("Load costs", "Load spend"), dnav, dpage],
    [drawer, costs, board, routes, backend, finance, sidebar, dispatch, panel, subnav, dnav.replace("Load costs", "Load spend"), dpage],
  ];
  let caught = 0;
  for (const [index, args] of mutations.entries()) {
    try { check(...args); } catch { caught += 1; continue; }
    throw new Error(`selftest mutation ${index + 1} escaped detection`);
  }
  try { check(...base); } catch (error) {
    throw new Error(`selftest good files failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (caught !== mutations.length) throw new Error(`selftest caught ${caught}/${mutations.length} planted regressions`);
  console.log(`PASS verify-load-detail-costs-tab --selftest (${caught}/${mutations.length})`);
  runBookLoadGuard();
} else {
  check(drawer, costs, board, routes, backend, finance, sidebar, dispatch, panel, subnav, dnav, dpage);
  console.log("PASS verify-load-detail-costs-tab");
  runBookLoadGuard();
}
