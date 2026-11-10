#!/usr/bin/env node
/**
 * ROUND 8.4 / UI-F11125 — Design parity census (PR 1).
 *
 * For every route in apps/frontend/src/routes/manifest.tsx, record:
 *   module · tab/subtab (path segments) · governing design source · static app-wide rule pass/fail.
 *
 * Writes docs/design/DESIGN-PARITY-CENSUS.md and ratchets scripts/design-parity-census-baseline.json
 * (failing route count may only go down).
 *
 * Run:
 *   node scripts/verify-design-parity-census.mjs
 *   node scripts/verify-design-parity-census.mjs --write-census
 *   node scripts/verify-design-parity-census.mjs --lower
 *   node scripts/verify-design-parity-census.mjs --selftest
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-design-parity-census";
const MANIFEST = path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");
const CENSUS_MD = path.join(ROOT, "docs/design/DESIGN-PARITY-CENSUS.md");
const BASELINE = path.join(ROOT, "scripts/design-parity-census-baseline.json");
const V3_DIR = path.join(ROOT, "docs/design/v3");
const BOARDS_DIR = path.join(ROOT, "docs/design/boards");
const APPROVED_DIR = path.join(ROOT, "docs/design/approved-screens");
const PAGES_DIR = path.join(ROOT, "apps/frontend/src/pages");

/** Path-prefix → primary design source(s). First match wins (longest prefix preferred via sort). */
const DESIGN_BY_PREFIX = [
  ["/accounting/unexpected", "v3:Accounting-Unexpected.dc.html"],
  ["/accounting", "v3:Accounting.dc.html + approved:03-accounting-dropdown.png + board:banking (money)"],
  ["/banking", "v3:Banking.dc.html + approved:04-banking.png + board:banking"],
  ["/settlements", "v3:Settlements*.dc.html + board:settlements"],
  ["/driver-finance", "v3:Settlements*.dc.html + board:settlements"],
  ["/drivers/settlements", "v3:Settlements*.dc.html"],
  ["/drivers/pre-settlements", "v3:Settlements-PreSettlements.dc.html"],
  ["/drivers/cash-advances", "v3:Settlements-CashAdvances.dc.html"],
  ["/factoring", "v3:Factoring.dc.html"],
  ["/customers", "v3:Customers.dc.html + board:driver-customers-vendors"],
  ["/vendors", "v3:Vendors.dc.html + board:driver-customers-vendors"],
  ["/maintenance", "v3:Maintenance-Home.dc.html + approved:02-maintenance.png + board:maintenance"],
  ["/fuel", "v3:Fuel.dc.html + approved:05-fuel-planner.png + v3:Modal-FuelAssignment.dc.html"],
  ["/dispatch/load-history", "v3:Dispatch-LoadHistory.dc.html"],
  ["/dispatch", "approved:08-dispatch.png + v3:Dispatch-*.dc.html"],
  ["/safety", "v3:Safety-DriverFiles.dc.html + approved:06-safety.png"],
  ["/compliance", "approved:06-safety.png (app-wide + compliance)"],
  ["/drivers", "v3:DriverProfile.dc.html + approved:07-drivers.png + board:driver-customers-vendors"],
  ["/fleet/units", "v3:maintenance-vehicle-graphics/TruckProfile.dc.html + approved:07-drivers.png"],
  ["/fleet", "board:maintenance (fleet table) + approved:02-maintenance.png + v3:maintenance-vehicle-graphics/Main.dc.html"],
  ["/insurance", "v3:Insurance.dc.html"],
  ["/reports", "v3:Reports*.dc.html + approved:10-reports.png"],
  ["/lists", "approved:09-lists-catalogs.png"],
  ["/home", "approved:01-home.png"],
  ["/cash-flow", "v3:CashFlow-*.dc.html"],
  ["/legal", "v3:Legal.dc.html"],
  ["/system", "app-wide rules only"],
  ["/program", "app-wide rules only"],
  ["/users", "app-wide rules only"],
  ["/settings", "app-wide rules only"],
  ["/portal", "approved:12-driver-app.png"],
  ["/425c", "approved:11-form-425c.png"],
  ["/form-425c", "approved:11-form-425c.png"],
];

const APP_WIDE_RULES = [
  "coming_soon_stub",
  "status_select_not_multiselect",
  "missing_em_dash_empty",
  "parity_table_without_export_or_gear",
  "missing_design_labels",
  "unresolved_page",
  "v3_kpi_height_unlocked",
];

