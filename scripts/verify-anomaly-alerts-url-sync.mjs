#!/usr/bin/env node
/**
 * verify-anomaly-alerts-url-sync.mjs — OPS FE guard (step 972)
 *
 * Locks: AnomalyAlertsPage tab selection and AnomalyDashboard severity filter persist in the
 * URL via react-router useSearchParams (?tab=alerts|rules, ?severity=critical|high|warn).
 * Local-only useState for these controls breaks bookmark/share/deep-link parity.
 *
 * Usage:
 *   node scripts/verify-anomaly-alerts-url-sync.mjs
 *   node scripts/verify-anomaly-alerts-url-sync.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-anomaly-alerts-url-sync";
const ALERTS_PAGE = "apps/frontend/src/pages/safety/anomaly/AnomalyAlertsPage.tsx";
const DASHBOARD = "apps/frontend/src/pages/safety/anomaly/AnomalyDashboard.tsx";

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check({ alertsPage, dashboard }) {
  const f = [];

  if (!alertsPage) {
    f.push(`${ALERTS_PAGE}: missing`);
  } else {
    if (!/useSearchParams/.test(alertsPage)) {
      f.push(`${ALERTS_PAGE}: must use useSearchParams for ?tab= persistence`);
    }
    if (!/searchParams\.get\(\s*["']tab["']\s*\)/.test(alertsPage)) {
      f.push(`${ALERTS_PAGE}: must read searchParams.get("tab")`);
    }
    if (!/setSearchParams/.test(alertsPage)) {
      f.push(`${ALERTS_PAGE}: tab changes must call setSearchParams`);
    }
    if (/useState\s*<\s*["']alerts["']\s*\|\s*["']rules["']\s*>/.test(alertsPage)) {
      f.push(`${ALERTS_PAGE}: tab must not use local useState — URL is source of truth`);
    }
  }

  if (!dashboard) {
    f.push(`${DASHBOARD}: missing`);
  } else {
    if (!/useSearchParams/.test(dashboard)) {
      f.push(`${DASHBOARD}: must use useSearchParams for ?severity= persistence`);
    }
    if (!/searchParams\.get\(\s*["']severity["']\s*\)/.test(dashboard)) {
      f.push(`${DASHBOARD}: must read searchParams.get("severity")`);
    }
    if (!/setSearchParams/.test(dashboard)) {
      f.push(`${DASHBOARD}: severity changes must call setSearchParams`);
    }
    if (/useState\s*\(\s*["']["']\s*\)/.test(dashboard) && /setSeverity/.test(dashboard)) {
      f.push(`${DASHBOARD}: severity must not use local useState — URL is source of truth`);
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
    alertsPage: read(ALERTS_PAGE),
    dashboard: read(DASHBOARD),
  });
}

if (process.argv.includes("--selftest")) {
  const goodAlerts = `
    import { useSearchParams } from "react-router-dom";
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = parseTab(searchParams.get("tab"), isOwner);
    const setTab = (next) => setSearchParams((prev) => { const params = new URLSearchParams(prev); params.set("tab", next); return params; });
  `;
  const goodDashboard = `
    import { useSearchParams } from "react-router-dom";
    const [searchParams, setSearchParams] = useSearchParams();
    const severity = parseSeverity(searchParams.get("severity"));
    const setSeverity = (next) => setSearchParams((prev) => { const params = new URLSearchParams(prev); params.set("severity", next); return params; });
  `;

  const checks = [
    ["healthy pass", check({ alertsPage: goodAlerts, dashboard: goodDashboard }).length === 0],
    [
      "missing tab read caught",
      check({
        alertsPage: goodAlerts.replace('searchParams.get("tab")', 'searchParams.get("view")'),
        dashboard: goodDashboard,
      }).some((x) => x.includes('searchParams.get("tab")')),
    ],
    [
      "local tab useState caught",
      check({
        alertsPage: goodAlerts + 'const [tab, setTab] = useState<"alerts" | "rules">("alerts");',
        dashboard: goodDashboard,
      }).some((x) => x.includes("useState")),
    ],
    [
      "missing severity read caught",
      check({
        alertsPage: goodAlerts,
        dashboard: goodDashboard.replace('searchParams.get("severity")', 'searchParams.get("level")'),
      }).some((x) => x.includes('searchParams.get("severity")')),
    ],
    [
      "local severity useState caught",
      check({
        alertsPage: goodAlerts,
        dashboard: goodDashboard + 'const [severity, setSeverity] = useState("");',
      }).some((x) => x.includes("useState")),
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
  console.log(`${LABEL}: OK — AnomalyAlertsPage ?tab= and AnomalyDashboard ?severity= URL-synced`);
  process.exit(0);
}
