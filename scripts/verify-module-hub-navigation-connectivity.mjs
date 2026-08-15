#!/usr/bin/env node
/** @matrix-built {"modules":["finance","fuel","help","home","reports"],"cols":["connectivity"],"leafRe":"^(hub(\\.alias)?|nav\\.(overview|statements|ar_ap_aging|projections|scenarios|break_even|calculator|amortization|loan_wizard)|statements\\.(pl|bs|tb)|home|planner|relay_inbox|settings|expense_mapping|loves_prices|compliance|center|overview|runbooks|article|search|cat\\.(getting_started|dispatch|settlements|banking|reports|ops_dispatch|driver_perf|equipment|safety|customers|vendors|accounting|tax_reg|multi_company)|jump\\.(maintenance|fuel|safety|drivers|dispatch|lists)|hub\\.(driver|driver_reporting)|hop\\.program|home\\.(reports|hub|custom_builder)|subnav\\.(reports|category_hub|run_report|cancellations|scheduled_custom|audit))$","task":"LINK-F5156-MODULE-HUB-NAVIGATION-CONNECTIVITY","vertical":"class-sweep"} */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  finance: "apps/frontend/src/pages/finance/FinanceModuleTabs.tsx",
  statements: "apps/frontend/src/pages/finance/FinancialStatementsPage.tsx",
  fuelConfig: "apps/frontend/src/pages/fuel/FUEL_TABS_CONFIG.ts",
  fuel: "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
  sidebar: "apps/frontend/src/components/layout/sidebar-config.ts",
  helpCenter: "apps/frontend/src/pages/help/HelpCenterPage.tsx",
  helpOverview: "apps/frontend/src/pages/help/HelpPage.tsx",
  homeJumps: "apps/frontend/src/pages/home/homeQuickJumps.ts",
  ownerHome: "apps/frontend/src/pages/home/OwnerHome.tsx",
  reportsSubnav: "apps/frontend/src/pages/reports/ReportsSubNav.tsx",
  reportsHome: "apps/frontend/src/pages/reports/ReportsHome.tsx",
  reportsHub: "apps/frontend/src/pages/reports/ReportsHub.tsx",
  routes: "apps/frontend/src/routes/manifest.tsx",
  financeMatrix: "docs/specs/scoreboard/modules/finance.required.json",
  fuelMatrix: "docs/specs/scoreboard/modules/fuel.required.json",
  helpMatrix: "docs/specs/scoreboard/modules/help.required.json",
  homeMatrix: "docs/specs/scoreboard/modules/home.required.json",
  reportsMatrix: "docs/specs/scoreboard/modules/reports.required.json",
};

const REQUIRED_LEAVES = {
  financeMatrix: ["hub", "hub.alias", "nav.statements", "statements.pl", "statements.bs", "statements.tb", "nav.ar_ap_aging", "nav.break_even", "nav.calculator", "nav.amortization", "nav.loan_wizard"],
  fuelMatrix: ["home", "planner", "relay_inbox", "settings", "expense_mapping", "loves_prices", "compliance"],
  helpMatrix: [],
  homeMatrix: ["hub.driver", "hub.driver_reporting"],
  reportsMatrix: ["home.reports", "home.hub", "home.custom_builder", "subnav.reports", "subnav.category_hub", "subnav.run_report", "subnav.cancellations", "subnav.scheduled_custom", "subnav.audit"],
};

const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