/**
 * Hub routes: every design KPI/section label must appear in the governing page (or sibling board) source.
 * ROUND 8.4 complete-build floor — labels from docs/design/v3/*.dc.html.
 */
const HUB_DESIGN_LABELS = [
  {
    route: "/accounting",
    files: [
      "apps/frontend/src/pages/accounting/AccountingHubPage.tsx",
    ],
    labels: [
      "Open bills",
      "MTD expenses",
      "Open invoices",
      "Overdue A/R",
      "Unmatched",
      "QBO sync",
      "Receivables aging",
      "Cash pulse",
      "Settlements open",
      "4 marks per month: bank rec · AR tie-out · AP tie-out · TB = 0 & lock.",
      "Not due",
      "1–30",
      "31–60",
      "61+",
      "Bucket",
      "Share",
    ],
  },
  {
    route: "/accounting/unexpected",
    files: ["apps/frontend/src/pages/accounting/UnexpectedExpensesPage.tsx"],
    labels: [
      "Possible duplicates",
      "Linked to a truck",
      "Tows · fines",
      "Candidates from the bank",
      "By kind",
    ],
  },
  {
    route: "/accounting/accounts-payable",
    files: ["apps/frontend/src/pages/accounting/AccountsPayableAgingPage.tsx"],
    labels: [
      "As of",
      "Aging",
      "Vendor type",
      "Basis",
      "Current",
      "1–30",
      "31–60",
      "61–90",
      "91+",
      "Total",
      "Vendor",
    ],
  },
  {
    route: "/banking",
    files: [
      "apps/frontend/src/pages/banking/components/BankingHomeBoard.tsx",
      "apps/frontend/src/pages/banking/BankingHome.tsx",
    ],
    labels: [
      "Money in",
      "Money out",
      "Lines to review",
      "Drift alerts",
      "bank vs book",
      "Accounts",
      "Reconciliation drift — bank vs book",
      "Latest lines",
      "Feed",
      "No feed",
    ],
  },
  {
    route: "/fuel",
    files: [
      "apps/frontend/src/pages/fuel/FuelHome.tsx",
      "apps/frontend/src/pages/fuel/components/FuelBoardKpiStrip.tsx",
    ],
    labels: [
      "Diesel spend",
      "Gallons",
      "Avg $/gal",
      "Fills without a load",
      "Open questions",
      "Diesel by truck",
      "Unit",
      "Spend",
      "Fills",
      "Loads",
    ],
  },
  {
    route: "/factoring",
    files: [
      "apps/frontend/src/pages/factoring/components/FactoringHomeBoard.tsx",
      "apps/frontend/src/pages/factoring/FactoringHome.tsx",
    ],
    labels: [
      "Outstanding liability",
      "Advanced MTD",
      "Repurchase deadline",
      "Chargebacks",
      "True cost",
      "Each purchase — net to bank vs kept by Faro",
      "Terms on file",
    ],
  },
  {
    route: "/driver-finance/settlements",
    files: ["apps/frontend/src/pages/driver-finance/SettlementsPage.tsx"],
    labels: [
      "Total unpaid",
      "This period",
      "Driver pay (period)",
      "Drivers w/ debt",
      "YTD settlements",
      "Open driver bills",
    ],
  },
  {
    route: "/cash-flow",
    files: [
      "apps/frontend/src/pages/cash-flow/tabs/CashFlowHomeTab.tsx",
      "apps/frontend/src/pages/cash-flow/tabs/CashFlowKpiStrip.tsx",
    ],
    labels: [
      "Opening cash",
      "Income due today",
      "Expenses due today",
      "Next 4 weeks in",
      "Weekly run-rate",
      "Lowest balance",
    ],
  },
  {
    route: "/maintenance",
    files: [
      "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx",
      "apps/frontend/src/pages/maintenance/components/FleetHealthLine.tsx",
      "apps/frontend/src/pages/maintenance/components/RMStatStrip.tsx",
      "apps/frontend/src/pages/maintenance/components/InShopBoard.tsx",
    ],
    labels: [
      "PM due soon",
      "Road service",
      "Parts low-stock",
      "MTD cost",
      "Fleet health line — road to the next PM",
      "MAINTENANCE · SHOP FLOOR",
      "Check a truck in",
      "YARD LANE · NEXT IN, BY PM URGENCY",
      "OPEN BAY",
      "OVERHEAD DOOR",
    ],
  },
  {
    route: "/maintenance/fleet-table",
    files: ["apps/frontend/src/pages/maintenance/components/InShopBoard.tsx"],
    labels: [
      "MAINTENANCE · SHOP FLOOR",
      "Check a truck in",
      "YARD LANE · NEXT IN, BY PM URGENCY",
      "OPEN BAY",
      "OVERHEAD DOOR",
    ],
  },
  {
    route: "/customers",
    files: [
      "apps/frontend/src/components/boards/PartyBoard.tsx",
      "apps/frontend/src/pages/Customers.tsx",
    ],
    labels: [
      "With transactions",
      "In the book",
      "Open invoices",
      "Billed",
      "A/R open",
      "Collected",
    ],
  },
  {
    route: "/vendors",
    files: [
      "apps/frontend/src/components/boards/VendorsHomeBoard.tsx",
      "apps/frontend/src/pages/Vendors.tsx",
    ],
    labels: [
      "With transactions",
      "In the book",
      "Spend YTD",
      "Fuel share",
      "Open bills",
      "Unposted fuel",
      "Spend by category · YTD",
    ],
  },
  {
    route: "/insurance",
    files: ["apps/frontend/src/pages/insurance/components/InsuranceHomeBoard.tsx"],
    labels: [
      "Active policies",
      "Annual premium",
      "Open claims",
      "Coverage gaps",
      "Policy year",
      "Premium by coverage",
    ],
  },
  {
    route: "/legal",
    files: ["apps/frontend/src/pages/legal/components/LegalHomeBoard.tsx"],
    labels: [
      "Expiring contracts (60d)",
      "Open matters",
      "Contract pipeline",
      "Matters & deadlines",
      "Quick actions",
    ],
  },
  {
    route: "/safety/driver-files",
    files: ["apps/frontend/src/pages/safety/components/DriverQualificationMatrix.tsx"],
    labels: [
      "Active drivers",
      "DOT medical on file",
      "Open fines",
      "Driver qualification matrix",
    ],
  },
  {
    route: "/fleet/units/:id",
    files: [
      "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx",
      "apps/frontend/src/pages/fleet/components/TruckServiceMap.tsx",
    ],
    labels: [
      "SERVICE MAP · SELECT A SYSTEM",
      "New work order",
      "DUE SOON",
      "NO RECORD",
      "Annual DOT · tractor",
    ],
  },
  {
    route: "/reports",
    files: ["apps/frontend/src/pages/reports/components/ReportsHomeBoard.tsx"],
    labels: [
      "Available reports",
      "Custom schedules",
      "Open in viewer",
      "Accounting & financial",
      "Trial balance",
      "Profit & loss",
      "Balance sheet",
      "Cash flow statement",
      "Settlement summary",
      "Customer profitability",
    ],
  },
  {
    route: "/dispatch/load-history",
    files: ["apps/frontend/src/pages/dispatch/LoadHistoryBoardPage.tsx"],
    labels: [
      "Loads",
      "Revenue (rate)",
      "Loaded miles",
      "Empty miles",
      "Rate per loaded mile",
      "Delivered, not invoiced",
    ],
  },
  {
    route: "/dispatch/planners/truck",
    files: ["apps/frontend/src/pages/dispatch/planners/DispatchPlannersLayout.tsx"],
    labels: ["Driver Planner", "Truck Planner", "Loads Planner"],
  },
];

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function moduleOf(routePath) {
  const parts = routePath.split("/").filter(Boolean);
  if (!parts.length) return "root";
  return parts[0];
}

