#!/usr/bin/env node
/**
 * Bidirectional nav integrity: subnav leaf paths resolve to routes; static routes are reachable or allowlisted.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

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
];

const routeSource = `${read("apps/frontend/src/App.tsx")}\n${read("apps/frontend/src/routes/manifest.tsx")}`;
const routes = extractRoutePaths(routeSource);

const subnavPaths = new Set([
  ...extractQuotedPaths(read("apps/frontend/src/pages/accounting/subnav-manifest.ts"), ["path"]),
  ...extractQuotedPaths(read("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx"), ["path"]),
  ...extractQuotedPaths(read("apps/frontend/src/pages/lists/ListsSubNav.tsx"), ["href"]),
  ...extractQuotedPaths(read("apps/frontend/src/pages/reports/ReportsSubNav.tsx"), ["href"]),
  ...extractQuotedPaths(read("apps/frontend/src/components/safety/SAFETY_TABS_CONFIG.ts"), ["route"]),
  ...extractQuotedPaths(read("apps/frontend/src/components/layout/sidebar-config.ts"), ["to"]),
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
    ["/accounting", "/accounting"],
    ["/banking", "/banking"],
    ["/drivers", "/drivers"],
    ["/factoring", "/factoring"],
    ["/dispatch", "/dispatch"],
    ["/help", "/help"],
  ];
  for (const [prefix, root] of prefixes) {
    if (!navReachable.has(root) && !navReachable.has(prefix)) continue;
    if (routePath === prefix || routePath.startsWith(`${prefix}/`)) return true;
  }
  if (routePath === "/maintenance/in-transit" || routePath === "/maintenance/triage") return true;
  return false;
}

const routeViolations = [];
for (const routePath of routes) {
  if (routePath === "*" || routePath === "/") continue;
  if (isAllowlisted(routePath, allowAll)) continue;
  if (navReachable.has(routePath)) continue;
  if (modulePrefixReachable(routePath, navReachable)) continue;
  if (isDynamicDetail(routePath) && parentListRoute(routePath, navReachable, routes)) continue;
  if (routePath.startsWith("/pwa/") || routePath.startsWith("/driver/")) continue;
  if (routePath.startsWith("/safety/")) continue;
  if (routePath === "/login" || routePath === "/coming-soon" || routePath === "/legal/privacy" || routePath === "/legal/terms") continue;
  routeViolations.push(routePath);
}

if (routeViolations.length) {
  fail(`ROUTE→NAV: orphan routes (add subnav or allowlist): ${routeViolations.sort().join(", ")}`);
}

console.log("[verify-nav-integrity] OK");
