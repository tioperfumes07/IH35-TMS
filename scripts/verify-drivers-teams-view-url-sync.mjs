#!/usr/bin/env node
/**
 * verify-drivers-teams-view-url-sync.mjs
 *
 * GUARD: Drivers home secondary view (Drivers vs Teams) must sync to ?view= via useSearchParams
 * so deep links, back/forward, and shareable URLs stay honest — not local-only useState.
 *
 * Usage:
 *   node scripts/verify-drivers-teams-view-url-sync.mjs
 *   node scripts/verify-drivers-teams-view-url-sync.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-drivers-teams-view-url-sync";
const DRIVERS_PAGE = "apps/frontend/src/pages/Drivers.tsx";
const TABS_CONFIG = "apps/frontend/src/components/drivers/DRIVERS_TABS_CONFIG.ts";

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check({ driversPage, tabsConfig }) {
  const f = [];

  if (!driversPage) {
    f.push(`${DRIVERS_PAGE}: missing`);
  } else {
    if (/const \[activeTab,\s*setActiveTab\]\s*=\s*useState/.test(driversPage)) {
      f.push(`${DRIVERS_PAGE}: must not use local useState for drivers|teams view — sync via ?view=`);
    }
    if (!/useSearchParams/.test(driversPage)) {
      f.push(`${DRIVERS_PAGE}: must use useSearchParams for Drivers/Teams view sync`);
    }
    if (!/parseDriversHomeView\s*\(\s*searchParams\s*\)/.test(driversPage)) {
      f.push(`${DRIVERS_PAGE}: must derive active view from parseDriversHomeView(searchParams)`);
    }
    if (!/setDriversHomeView/.test(driversPage)) {
      f.push(`${DRIVERS_PAGE}: must expose setDriversHomeView to write ?view=`);
    }
    if (!/nextParams\.delete\(\s*["']view["']\s*\)/.test(driversPage)) {
      f.push(`${DRIVERS_PAGE}: default Drivers view must delete ?view= (clean URL)`);
    }
    if (!/nextParams\.set\(\s*["']view["']/.test(driversPage)) {
      f.push(`${DRIVERS_PAGE}: Teams view must set searchParams view=teams`);
    }
    if (!/setDriversHomeView\s*\(\s*id\s*\)/.test(driversPage)) {
      f.push(`${DRIVERS_PAGE}: SecondaryNavTabs onChange must call setDriversHomeView(id)`);
    }
    if (!driversPage.includes('activeTab === "teams"')) {
      f.push(`${DRIVERS_PAGE}: must gate Teams content on activeTab === "teams"`);
    }
  }

  if (!tabsConfig) {
    f.push(`${TABS_CONFIG}: missing`);
  } else {
    if (!/export function parseDriversHomeView/.test(tabsConfig)) {
      f.push(`${TABS_CONFIG}: must export parseDriversHomeView(searchParams)`);
    }
    if (!/searchParams\.get\(\s*["']view["']\s*\)/.test(tabsConfig)) {
      f.push(`${TABS_CONFIG}: parseDriversHomeView must read searchParams.get("view")`);
    }
    if (!/DRIVERS_HOME_VIEW_IDS/.test(tabsConfig)) {
      f.push(`${TABS_CONFIG}: must declare DRIVERS_HOME_VIEW_IDS (drivers|teams)`);
    }
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
    driversPage: read(DRIVERS_PAGE),
    tabsConfig: read(TABS_CONFIG),
  });
}

if (process.argv.includes("--selftest")) {
  const goodConfig = `
    export const DRIVERS_HOME_VIEW_IDS = ["drivers", "teams"] as const;
    export function parseDriversHomeView(searchParams) {
      const raw = (searchParams.get("view") ?? "drivers").toLowerCase();
      return raw;
    }
  `;
  const goodPage = `
    import { useSearchParams } from "react-router-dom";
    import { parseDriversHomeView } from "../components/drivers/DRIVERS_TABS_CONFIG";
    const [searchParams, setSearchParams] = useSearchParams();
    const activeTab = useMemo(() => parseDriversHomeView(searchParams), [searchParams]);
    const setDriversHomeView = (next) => {
      setSearchParams((prev) => {
        const nextParams = new URLSearchParams(prev);
        if (next === "drivers") nextParams.delete("view");
        else nextParams.set("view", next);
        return nextParams;
      });
    };
    onChange={(id) => { if (id === "drivers" || id === "teams") setDriversHomeView(id); }}
    {activeTab === "teams" ? <div /> : null}
  `;

  const checks = [
    ["healthy wiring pass", check({ driversPage: goodPage, tabsConfig: goodConfig }).length === 0],
    [
      "useState activeTab caught",
      check({
        driversPage: goodPage.replace(
          "const activeTab = useMemo",
          'const [activeTab, setActiveTab] = useState("drivers"); const x = useMemo'
        ),
        tabsConfig: goodConfig,
      }).some((x) => x.includes("useState")),
    ],
    [
      "missing parseDriversHomeView caught",
      check({
        driversPage: goodPage.replace(/parseDriversHomeView\s*\(\s*searchParams\s*\)/g, "parseDriverListStatus(searchParams)"),
        tabsConfig: goodConfig,
      }).some((x) => x.includes("parseDriversHomeView(searchParams)")),
    ],
    [
      "missing view delete caught",
      check({
        driversPage: goodPage.replace('nextParams.delete("view")', 'nextParams.set("view", "drivers")'),
        tabsConfig: goodConfig,
      }).some((x) => x.includes("delete")),
    ],
    [
      "missing config view reader caught",
      check({
        driversPage: goodPage,
        tabsConfig: goodConfig.replace('searchParams.get("view")', 'searchParams.get("tab")'),
      }).some((x) => x.includes('searchParams.get("view")')),
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
  console.log(`${LABEL}: OK — Drivers/Teams secondary view syncs via ?view=teams|drivers`);
  process.exit(0);
}