function tabOf(routePath) {
  const parts = routePath.split("/").filter(Boolean);
  if (parts.length < 2) return "—";
  return parts.slice(1).join("/") || "—";
}

function designSourceFor(routePath) {
  const sorted = [...DESIGN_BY_PREFIX].sort((a, b) => b[0].length - a[0].length);
  for (const [prefix, src] of sorted) {
    if (routePath === prefix || routePath.startsWith(prefix + "/") || routePath.startsWith(prefix + "?")) {
      return src;
    }
  }
  return "app-wide rules only";
}

/** Absolute + nested relative paths → absolute where parent is known. */
function extractRoutes(manifestSrc) {
  const routes = [];
  const pathRe = /path="([^"]+)"/g;
  let m;
  const stack = [];
  // Approximate nesting by scanning line-by-line for Route open/close + path.
  const lines = manifestSrc.split("\n");
  for (const line of lines) {
    const openCount = (line.match(/<Route\b/g) || []).length;
    const selfClose = /\/>\s*$/.test(line) || /<\/Route>/.test(line);
    const pathMatch = line.match(/path="([^"]+)"/);
    if (pathMatch) {
      const raw = pathMatch[1];
      let abs;
      if (raw.startsWith("/")) {
        abs = raw;
        stack.push(raw);
      } else {
        const parent = stack[stack.length - 1] || "";
        abs = `${parent.replace(/\/$/, "")}/${raw}`.replace(/\/+/g, "/");
        stack.push(abs);
      }
      routes.push(abs);
      if (selfClose && openCount) stack.pop();
    }
    // Closing Route without path on same line — pop one level when </Route>
    if (/<\/Route>/.test(line) && !pathMatch) {
      stack.pop();
    }
  }
  // Deduplicate, keep order
  const seen = new Set();
  const out = [];
  for (const r of routes) {
    if (seen.has(r)) continue;
    seen.add(r);
    out.push(r);
  }
  return out;
}

