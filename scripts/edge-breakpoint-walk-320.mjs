#!/usr/bin/env node
import fs from "node:fs";

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function assertIncludes(source, marker, message) {
  if (!source.includes(marker)) {
    throw new Error(message);
  }
}

const css = read("apps/frontend/src/styles/breakpoints-edge.css");
const indexCss = read("apps/frontend/src/index.css");
const topbar = read("apps/frontend/src/components/Topbar.tsx");
const routes = read("apps/frontend/src/routes/manifest.tsx");

assertIncludes(css, "@media (max-width: 374px)", "Missing <375 media query");
assertIncludes(css, ".edge-kpi-grid", "Missing single-column KPI marker");
assertIncludes(css, ".edge-primary-actions", "Missing mobile primary actions marker");
assertIncludes(indexCss, "overflow-x: hidden;", "Global overflow-x guard missing");
assertIncludes(topbar, "onOpenMobileNav", "Topbar does not expose mobile nav trigger");
assertIncludes(topbar, "md:hidden", "Topbar mobile nav button missing responsive visibility class");

const requiredModuleRoutes = [
  "/home",
  "/dispatch",
  "/drivers",
  "/maintenance",
  "/accounting",
  "/banking",
  "/factoring",
  "/lists",
  "/reports",
  "/safety",
  "/fuel",
  "/customers",
  "/vendors",
  "/notifications",
  "/help",
  "/cash-advances",
  "/liabilities",
  "/docs",
];

const missingRoutes = requiredModuleRoutes.filter((routePath) => !routes.includes(`path="${routePath}"`));
if (missingRoutes.length > 0) {
  throw new Error(`Missing expected module routes in manifest: ${missingRoutes.join(", ")}`);
}

console.log(`[edge-breakpoint-walk-320] OK (${requiredModuleRoutes.length} modules checked)`);
