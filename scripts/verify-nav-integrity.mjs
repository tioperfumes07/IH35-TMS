#!/usr/bin/env node
/**
 * Bidirectional nav integrity: subnav leaf paths resolve to routes; static routes are reachable or allowlisted.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const ROUTE_SOURCE_PATHS = [
  "apps/frontend/src/App.tsx",
  "apps/frontend/src/routes/manifest.tsx",
];

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) throw new Error(`missing file: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

function fail(msg) {
  console.error(`[verify-nav-integrity] ${msg}`);
  process.exit(1);
}

function extractQuotedPaths(source, keys) {
  const out = [];
  for (const key of keys) {
    const re = new RegExp(`${key}:\\s*"([^"]+)"`, "g");
    let m;
    while ((m = re.exec(source))) out.push(m[1]);
  }
  return out;
}

/**
 * Same as extractQuotedPaths, but skips any single-line tab object literal carrying
 * `navHidden: true` — that flag means the tab is deliberately excluded from being rendered as a
 * clickable NavLink (its route is a parameterized prefix with no bare-path entry point; see
 * SafetyTab.navHidden in SAFETY_TABS_CONFIG.ts). Its route is real for path-matching purposes but
 * asserting it as a standalone reachable subnav destination would be asserting a bug.
 */
function extractQuotedPathsSkippingNavHidden(source, keys) {
  const out = [];
  for (const line of source.split("\n")) {
    if (/navHidden:\s*true/.test(line)) continue;
    out.push(...extractQuotedPaths(line, keys));
  }
  return out;
}

/**
 * JSX-attribute form: `to="/program/x"` / `href="/program/x"`.
 * extractQuotedPaths above only matches the object form (`href: "/program/x"`), which is why a
 * module whose nav is rendered as <Link to="..."> tabs — like the Program tab row — looked like it
 * had no nav at all and its tabs had to be allowlisted.
 */
function extractJsxAttrPaths(source, attrs) {
  const out = [];
  for (const attr of attrs) {
    const re = new RegExp(`${attr}=\\s*"([^"]+)"`, "g");
    let m;
    while ((m = re.exec(source))) out.push(m[1]);
  }
  return out;
}

function extractRoutePaths(source) {
  const routes = new Set();
  const literalRe = /path="([^"]+)"/g;
  let m;
  while ((m = literalRe.exec(source))) {
    if (m[1].startsWith("/")) routes.add(m[1]);
  }

  const safetyParent = source.match(
    /<Route\s+path="\/safety"[\s\S]*?>([\s\S]*?)<\/Route>\s*\n\s*<Route/
  );
  if (safetyParent) {
    const childRe = /<Route\s+path="([^"]+)"/g;
    let cm;
    while ((cm = childRe.exec(safetyParent[1]))) {
      const segment = cm[1];
      if (segment.startsWith("/")) routes.add(segment);
      else routes.add(`/safety/${segment}`);
    }
  }

  const driverParent = source.match(/<Route\s+path="\/driver"[\s\S]*?>([\s\S]*?)<\/Route>/);
  if (driverParent) {
    const childRe = /<Route\s+path="([^"]+)"/g;
    let cm;
    while ((cm = childRe.exec(driverParent[1]))) {
      const segment = cm[1];
      if (segment.startsWith("/")) routes.add(segment);
      else routes.add(`/driver/${segment}`);
    }
  }

  return routes;
}

function routePatternMatches(routePath, subnavPath) {
  if (routePath === subnavPath) return true;
  const routeParts = routePath.split("/");
  const subParts = subnavPath.split("/");
  if (routeParts.length !== subParts.length) return false;
  return routeParts.every((part, i) => part.startsWith(":") || part === subParts[i]);
}