/** Build ComponentName → relative page import path from manifest lazy/static imports. */
function buildImportMap(manifestSrc) {
  const map = new Map();
  const lazyRe =
    /const\s+(\w+)\s*=\s*React\.lazy\(\(\)\s*=>\s*import\("(\.\.\/pages\/[^"]+)"/g;
  let m;
  while ((m = lazyRe.exec(manifestSrc))) {
    map.set(m[1], m[2].replace(/^\.\.\//, "apps/frontend/src/").replace(/\.tsx$/, "") + ".tsx");
  }
  // Named then() default
  const lazyThenRe =
    /const\s+(\w+)\s*=\s*React\.lazy\(\(\)\s*=>\s*import\("(\.\.\/pages\/[^"]+)"\)\.then/g;
  while ((m = lazyThenRe.exec(manifestSrc))) {
    const file = m[2].replace(/^\.\.\//, "apps/frontend/src/") + (m[2].endsWith(".tsx") ? "" : ".tsx");
    // import may omit .tsx and end without extension
    const cleaned = file.replace(/\.tsx\.tsx$/, ".tsx");
    map.set(m[1], cleaned.endsWith(".tsx") ? cleaned : cleaned + ".tsx");
  }
  const staticRe = /import\s+\{\s*([^}]+)\s*\}\s+from\s+"(\.\.\/pages\/[^"]+)"/g;
  while ((m = staticRe.exec(manifestSrc))) {
    const names = m[1].split(",").map((s) => s.trim().split(/\s+as\s+/).pop().trim());
    const file = m[2].replace(/^\.\.\//, "apps/frontend/src/") + (m[2].endsWith(".tsx") ? "" : ".tsx");
    for (const n of names) if (n) map.set(n, file);
  }
  return map;
}

/** Best-effort: find element={<Name} near a path= line in manifest. */
function pageFileForRoute(manifestSrc, routePath, importMap) {
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match path="route" then look ahead ~15 lines for a capitalised component
  const re = new RegExp(`path="${escaped}"([\\s\\S]{0,800}?)(?:path=|</Route>|/>)`, "m");
  const m = re.exec(manifestSrc);
  if (!m) return null;
  const chunk = m[1];
  const comps = [...chunk.matchAll(/<([A-Z][A-Za-z0-9]+)/g)].map((x) => x[1]);
  const skip = new Set([
    "Route",
    "ProtectedRoute",
    "PortalRouteGuard",
    "PortalLayout",
    "Navigate",
    "Suspense",
    "Fragment",
  ]);
  for (const c of comps) {
    if (skip.has(c)) continue;
    if (importMap.has(c)) return importMap.get(c);
  }
  return null;
}

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function scorePage(fileRel, src) {
  const fails = [];
  // Unresolved page is tracked but does NOT fail the route for the ratchet floor —
  // ROUND 8.4 BUILD phase binds design files; census fails are rule hits on resolved sources.
  if (!fileRel) {
    return { fails: ["unresolved_page"], routeFail: false };
  }
  if (!src) {
    return { fails: ["unresolved_page"], routeFail: false };
  }
  const code = stripComments(src);
  // App-wide rule: user-visible Coming soon stub copy = FAIL (owner complete-build law).
  // Do NOT match test ids like coming-soon-roadmap-board or "Coming in Phase …".
  if (/\bComing soon\b|\bunder construction\b|\bnot yet implemented\b/i.test(code)) {
    fails.push("coming_soon_stub");
  }
  // U12 residual: Active/Inactive status still SelectCombobox on a list-ish page.
  if (
    /SelectCombobox/.test(code) &&
    /<option value="(active|inactive|true|false)">\s*(Active|Inactive)/.test(code) &&
    /ParityTable|filterBar|statusFilter|Show inactive/.test(code)
  ) {
    fails.push("status_select_not_multiselect");
  }
  // Lists/tables should render missing as em dash somewhere (house empty grammar).
  if (/ParityTable/.test(code) && !code.includes("—") && !/emptyText|emptyState|need-company/.test(code)) {
    fails.push("missing_em_dash_empty");
  }
  // Design law #8: gear column chooser. ParityTable defaults enableColumnResize=true —
  // only FAIL when a caller explicitly disables it on a non-print compact table.
  if (
    /<ParityTable\b/.test(code) &&
    /enableColumnResize=\{false\}/.test(code) &&
    !/Print|print|hidePager/.test(code)
  ) {
    fails.push("parity_table_without_export_or_gear");
  }
  return { fails, routeFail: fails.length > 0 };
}

function scoreHubLabels(route, readFile) {
  const hub = HUB_DESIGN_LABELS.find((h) => h.route === route);
  if (!hub) return [];
  const blob = hub.files.map((f) => {
    const abs = path.join(ROOT, f);
    return fs.existsSync(abs) ? readFile(abs) : "";
  }).join("\n");
  const missing = hub.labels.filter((label) => !blob.includes(label));
  return missing.length ? [`missing_design_labels:${missing.join("|")}`] : [];
}

function scoreV3KpiHeight(readFile) {
  const tile = readFile(path.join(ROOT, "apps/frontend/src/components/v3/V3KpiTile.tsx"));
  const tokens = readFile(path.join(ROOT, "apps/frontend/src/design/v3-tokens.ts"));
  if (!/heightPx:\s*78/.test(tokens) || !/minHeight:\s*V3_KPI\.heightPx/.test(tile)) {
    return ["v3_kpi_height_unlocked"];
  }
  return [];
}

function inventoryDesignFiles() {
  const v3 = fs.existsSync(V3_DIR)
    ? fs.readdirSync(V3_DIR).filter((f) => f.endsWith(".dc.html")).sort()
    : [];
  const boards = fs.existsSync(BOARDS_DIR)
    ? fs.readdirSync(BOARDS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    : [];
  const approved = fs.existsSync(APPROVED_DIR)
    ? fs.readdirSync(APPROVED_DIR).filter((f) => f.endsWith(".png")).sort()
    : [];
  return { v3, boards, approved };
}

export function runCensus({ writeCensus = false } = {}) {
  const manifestSrc = read(MANIFEST);
  const routes = extractRoutes(manifestSrc);
  const importMap = buildImportMap(manifestSrc);
  const designFiles = inventoryDesignFiles();

  const rows = [];
  let failingRoutes = 0;
  const failRuleCounts = Object.fromEntries(APP_WIDE_RULES.map((r) => [r, 0]));
  const byModule = new Map();
  const readFile = (abs) => (fs.existsSync(abs) ? read(abs) : "");

  // App-wide V3 KPI height pin (one synthetic hit on /home if unlocked).
  const kpiHeightFails = scoreV3KpiHeight(readFile);

  for (const route of routes) {
    const mod = moduleOf(route);
    const tab = tabOf(route);
    const design = designSourceFor(route);
    const pageRel = pageFileForRoute(manifestSrc, route, importMap);
    let src = null;
    if (pageRel) {
      const abs = path.join(ROOT, pageRel);
      if (fs.existsSync(abs)) src = read(abs);
      else {
        // try without forcing .tsx double
        const alt = abs.replace(/\.tsx$/, "");
        if (fs.existsSync(alt)) src = read(alt);
      }
    }
    const scored = scorePage(pageRel, src);
    const fails = [...scored.fails];
    // Hub design-label coverage (exact route match only).
    for (const f of scoreHubLabels(route, readFile)) fails.push(f);
    if (route === "/home" && kpiHeightFails.length) fails.push(...kpiHeightFails);
    const routeFail =
      scored.routeFail ||
      fails.some((f) => f.startsWith("missing_design_labels") || f === "v3_kpi_height_unlocked");
    if (routeFail) failingRoutes += 1;
    for (const f of fails) {
      const key = f.startsWith("missing_design_labels") ? "missing_design_labels" : f;
      if (key in failRuleCounts) failRuleCounts[key] += 1;
    }

    const row = {
      route,
      module: mod,
      tab,
      design,
      page: pageRel || "—",
      fails,
      pass: !routeFail,
      unresolved: fails.includes("unresolved_page"),
    };
    rows.push(row);

    if (!byModule.has(mod)) byModule.set(mod, { total: 0, failing: 0, unresolved: 0, routes: [] });
    const bucket = byModule.get(mod);
    bucket.total += 1;
    if (routeFail) bucket.failing += 1;
    if (row.unresolved) bucket.unresolved += 1;
    bucket.routes.push(row);
  }

  const summary = {
    generated_at: new Date().toISOString(),
    route_count: routes.length,
    failing_routes: failingRoutes,
    passing_routes: routes.length - failingRoutes,
    fail_rule_counts: failRuleCounts,
    design_inventory: {
      v3_dc_html: designFiles.v3.length,
      board_sets: designFiles.boards.length,
      approved_screens: designFiles.approved.length,
    },
    unresolved_routes: rows.filter((r) => r.unresolved).length,
    modules: [...byModule.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, b]) => ({
        module: name,
        total: b.total,
        failing: b.failing,
        unresolved: b.unresolved,
        passing: b.total - b.failing,
      })),
  };

  if (writeCensus) {
    const md = renderCensusMd(summary, byModule, designFiles);
    fs.mkdirSync(path.dirname(CENSUS_MD), { recursive: true });
    fs.writeFileSync(CENSUS_MD, md);
  }

  return { summary, rows, byModule };
}

