#!/usr/bin/env node
/**
 * verify-driver-hub-url-tab.mjs
 *
 * GUARD: Driver Hub SecondaryNavTabs must sync to ?tab= so deep links and
 * bookmarks land on the correct sub-tab (Overview / Driver Scheduler / Leave Requests).
 *
 * Static invariants (no DB, no network):
 *  1. DriverHubPage uses useSearchParams
 *  2. Reads and validates searchParams.get("tab")
 *  3. SecondaryNavTabs activeId derives from URL (not useState tab)
 *  4. Tab changes call setSearchParams with tab param
 *  5. manifest registers /driver-hub
 *
 * Usage:
 *   node scripts/verify-driver-hub-url-tab.mjs
 *   node scripts/verify-driver-hub-url-tab.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-hub-url-tab";
const PAGE = "apps/frontend/src/pages/home/DriverHubPage.tsx";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

/** Pure checks — takes text so --selftest can inject fixtures. */
export function check({ page, manifest }) {
  const f = [];

  if (!page) {
    f.push(`${PAGE}: missing`);
  } else {
    if (!/useSearchParams/.test(page)) {
      f.push(`${PAGE}: must use useSearchParams to honor ?tab=`);
    }
    if (!/searchParams\.get\(\s*["']tab["']\s*\)/.test(page)) {
      f.push(`${PAGE}: must read searchParams.get("tab")`);
    }
    if (!/parseHubTab/.test(page)) {
      f.push(`${PAGE}: must validate tab ids via parseHubTab (unknown ?tab= falls back to overview)`);
    }
    if (!/setSearchParams/.test(page)) {
      f.push(`${PAGE}: tab changes must persist via setSearchParams`);
    }
    if (!/params\.set\(\s*["']tab["']/.test(page) && !/p\.set\(\s*["']tab["']/.test(page)) {
      f.push(`${PAGE}: setSearchParams must write the tab query param`);
    }
    if (!/<SecondaryNavTabs/.test(page)) {
      f.push(`${PAGE}: must render SecondaryNavTabs`);
    }
    if (/useState\s*<\s*HubTab\s*>/.test(page) || /useState\s*<\s*["']overview["']/.test(page)) {
      f.push(`${PAGE}: must not keep tab selection in local useState — derive from URL`);
    }
    if (!/activeId=\{tab\}/.test(page)) {
      f.push(`${PAGE}: SecondaryNavTabs activeId must bind to URL-derived tab`);
    }
  }

  if (!manifest) {
    f.push(`${MANIFEST}: missing`);
  } else if (!/path\s*=\s*["']\/driver-hub["']/.test(manifest)) {
    f.push(`${MANIFEST}: must register /driver-hub route`);
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
    page: read(PAGE),
    manifest: read(MANIFEST),
  });
}

if (process.argv.includes("--selftest")) {
  const goodPage = `
    import { useMemo } from "react";
    import { useSearchParams } from "react-router-dom";
    import { SecondaryNavTabs } from "../../components/shared/SecondaryNavTabs";
    const HUB_TAB_IDS = ["overview", "scheduler", "leave_requests"] as const;
    function parseHubTab(searchParams) {
      const raw = searchParams.get("tab");
      return HUB_TAB_IDS.includes(raw ?? "") ? raw : "overview";
    }
    export function DriverHubPage() {
      const [searchParams, setSearchParams] = useSearchParams();
      const tab = useMemo(() => parseHubTab(searchParams), [searchParams]);
      const setTab = (next) => {
        setSearchParams((prev) => {
          const p = new URLSearchParams(prev);
          if (next === "overview") p.delete("tab");
          else p.set("tab", next);
          return p;
        }, { replace: true });
      };
      return <SecondaryNavTabs tabs={[]} activeId={tab} onChange={(id) => setTab(id)} />;
    }
  `;
  const goodManifest = `path="/driver-hub"`;

  const checks = [
    ["healthy page passes", check({ page: goodPage, manifest: goodManifest }).length === 0],
    [
      "missing useSearchParams caught",
      check({
        page: goodPage.replace(/useSearchParams/g, "useParams"),
        manifest: goodManifest,
      }).some((x) => x.includes("useSearchParams")),
    ],
    [
      "missing tab read caught",
      check({
        page: goodPage.replace('searchParams.get("tab")', 'searchParams.get("view")'),
        manifest: goodManifest,
      }).some((x) => x.includes('searchParams.get("tab")')),
    ],
    [
      "local useState tab caught",
      check({
        page: `${goodPage}\nconst [tab, setTab] = useState<HubTab>("overview");`,
        manifest: goodManifest,
      }).some((x) => x.includes("useState")),
    ],
    [
      "missing route caught",
      check({ page: goodPage, manifest: `path="/drivers"` }).some((x) => x.includes("/driver-hub")),
    ],
  ];

  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK (${checks.length} cases)`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const msg of failures) console.error(`  - ${msg}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
