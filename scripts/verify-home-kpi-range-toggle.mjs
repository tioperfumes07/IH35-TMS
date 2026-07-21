#!/usr/bin/env node
/**
 * verify-home-kpi-range-toggle.mjs
 *
 * GUARD h-05: the Home KPI row must offer a Today/7d/30d/MTD/YTD date-range toggle in BOTH
 * home variants (OwnerHome + DefaultHome), wired end-to-end:
 *   - shared HomeKpiRangeToggle component with all five presets
 *   - both variants render the toggle and pass the range into fetchHomeTodayRevenue + queryKey
 *   - backend /api/v1/home/today-revenue accepts ?range= via HOME_KPI_RANGES enum (default today)
 *   - server-side window resolution (revenueRangeWindow) in company timezone
 *
 * Usage:
 *   node scripts/verify-home-kpi-range-toggle.mjs
 *   node scripts/verify-home-kpi-range-toggle.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-home-kpi-range-toggle";

const TOGGLE = "apps/frontend/src/pages/home/HomeKpiRangeToggle.tsx";
const OWNER_HOME = "apps/frontend/src/pages/home/OwnerHome.tsx";
const DEFAULT_HOME = "apps/frontend/src/pages/home/roles/DefaultHome.tsx";
const API_HOME = "apps/frontend/src/api/home.ts";
const ROUTES = "apps/backend/src/home/home-widgets.routes.ts";
const SERVICE = "apps/backend/src/home/revenue-gl-linkage.service.ts";

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check({ toggle, ownerHome, defaultHome, apiHome, routes, service }) {
  const f = [];

  if (!toggle) {
    f.push(`${TOGGLE}: missing`);
  } else {
    if (!/data-testid="home-kpi-range-toggle"/.test(toggle)) {
      f.push(`${TOGGLE}: must expose data-testid=home-kpi-range-toggle`);
    }
    for (const preset of ["today", "7d", "30d", "mtd", "ytd"]) {
      if (!toggle.includes(preset)) {
        f.push(`${TOGGLE}: missing range preset "${preset}"`);
      }
    }
  }

  for (const [rel, src] of [
    [OWNER_HOME, ownerHome],
    [DEFAULT_HOME, defaultHome],
  ]) {
    if (!src) {
      f.push(`${rel}: missing`);
      continue;
    }
    if (!/HomeKpiRangeToggle/.test(src)) {
      f.push(`${rel}: must render HomeKpiRangeToggle (h-05 range selector)`);
    }
    if (!/fetchHomeTodayRevenue\(\s*cid\s*,\s*kpiRange\s*\)/.test(src)) {
      f.push(`${rel}: must pass kpiRange into fetchHomeTodayRevenue`);
    }
    if (!/\[\s*"home"\s*,\s*"today-revenue"\s*,\s*cid\s*,\s*kpiRange\s*\]/.test(src)) {
      f.push(`${rel}: queryKey must include kpiRange (stale-cache bug otherwise)`);
    }
    if (!/revenueKpiLabel\(\s*kpiRange\s*\)/.test(src)) {
      f.push(`${rel}: revenue KPI label must reflect the selected range`);
    }
  }

  if (!apiHome) {
    f.push(`${API_HOME}: missing`);
  } else {
    if (!/HOME_KPI_RANGES\s*=\s*\[\s*"today"\s*,\s*"7d"\s*,\s*"30d"\s*,\s*"mtd"\s*,\s*"ytd"\s*\]/.test(apiHome)) {
      f.push(`${API_HOME}: must define HOME_KPI_RANGES = [today,7d,30d,mtd,ytd]`);
    }
    if (!/fetchHomeTodayRevenue\(\s*companyId:\s*string\s*,\s*range:\s*HomeKpiRange/.test(apiHome)) {
      f.push(`${API_HOME}: fetchHomeTodayRevenue must accept a HomeKpiRange param`);
    }
  }

  if (!routes) {
    f.push(`${ROUTES}: missing`);
  } else {
    if (!/range:\s*z\.enum\(HOME_KPI_RANGES\)\.default\(\s*"today"\s*\)/.test(routes)) {
      f.push(`${ROUTES}: today-revenue must validate ?range= via z.enum(HOME_KPI_RANGES).default("today")`);
    }
    if (!/revenueRangeWindow\(/.test(routes)) {
      f.push(`${ROUTES}: today-revenue must resolve non-today ranges via revenueRangeWindow()`);
    }
  }

  if (!service) {
    f.push(`${SERVICE}: missing`);
  } else if (!/export function revenueRangeWindow\(/.test(service) || !/companyBusinessDate\(/.test(service)) {
    f.push(`${SERVICE}: must export revenueRangeWindow resolving presets via companyBusinessDate (company TZ)`);
  }

  return f;
}

export function run() {
  const read = (rel) => {
    try {
      return fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      return null;
    }
  };
  return check({
    toggle: read(TOGGLE),
    ownerHome: read(OWNER_HOME),
    defaultHome: read(DEFAULT_HOME),
    apiHome: read(API_HOME),
    routes: read(ROUTES),
    service: read(SERVICE),
  });
}

if (process.argv.includes("--selftest")) {
  const goodToggle = `
    data-testid="home-kpi-range-toggle"
    ["today", "7d", "30d", "mtd", "ytd"]
  `;
  const goodVariant = `
    import { HomeKpiRangeToggle, revenueKpiLabel } from "./HomeKpiRangeToggle";
    queryKey: ["home", "today-revenue", cid, kpiRange],
    queryFn: () => fetchHomeTodayRevenue(cid, kpiRange),
    label={revenueKpiLabel(kpiRange)}
    <HomeKpiRangeToggle value={kpiRange} onChange={setKpiRange} />
  `;
  const goodApi = `
    export const HOME_KPI_RANGES = ["today", "7d", "30d", "mtd", "ytd"] as const;
    export async function fetchHomeTodayRevenue(companyId: string, range: HomeKpiRange = "today") {}
  `;
  const goodRoutes = `
    range: z.enum(HOME_KPI_RANGES).default("today"),
    const { fromDate, toDate } = parsed.data.range === "today" ? todayRevenueWindow() : revenueRangeWindow(parsed.data.range);
  `;
  const goodService = `
    export function revenueRangeWindow(range, now = new Date()) { const today = companyBusinessDate(now); }
  `;
  const good = {
    toggle: goodToggle,
    ownerHome: goodVariant,
    defaultHome: goodVariant,
    apiHome: goodApi,
    routes: goodRoutes,
    service: goodService,
  };

  const checks = [
    ["healthy wiring passes", check(good).length === 0],
    [
      "variant without toggle caught",
      check({ ...good, ownerHome: goodVariant.replaceAll("HomeKpiRangeToggle", "Nothing") }).some((x) =>
        x.includes("HomeKpiRangeToggle"),
      ),
    ],
    [
      "stale queryKey (range missing) caught",
      check({ ...good, defaultHome: goodVariant.replace(`, cid, kpiRange]`, `, cid]`) }).some((x) =>
        x.includes("queryKey"),
      ),
    ],
    [
      "route without range enum caught",
      check({ ...good, routes: goodRoutes.replace("z.enum(HOME_KPI_RANGES)", "z.string()") }).some((x) =>
        x.includes("z.enum(HOME_KPI_RANGES)"),
      ),
    ],
    [
      "service without company-TZ window caught",
      check({ ...good, service: "export function revenueRangeWindow() { /* no tz */ }" }).some((x) =>
        x.includes("companyBusinessDate"),
      ),
    ],
  ];

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const f = run();
  if (f.length) {
    console.error(`${LABEL} FAIL:`);
    for (const x of f) console.error("  ✗ " + x);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — Home KPI range toggle wired in both variants + server window resolution`);
  process.exit(0);
}