function renderCensusMd(summary, byModule, designFiles) {
  const lines = [];
  lines.push("# DESIGN-PARITY-CENSUS");
  lines.push("");
  lines.push(`Generated: ${summary.generated_at}`);
  lines.push(`Source order: ROUND 8.4 UI-F11125 · owner design law · docs/design/v3 (${designFiles.v3.length}) · boards (${designFiles.boards.join(", ")}) · approved-screens (${designFiles.approved.length}).`);
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`| Metric | Count |`);
  lines.push(`|---|---:|`);
  lines.push(`| Routes in manifest | ${summary.route_count} |`);
  lines.push(`| Passing (static app-wide rules) | ${summary.passing_routes} |`);
  lines.push(`| Failing (rule hits on resolved pages) | ${summary.failing_routes} |`);
  lines.push(`| Unresolved page binding (informational) | ${summary.unresolved_routes} |`);
  lines.push(`| v3 .dc.html designs | ${summary.design_inventory.v3_dc_html} |`);
  lines.push(`| Board sets | ${summary.design_inventory.board_sets} |`);
  lines.push(`| Approved screens | ${summary.design_inventory.approved_screens} |`);
  lines.push("");
  lines.push("## Fail rule hits");
  lines.push("");
  lines.push(`| Rule | Hits |`);
  lines.push(`|---|---:|`);
  for (const [k, v] of Object.entries(summary.fail_rule_counts)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");
  lines.push("## Per module");
  lines.push("");
  lines.push(`| Module | Routes | Passing | Failing | Unresolved |`);
  lines.push(`|---|---:|---:|---:|---:|`);
  for (const m of summary.modules) {
    lines.push(`| ${m.module} | ${m.total} | ${m.passing} | ${m.failing} | ${m.unresolved} |`);
  }
  lines.push("");
  lines.push("## Failing routes (static)");
  lines.push("");
  lines.push(`| Route | Module | Design source | Page | Fails |`);
  lines.push(`|---|---|---|---|---|`);
  for (const [, bucket] of [...byModule.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const r of bucket.routes.filter((x) => !x.pass)) {
      lines.push(
        `| \`${r.route}\` | ${r.module} | ${r.design} | ${r.page} | ${r.fails.join(", ")} |`,
      );
    }
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push("- A route PASSes this census when the static app-wide rules above hold on its resolved page source.");
  lines.push("- Element-level FULL design coverage (every tab/KPI/column vs its .dc.html) is the BUILD phase (one PR per module); this census is the ratchet floor.");
  lines.push("- `failing_routes` in scripts/design-parity-census-baseline.json may only go down (`--lower`).");
  lines.push("");
  return lines.join("\n");
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE)) return null;
  return JSON.parse(read(BASELINE));
}

