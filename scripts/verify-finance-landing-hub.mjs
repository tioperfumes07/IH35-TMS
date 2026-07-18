#!/usr/bin/env node
/**
 * FIN-2 regression guard: the canonical Finance entry must mount the real Hub,
 * while the placeholder Overview and the legacy /finance/hub route remain reachable.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-finance-landing-hub";

function read(rel) {
  const absolute = path.join(ROOT, rel);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
}

function routeMounts(source, route, component) {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `path=["']${escaped}["'](?:(?!<Route\\s+path=)[\\s\\S]){0,500}?<${component}\\s*/>`,
  ).test(source ?? "");
}

export function assertFinanceLanding({ manifest, sidebar, tabs, hubPage }) {
  const errors = [];
  if (!manifest) errors.push("manifest.tsx missing");
  if (!sidebar) errors.push("sidebar-config.ts missing");
  if (!tabs) errors.push("FinanceModuleTabs.tsx missing");
  if (!hubPage) errors.push("FinanceHubPage.tsx missing");
  if (errors.length) return errors;

  if (!routeMounts(manifest, "/finance", "FinanceHubPage")) {
    errors.push("/finance must mount FinanceHubPage");
  }
  if (routeMounts(manifest, "/finance", "FinanceOverviewPage")) {
    errors.push("/finance must not mount the placeholder FinanceOverviewPage");
  }
  if (!routeMounts(manifest, "/finance/overview", "FinanceOverviewPage")) {
    errors.push("/finance/overview must keep FinanceOverviewPage reachable");
  }
  if (!routeMounts(manifest, "/finance/hub", "FinanceHubPage")) {
    errors.push("legacy /finance/hub must remain mounted to FinanceHubPage");
  }

  if (!/finance:\s*\{[^}]*label:\s*["']FINANCE HUB["'][^}]*to:\s*["']\/finance["']/.test(sidebar)) {
    errors.push("sidebar FINANCE HUB entry must target canonical /finance");
  }
  if (!/\{\s*label:\s*["']Hub["'],\s*to:\s*["']\/finance["']\s*\}/.test(sidebar)) {
    errors.push("Finance flyout Hub must target /finance");
  }
  if (!/\{\s*label:\s*["']Overview["'],\s*to:\s*["']\/finance\/overview["']\s*\}/.test(sidebar)) {
    errors.push("Finance flyout Overview must target /finance/overview");
  }

  if (!/\{\s*id:\s*["']hub["'],\s*label:\s*["']Hub["'],\s*to:\s*["']\/finance["']\s*\}/.test(tabs)) {
    errors.push("Finance Hub tab must target /finance");
  }
  if (!/\{\s*id:\s*["']overview["'],\s*label:\s*["']Overview["'],\s*to:\s*["']\/finance\/overview["']\s*\}/.test(tabs)) {
    errors.push("Finance Overview tab must target /finance/overview");
  }
  if (!/tab\.id\s*===\s*["']hub["'][^;]{0,120}currentPath\s*===\s*["']\/finance\/hub["']/.test(tabs)) {
    errors.push("legacy /finance/hub must keep the Hub tab active");
  }

  if (!/backHref=["']\/finance\/overview["']/.test(hubPage)) {
    errors.push("Finance Hub back navigation must target the retained Overview route");
  }
  if (!/<Link\s+to=["']\/finance\/overview["'][^>]*>[\s\S]{0,120}?Back to Finance overview/.test(hubPage)) {
    errors.push("Finance Hub disabled-state Overview link must target /finance/overview");
  }
  return errors;
}

function selftest() {
  const good = {
    manifest: `
      <Route path="/finance" element={<ProtectedRoute><FinanceHubPage /></ProtectedRoute>} />
      <Route path="/finance/overview" element={<ProtectedRoute><FinanceOverviewPage /></ProtectedRoute>} />
      <Route path="/finance/hub" element={<ProtectedRoute><FinanceHubPage /></ProtectedRoute>} />
    `,
    sidebar: `
      finance: { id: "finance", label: "FINANCE HUB", Icon: X, to: "/finance" },
      { label: "Overview", to: "/finance/overview" },
      { label: "Hub", to: "/finance" },
    `,
    tabs: `
      { id: "overview", label: "Overview", to: "/finance/overview" },
      { id: "hub", label: "Hub", to: "/finance" },
      const isActive = currentPath === tab.to
        || (tab.id === "hub" && currentPath === "/finance/hub");
    `,
    hubPage: `
      <PageHeader backHref="/finance/overview" />
      <Link to="/finance/overview">Back to Finance overview</Link>
    `,
  };

  const cases = [
    ["root mounts stub", { ...good, manifest: good.manifest.replace(
      '<Route path="/finance" element={<ProtectedRoute><FinanceHubPage /></ProtectedRoute>} />',
      '<Route path="/finance" element={<ProtectedRoute><FinanceOverviewPage /></ProtectedRoute>} />',
    ) }, "/finance must mount"],
    ["overview removed", { ...good, manifest: good.manifest.replace("/finance/overview", "/finance/old-overview") }, "/finance/overview"],
    ["legacy alias removed", { ...good, manifest: good.manifest.replace("/finance/hub", "/finance/old-hub") }, "legacy /finance/hub"],
    ["sidebar root stale", { ...good, sidebar: good.sidebar.replace('to: "/finance" },', 'to: "/finance/hub" },') }, "sidebar FINANCE HUB"],
    ["flyout overview stale", { ...good, sidebar: good.sidebar.replace('Overview", to: "/finance/overview"', 'Overview", to: "/finance"') }, "flyout Overview"],
    ["hub tab stale", { ...good, tabs: good.tabs.replace('id: "hub", label: "Hub", to: "/finance"', 'id: "hub", label: "Hub", to: "/finance/hub"') }, "Hub tab"],
    ["legacy active state lost", { ...good, tabs: good.tabs.replace('currentPath === "/finance/hub"', 'currentPath === "/finance/legacy"') }, "keep the Hub tab active"],
    ["back link loops", { ...good, hubPage: good.hubPage.replaceAll("/finance/overview", "/finance") }, "back navigation"],
  ];

  const goodErrors = assertFinanceLanding(good);
  const missed = cases.filter(([, fixture, expected]) =>
    !assertFinanceLanding(fixture).some((error) => error.includes(expected))
  );
  if (goodErrors.length || missed.length) {
    console.error(`${LABEL} SELFTEST FAILED`);
    for (const error of goodErrors) console.error(`  good fixture rejected: ${error}`);
    for (const [name] of missed) console.error(`  planted regression not caught: ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${cases.length} planted regressions caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertFinanceLanding({
  manifest: read("apps/frontend/src/routes/manifest.tsx"),
  sidebar: read("apps/frontend/src/components/layout/sidebar-config.ts"),
  tabs: read("apps/frontend/src/pages/finance/FinanceModuleTabs.tsx"),
  hubPage: read("apps/frontend/src/pages/finance/FinanceHubPage.tsx"),
});

if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — /finance lands on Hub; Overview and legacy alias remain reachable`);