function hasResolvableRoute(subnavPath, routes, routeSource) {
  if (routes.has(subnavPath)) return true;
  if (subnavPath.includes("?")) {
    const [base] = subnavPath.split("?");
    if (routes.has(base)) return true;
  }
  for (const route of routes) {
    if (routePatternMatches(route, subnavPath)) return true;
  }
  const escaped = subnavPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const redirectRe = new RegExp(`path="${escaped}"[\\s\\S]{0,500}?<Navigate\\s+to="([^"]+)"`, "m");
  const redirect = redirectRe.exec(routeSource);
  if (redirect) {
    const target = redirect[1].split("?")[0];
    if (routes.has(target) || [...routes].some((r) => routePatternMatches(r, target))) return true;
  }
  return false;
}

function selftestFinanceRouteSources() {
  const fixture = `
    <Route path="/finance" element={<FinanceHubPage />} />
    <Route path="/finance/overview" element={<FinanceOverviewPage />} />
    <Route path="/finance/unknown" element={<UnknownFinancePage />} />
  `;
  const routes = extractRoutePaths(fixture);
  for (const expected of ["/finance", "/finance/overview", "/finance/unknown"]) {
    if (!routes.has(expected)) {
      throw new Error(`nav route-source selftest did not discover ${expected}`);
    }
  }

  for (const plantedRoute of ["/finance", "/finance/overview"]) {
    const plantedRemoval = fixture.replace(
      `path="${plantedRoute}"`,
      `path="${plantedRoute}-removed"`,
    );
    const routesAfterRemoval = extractRoutePaths(plantedRemoval);
    if (hasResolvableRoute(plantedRoute, routesAfterRemoval, plantedRemoval)) {
      throw new Error(
        `nav route-source selftest accepted planted ${plantedRoute} removal`,
      );
    }
  }
  const knownFinanceNav = new Set(["/finance", "/finance/overview"]);
  if (isRouteReachable("/finance/unknown", knownFinanceNav, routes, [])) {
    throw new Error("nav route-source selftest accepted planted unknown Finance route");
  }

  console.log(
    "[verify-nav-integrity] route SELFTEST OK — planted Finance removals and unknown route rejected",
  );
}

if (process.argv.includes("--selftest-finance-routes")) {
  selftestFinanceRouteSources();
  process.exit(0);
}

function normalizeAllowPath(p) {
  return p.split("?")[0];
}

function isAllowlisted(routePath, allow) {
  const norm = normalizeAllowPath(routePath);
  for (const entry of allow) {
    const pattern = normalizeAllowPath(entry.path);
    if (pattern === norm) return true;
    const patternParts = pattern.split("/");
    const routeParts = norm.split("/");
    if (patternParts.length !== routeParts.length) continue;
    if (patternParts.every((part, i) => part.startsWith(":") || part === routeParts[i])) return true;
  }
  return false;
}

function isDynamicDetail(routePath) {
  return routePath.includes("/:");
}

function parentListRoute(routePath, navPaths, routes) {
  const parts = routePath.split("/");
  const idx = parts.findIndex((p) => p.startsWith(":"));
  if (idx <= 1) return false;
  const parent = parts.slice(0, idx).join("/") || "/";
  if (navPaths.has(parent)) return true;
  if (routes.has(parent)) return true;
  return false;
}

const allowlist = JSON.parse(read("scripts/nav-integrity-allowlist.json"));
const allowAll = [
  ...allowlist.ADMIN_ONLY,
  ...allowlist.BLOCK_43_TODO,
  ...allowlist.URL_SYNC_DEFERRED,
  ...allowlist.REDIRECT_ROUTES,
];

const routeSource = ROUTE_SOURCE_PATHS.map(read).join("\n");
const routes = extractRoutePaths(routeSource);