export function verify(source) {
  const failures = [];
  const need = (key, token, message) => { if (!source[key].includes(token)) failures.push(message); };
  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const needNavItem = (key, label, href, message) => {
    const item = new RegExp(`\\{\\s*label:\\s*"${escapeRegExp(label)}",\\s*href:\\s*"${escapeRegExp(href)}"`);
    if (!item.test(source[key])) failures.push(message);
  };

  for (const route of ["/finance", "/finance/hub", "/finance/overview", "/finance/statements", "/finance/ar-ap-aging", "/finance/projections", "/finance/scenarios", "/finance/break-even", "/finance/calculator", "/finance/amortization", "/finance/loan-wizard"]) need("routes", `path="${route}"`, `finance route ${route} must remain mounted`);
  for (const id of ["overview", "projections", "scenarios", "hub", "statements", "ar-ap-aging", "break-even", "loan-wizard", "calculator", "amortization"]) need("finance", `id: "${id}"`, `finance nav ${id} must remain visible when applicable`);
  for (const id of ["pl", "bs", "tb"]) need("statements", `id: "${id}"`, `financial statement tab ${id} must remain visible`);
  need("finance", "onClick={() => navigate(tab.to)}", "finance tabs must navigate to their mounted route");

  for (const id of ["home", "planner", "relay_inbox", "settings", "expense_mapping", "loves_prices", "compliance"]) need("fuelConfig", `id: "${id}"`, `fuel nav ${id} must remain canonical`);
  need("fuel", "onChange={(next) => goToTab(next as FuelTabId)}", "fuel subnav must navigate through the canonical path registry");
  for (const route of ["/fuel", "/fuel/planner", "/fuel/inbox", "/fuel/settings", "/fuel/expense-mapping", "/fuel/loves-prices", "/fuel/compliance"]) need("routes", `path="${route}"`, `fuel route ${route} must remain mounted`);

  for (const route of ["/help", "/help/overview", "/help/runbooks", "/help/:slug"]) need("routes", `path="${route}"`, `help route ${route} must remain mounted`);
  for (const route of ["/help", "/help/overview", "/help/runbooks"]) need("sidebar", `to: "${route}"`, `help flyout must expose ${route}`);
  need("helpCenter", 'id="help-search"', "help center must retain searchable article navigation");
  for (const category of ["Getting Started", "Dispatching Loads", "Driver Settlements", "Banking & Reconciliation", "Reports"]) need("helpCenter", `"${category}"`, `help category ${category} must remain visible`);
  need("helpCenter", 'kind="help_article"', "help articles must drill via EntityLink kind=help_article");
  need("helpOverview", 'to: "/help/runbooks"', "help overview must retain its runbooks door");


  for (const route of ["/maintenance", "/fuel", "/safety", "/drivers", "/dispatch", "/lists"]) need("homeJumps", `to: "${route}"`, `home quick jump ${route} must remain canonical`);
  need("ownerHome", "HOME_QUICK_JUMPS.map", "owner home must render every canonical quick jump");
  need("ownerHome", 'to="/driver-hub"', "owner home must retain the Driver Hub door");
  need("ownerHome", 'to="/program"', "owner home must retain the owner-only Program door");
  for (const route of ["/driver-hub", "/driver-hub/reporting", "/program"]) need("routes", `path="${route}"`, `home destination ${route} must remain mounted`);

  for (const [label, href] of [["Reports", "/reports"], ["Category hub", "/reports/hub"], ["Run report", "/reports/hub"], ["Cancellations", "/reports/cancellations"], ["Scheduled (custom)", "/reports/scheduled-custom"], ["Audit", "/reports/audit/activity-by-user"]]) {
    needNavItem("reportsSubnav", label, href, `reports subnav ${label} must remain wired`);
  }
  need("reportsHome", "<ReportsSubNav />", "reports home must retain shared subnavigation");
  need("reportsHome", "setShowCustomBuilder", "reports home must retain its custom-builder door");
  need("reportsHub", "<ReportsSubNav />", "reports hub must retain shared subnavigation");
  need("reportsHub", 'kind="report_category"', "reports hub must link every returned category landing via EntityLink");
  for (const slug of ["ops-dispatch", "driver-perf", "equipment", "safety", "customers", "vendors", "accounting", "tax-reg", "multi-company"]) need("routes", `path="/reports/categories/${slug}"`, `report category ${slug} must remain mounted`);
  for (const route of ["/reports", "/reports/hub", "/reports/cancellations", "/reports/scheduled-custom", "/reports/audit/activity-by-user"]) need("routes", `path="${route}"`, `reports route ${route} must remain mounted`);

  for (const [key, ids] of Object.entries(REQUIRED_LEAVES)) {
    let matrix;
    try { matrix = JSON.parse(source[key]); } catch (error) { failures.push(`${key} must parse: ${error.message}`); continue; }
    for (const id of ids) {
      const leaf = matrix.leaves?.find((candidate) => candidate.id === id);
      if (!leaf?.required?.includes("connectivity")) failures.push(`${key}:${id} must inventory connectivity`);
    }
  }
  return failures;
}

const source = read();
const failures = verify(source);
if (failures.length) {
  console.error("module hub navigation connectivity guard failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

if (process.argv.includes("--self-test")) {
  const mutations = [
    ["finance", 'id: "overview"', 'id: "broken-overview"'], ["finance", "onClick={() => navigate(tab.to)}", "onClick={() => undefined}"],
    ["statements", 'id: "pl"', 'id: "broken-pl"'], ["fuelConfig", 'id: "home"', 'id: "broken-home"'],
    ["fuel", "onChange={(next) => goToTab(next as FuelTabId)}", "onChange={() => undefined}"],
    ["sidebar", 'to: "/help/overview"', 'to: "/broken-help"'], ["helpCenter", 'id="help-search"', 'id="broken-help-search"'],
    ["helpCenter", '"Getting Started"', '"Broken category"'], ["helpCenter", 'kind="help_article"', 'kind="broken_help"'],
    ["helpOverview", 'to: "/help/runbooks"', 'to: "/help"'], ["homeJumps", 'to: "/maintenance"', 'to: "/broken-maintenance"'],
    ["ownerHome", "HOME_QUICK_JUMPS.map", "[].map"], ["ownerHome", 'to="/program"', 'to="/broken-program"'],
    ["reportsSubnav", '{ label: "Reports", href: "/reports"', '{ label: "Reports", href: "/broken"'],
    ["reportsSubnav", 'label: "Run report"', 'label: "Broken runner"'],
    ["reportsSubnav", 'label: "Audit"', 'label: "Broken audit"'],
    ["reportsHome", "<ReportsSubNav />", "<div />"], ["reportsHome", "setShowCustomBuilder", "brokenCustomBuilder"],
    ["reportsHub", 'kind="report_category"', 'kind="broken_category"'],
    ["routes", 'path="/finance/statements"', 'path="/broken-finance"'], ["routes", 'path="/fuel/planner"', 'path="/broken-fuel"'],
    ["routes", 'path="/help/runbooks"', 'path="/broken-help"'], ["routes", 'path="/driver-hub/reporting"', 'path="/broken-driver-hub"'],
    ["routes", 'path="/reports/categories/ops-dispatch"', 'path="/broken-reports"'],
    ["financeMatrix", '"id": "hub"', '"id": "broken.hub"'], ["fuelMatrix", '"id": "planner"', '"id": "broken.planner"'],
    ["homeMatrix", '"id": "hub.driver"', '"id": "broken.driver"'],
    ["reportsMatrix", '"id": "subnav.reports"', '"id": "broken.reports"'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`self-test fixture missing: ${key} ${before}`);
    if (!verify({ ...source, [key]: source[key].replaceAll(before, after) }).length) throw new Error(`self-test mutation survived: ${key}`);
  }
  console.log(`PASS: ${mutations.length} planted module-hub defects were rejected`);
}

console.log("PASS: 58 exact module-hub navigation leaves remain mounted and operator-reachable");