function selftest() {
  const sample = `
    <Route path="/fuel" element={<FuelPlannerHomePage />} />
    <Route path="/fuel/cards" element={<FuelCardsPage />} />
    <Route path="/portal" element={<PortalLayout />}>
      <Route path="dashboard" element={<PortalDashboardPage />} />
    </Route>
  `;
  const routes = extractRoutes(sample);
  if (!routes.includes("/fuel") || !routes.includes("/fuel/cards")) {
    throw new Error(`selftest route extract missed fuel: ${routes.join(",")}`);
  }
  if (!routes.includes("/portal/dashboard")) {
    throw new Error(`selftest nested portal path failed: ${routes.join(",")}`);
  }
  const fails = scorePage(
    "x.tsx",
    `export function X() { return <div>Coming soon</div>; }`,
  );
  if (!fails.fails.includes("coming_soon_stub") || !fails.routeFail) {
    throw new Error("selftest coming_soon not detected");
  }
  const ok = scorePage("x.tsx", `export function X() { return <ParityTable exportFilename="a" emptyText="—" />; }`);
  if (ok.fails.length || ok.routeFail) throw new Error(`selftest clean page failed: ${ok.fails}`);
  const unresolved = scorePage(null, null);
  if (!unresolved.fails.includes("unresolved_page") || unresolved.routeFail) {
    throw new Error("selftest unresolved must not route-fail");
  }
  const lawSelf = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts/verify-complete-design-build-law.mjs"), "--selftest"],
    { cwd: ROOT, encoding: "utf8" },
  );
  if ((lawSelf.status ?? 1) !== 0) {
    throw new Error(`complete-design-build-law selftest failed: ${lawSelf.stdout}${lawSelf.stderr}`);
  }
  console.log(`${LABEL} selftest PASS`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    selftest();
    return;
  }
  const writeCensus = args.includes("--write-census") || args.includes("--lower") || !args.length;
  const { summary } = runCensus({ writeCensus: true });

  let baseline = loadBaseline();
  if (!baseline || args.includes("--lower")) {
    if (baseline && summary.failing_routes > baseline.failing_routes) {
      console.error(
        `${LABEL} FAIL — --lower refused: failing_routes ${summary.failing_routes} > baseline ${baseline.failing_routes}`,
      );
      process.exit(1);
    }
    const next = {
      failing_routes: summary.failing_routes,
      route_count: summary.route_count,
      fail_rule_counts: summary.fail_rule_counts,
      updated_at: summary.generated_at,
    };
    fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + "\n");
    baseline = next;
    console.log(`${LABEL}: wrote baseline failing_routes=${next.failing_routes}`);
  }

  if (summary.route_count < 600) {
    console.error(`${LABEL} FAIL — expected ≥600 manifest routes, got ${summary.route_count}`);
    process.exit(1);
  }
  if (summary.failing_routes > baseline.failing_routes) {
    console.error(
      `${LABEL} FAIL — failing_routes ${summary.failing_routes} > baseline ${baseline.failing_routes} (ratchet)`,
    );
    process.exit(1);
  }
  if (!fs.existsSync(CENSUS_MD)) {
    console.error(`${LABEL} FAIL — missing ${path.relative(ROOT, CENSUS_MD)}`);
    process.exit(1);
  }

  // Permanent anti-drift: complete-design law + ROUND 8.5 source locks (never census-only DONE).
  const law = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts/verify-complete-design-build-law.mjs")],
    { cwd: ROOT, encoding: "utf8" },
  );
  const lawOut = `${law.stdout ?? ""}${law.stderr ?? ""}`.trim();
  if (lawOut) console.log(lawOut);
  if ((law.status ?? 1) !== 0) {
    console.error(`${LABEL} FAIL — complete-design-build-law red (surface/census-only is not design-done)`);
    process.exit(law.status ?? 1);
  }

  console.log(
    `${LABEL} PASS — routes=${summary.route_count} failing=${summary.failing_routes} (baseline ${baseline.failing_routes}) · census → ${path.relative(ROOT, CENSUS_MD)}`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`${LABEL} FAIL — ${e.message}`);
    process.exit(1);
  }
}