const subnavPaths = new Set([
  ...extractQuotedPaths(read("apps/frontend/src/pages/accounting/subnav-manifest.ts"), ["path"]),
  ...extractQuotedPaths(read("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx"), ["path"]),
  ...extractQuotedPaths(read("apps/frontend/src/pages/lists/ListsSubNav.tsx"), ["href"]),
  ...extractQuotedPaths(read("apps/frontend/src/pages/reports/ReportsSubNav.tsx"), ["href"]),
  ...extractQuotedPathsSkippingNavHidden(read("apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts"), ["route"]),
  ...extractQuotedPaths(read("apps/frontend/src/components/layout/sidebar-config.ts"), ["to"]),
  ...extractQuotedPaths(read("apps/frontend/src/pages/program/ProgramBoardPage.tsx"), ["href"]),
  // PROG-NAV-01: LegacyAuditScoreboardPage keeps archive tab links (tracker/modules/…).
  // Program home (/program) is Scenario Tracker only — no tab row there.
  ...extractJsxAttrPaths(read("apps/frontend/src/pages/program/LegacyAuditScoreboardPage.tsx"), ["to"]),
  ...extractJsxAttrPaths(read("apps/frontend/src/pages/program/ProgramModuleNav.tsx"), ["to"]),
  ...extractJsxAttrPaths(read("apps/frontend/src/pages/program/ModuleMatrixPreviewPage.tsx"), ["to"]),
  ...extractJsxAttrPaths(read("apps/frontend/src/pages/program/scenario-tracker/ScenarioTrackerHome.tsx"), ["to"]),
]);

const driversNavMatch = read("apps/frontend/src/components/drivers/DRIVERS_TABS_CONFIG.ts").match(
  /export const DRIVERS_MODULE_NAV_PATHS = (\[[^\]]+\])/
);
if (driversNavMatch) {
  const parsed = JSON.parse(driversNavMatch[1].replace(/'/g, '"'));
  for (const p of parsed) subnavPaths.add(p);
}

const subnavViolations = [];
for (const subPath of subnavPaths) {
  if (!subPath.startsWith("/")) continue;
  if (!hasResolvableRoute(subPath, routes, routeSource)) subnavViolations.push(subPath);
}

if (subnavViolations.length) {
  fail(`SUBNAV→ROUTE: unresolved paths: ${subnavViolations.join(", ")}`);
}

const navReachable = new Set([...subnavPaths]);
for (const entry of allowAll) navReachable.add(normalizeAllowPath(entry.path));

function modulePrefixReachable(routePath, navReachable) {
  const prefixes = [
    ["/lists", "/lists"],
    ["/reports", "/reports"],
    ["/legal", "/legal"],
    ["/maintenance", "/maintenance"],
    ["/compliance", "/compliance"],
    ["/accounting", "/accounting"],
    ["/banking", "/banking"],
    ["/drivers", "/drivers"],
    ["/factoring", "/factoring"],
    ["/dispatch", "/dispatch"],
    ["/fuel", "/fuel"],
    ["/help", "/help"],
  ];
  for (const [prefix, root] of prefixes) {
    if (!navReachable.has(root) && !navReachable.has(prefix)) continue;
    if (routePath === prefix || routePath.startsWith(`${prefix}/`)) return true;
  }
  if (routePath === "/maintenance/in-transit" || routePath === "/maintenance/triage") return true;
  return false;
}

function isRouteReachable(routePath, navReachable, routes, allowEntries) {
  if (routePath === "*" || routePath === "/") return true;
  if (isAllowlisted(routePath, allowEntries)) return true;
  if (navReachable.has(routePath)) return true;
  if (modulePrefixReachable(routePath, navReachable)) return true;
  if (isDynamicDetail(routePath) && parentListRoute(routePath, navReachable, routes)) return true;
  if (routePath.startsWith("/pwa/") || routePath.startsWith("/driver/")) return true;
  if (routePath.startsWith("/safety/")) return true;
  return routePath === "/login"
    || routePath === "/coming-soon"
    || routePath === "/legal/privacy"
    || routePath === "/legal/terms";
}

const routeViolations = [];
for (const routePath of routes) {
  if (!isRouteReachable(routePath, navReachable, routes, allowAll)) {
    routeViolations.push(routePath);
  }
}

if (routeViolations.length) {
  fail(`ROUTE→NAV: orphan routes (add subnav or allowlist): ${routeViolations.sort().join(", ")}`);
}

console.log("[verify-nav-integrity] OK");
