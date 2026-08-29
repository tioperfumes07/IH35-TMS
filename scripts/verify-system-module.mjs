#!/usr/bin/env node
/** @matrix-built {"modules":["system"],"cols":["qbo_chrome"],"leafRe":"^tab\\.qbo_recon$","task":"P17-system-qbo-recon"} */
/** @matrix-built {"modules":["system"],"cols":["qbo_chrome"],"leafRe":"^tab\\.qbo_sync$","task":"P17-system-qbo-sync"} */
/**
 * verify-system-module.mjs
 * CI guard: the Owner-only SYSTEM module (owner-supplied design) must stay WIRED — sidebar entry, route,
 * page, and all eight tabs. It also enforces the module's design law: SYSTEM is Owner-only, and QuickBooks
 * Reconciliation is NOT combined with bank reconciliation.
 *
 * FAILS IF ANY OF:
 *   1. sidebar-config.ts SIDEBAR_ITEM_IDS does not include "system".
 *   2. sidebar-config.ts SIDEBAR_ITEM_META lacks a `system:` entry routing to "/system" with Owner-only
 *      visibleRoles.
 *   3. routes/manifest.tsx does not lazy-import SystemModulePage AND register path="/system" behind
 *      OwnerOnlyRoute.
 *   4. SystemModulePage.tsx is missing or does not export SystemModulePage.
 *   5. Any of the eight canonical tab labels is missing from SystemModulePage.tsx.
 *
 * Self-test (pure logic, no filesystem): node scripts/verify-system-module.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The eight canonical SYSTEM tab labels (must match SYSTEM_TABS in SystemModulePage.tsx).
 * "Transactions" (TXH-01 / SYS-F-TRANSACTION-HEALTH-REGISTER, 2026-08-28) added the 8th, relabeled
 * "Transaction Health" (2026-08-29) so it reads distinctly from the neighboring "Ledger Health" tab.
 */
export const SYSTEM_TAB_LABELS = [
  "Overview",
  "QuickBooks Reconciliation",
  "QuickBooks Sync",
  "Program Tracker",
  "Software / Build",
  "Ledger Health",
  "Transaction Health",
  "Claude Coder",
];

/** Pure evaluation of the wiring, given the relevant file contents. Shared by the real run and --selftest. */
export function computeSystemModuleFailures(files) {
  const sidebar = files.sidebar ?? "";
  const manifest = files.manifest ?? "";
  const page = files.page ?? "";
  const errors = [];

  // 1 — sidebar id present in SIDEBAR_ITEM_IDS
  const idsMatch = sidebar.match(/export\s+const\s+SIDEBAR_ITEM_IDS\s*=\s*\[([\s\S]*?)\]\s*as\s+const/);
  const idsBody = idsMatch ? idsMatch[1] : "";
  if (!/["']system["']/.test(idsBody)) {
    errors.push('sidebar-config.ts: SIDEBAR_ITEM_IDS must include "system"');
  }

  // 2 — sidebar meta entry → "/system", Owner-only
  const metaMatch = sidebar.match(/\bsystem:\s*\{[^}]*\}/);
  if (!metaMatch) {
    errors.push("sidebar-config.ts: SIDEBAR_ITEM_META must define a `system:` entry");
  } else {
    const meta = metaMatch[0];
    if (!/to:\s*["']\/system["']/.test(meta)) {
      errors.push('sidebar-config.ts: system meta must route to "/system"');
    }
    if (!/visibleRoles:\s*\[\s*["']Owner["']\s*\]/.test(meta)) {
      errors.push('sidebar-config.ts: system meta must be Owner-only (visibleRoles: ["Owner"])');
    }
  }

  // 3 — route registered behind OwnerOnlyRoute
  if (!/import\(["'][^"']*pages\/system\/SystemModulePage["']\)/.test(manifest)) {
    errors.push("routes/manifest.tsx: must lazy-import ../pages/system/SystemModulePage");
  }
  const routeBlock = manifest.match(/path=["']\/system["'][\s\S]{0,240}/);
  if (!/path=["']\/system["']/.test(manifest)) {
    errors.push('routes/manifest.tsx: must register a Route with path="/system"');
  } else if (!routeBlock || !/OwnerOnlyRoute/.test(routeBlock[0]) || !/SystemModulePage/.test(routeBlock[0])) {
    errors.push('routes/manifest.tsx: the "/system" route must render <SystemModulePage /> inside <OwnerOnlyRoute>');
  }

  // 4 — page exports SystemModulePage
  if (!/export\s+(function|const)\s+SystemModulePage\b/.test(page)) {
    errors.push("SystemModulePage.tsx: must export SystemModulePage");
  }

  // 5 — all six tabs present
  for (const label of SYSTEM_TAB_LABELS) {
    if (!page.includes(label)) {
      errors.push(`SystemModulePage.tsx: missing SYSTEM tab "${label}"`);
    }
  }

  // Design law: QBO Reconciliation must not be merged with bank reconciliation.
  if (page.includes("Overview") && !/not bank reconciliation/i.test(page)) {
    errors.push('SystemModulePage.tsx: must state QuickBooks Reconciliation is not bank reconciliation (design law)');
  }

  // P17 Wave-D chrome: the QBO reconciliation object register must retain canonical sortable,
  // resizable, column-chooser table chrome instead of drifting back to a hand-built table.
  if (!/import\s*\{[^}]*ParityTable[^}]*\}\s*from\s*["'][^"']*components\/parity\/ParityTable["']/.test(page)) {
    errors.push("SystemModulePage.tsx: QBO reconciliation must import the canonical ParityTable");
  }
  if (!/<ParityTable<ReconObject>[\s\S]{0,500}?storageKey="system-qbo-reconciled-objects"/.test(page)) {
    errors.push("SystemModulePage.tsx: QBO reconciliation objects must use persistent ParityTable chrome");
  }
  if (!/syncHealth\.isError[\s\S]{0,180}?<Pill tone="off">UNAVAILABLE<\/Pill>/.test(page)) {
    errors.push("SystemModulePage.tsx: QBO Sync request failures must render UNAVAILABLE, never remain CHECKING");
  }
  if (!/syncHealth\.isError[\s\S]{0,180}?role="alert"/.test(page)) {
    errors.push("SystemModulePage.tsx: QBO Sync request failures must render an accessible error message");
  }

  // LV-SYSTEM-CLAUDE-ACTIVITY-FALSE-LIVE: recent_merged comes from the committed reconciliation
  // snapshot, not a runtime GitHub feed. The UI must expose its real as-of timestamp and never call
  // three-day-old snapshot rows "live" while current deploys continue moving.
  if (/Live feed of the most recently merged PRs/i.test(page)) {
    errors.push("SystemModulePage.tsx: Claude Coder must not label snapshot PR activity as a live feed");
  }
  if (!/Program Tracker reconciliation snapshot as of[\s\S]{0,120}?tracker\.data\?\.recon_synced_at/.test(page)) {
    errors.push("SystemModulePage.tsx: Claude Coder must show the reconciliation snapshot as-of timestamp");
  }
  if (!/This is not a[\s\S]{0,30}?live GitHub feed/.test(page)) {
    errors.push("SystemModulePage.tsx: Claude Coder must disclose that PR activity is not a live GitHub feed");
  }

  // LV-SYSTEM-USMCA-QBO-CHROME: QBO belongs only to the TRANSP mirror. The selected-company
  // capability must govern tabs, deep links, cards/activity copy, and network queries together.
  if (!/const qboAvailable = selectedCompany\?\.code === ["']TRANSP["']/.test(page)) {
    errors.push("SystemModulePage.tsx: QBO availability must derive from selected TRANSP company");
  }
  if (!/enabled:\s*enabled && qboAvailable/g.test(page) || (page.match(/enabled:\s*enabled && qboAvailable/g) ?? []).length < 3) {
    errors.push("SystemModulePage.tsx: all three QBO/AP queries must be disabled outside TRANSP");
  }
  if (!/visibleTabs = SYSTEM_TABS\.filter\([\s\S]{0,140}!QBO_SYSTEM_TAB_IDS\.has\(candidate\.id\)/.test(page)) {
    errors.push("SystemModulePage.tsx: QBO tabs must be filtered outside TRANSP");
  }
  if (!/parseSystemTab\(searchParams\.get\(["']tab["']\), qboAvailable\)/.test(page)) {
    errors.push("SystemModulePage.tsx: direct QBO tab URLs must fail closed outside TRANSP");
  }
  if ((page.match(/qboAvailable \? <Card/g) ?? []).length < 2) {
    errors.push("SystemModulePage.tsx: both overview QBO cards must be hidden outside TRANSP");
  }

  // LV-SYSTEM-DEPLOY-PARITY-DIRECTION-GUESS: comparing two unequal service SHAs establishes only
  // a mismatch. Without main HEAD, the UI must not guess which independently deployed service lags.
  if (/FRONTEND STALE|BACKEND STALE/.test(page)) {
    errors.push("SystemModulePage.tsx: deploy parity must not guess which service is stale");
  }
  if (!/inSync \? ["']IN SYNC["'] : ["']DEPLOY MISMATCH["']/.test(page)) {
    errors.push("SystemModulePage.tsx: unequal frontend/backend SHAs must render DEPLOY MISMATCH");
  }

  // LV-SYSTEM-PROGRAM-MIXED-DENOMINATORS: status views include recon-only legacy rows while
  // registered_total is registry-only. Both System cards must show the exact active-view denominator.
  if (!/function activeTrackerCount\(tracker: ProgramTracker\)[\s\S]{0,180}pending \+ in_progress \+ completed/.test(page)) {
    errors.push("SystemModulePage.tsx: Program status denominator must sum active status views");
  }
  if ((page.match(/<Row label="Active tracked blocks">[\s\S]{0,180}?activeTrackerCount\(/g) ?? []).length !== 2) {
    errors.push("SystemModulePage.tsx: overview and Program cards must share the active status denominator");
  }

  // SYSTEM-LAUNCH-COPY-SILENT: Launch/Copy must not paint Copied after a swallowed clipboard write.
  if (/clipboard\?\.writeText\(LAUNCH_COMMAND\)\.catch\(\s*\(\)\s*=>\s*undefined\)/.test(page)) {
    errors.push("SystemModulePage.tsx: Claude Coder must not fire-and-forget clipboard write");
  }
  if (!/useToast/.test(page)) {
    errors.push("SystemModulePage.tsx: Claude Coder copy must use useToast");
  }
  if (!/Could not copy the launch command/.test(page)) {
    errors.push("SystemModulePage.tsx: Claude Coder must toast clipboard write failure");
  }
  if (!/await navigator\.clipboard\.writeText\(LAUNCH_COMMAND\)/.test(page)) {
    errors.push("SystemModulePage.tsx: Claude Coder must await clipboard write before Copied");
  }

  return errors;
}

export function computeGlobalQboCapabilityFailures(files) {
  const topbar = files.topbar ?? "";
  const statusBar = files.statusBar ?? "";
  const mobile = files.mobile ?? "";
  const page = files.page ?? "";
  const errors = [];
  if (!/const qboAvailable = selectedCompany\?\.code === ["']TRANSP["']/.test(topbar)) {
    errors.push("Topbar.tsx: QBO capability must derive from selected TRANSP company");
  }
  if ((topbar.match(/enabled:\s*Boolean\(companyId\) && office && qboAvailable/g) ?? []).length < 2) {
    errors.push("Topbar.tsx: QBO status and sync-health queries must be disabled outside TRANSP");
  }
  if (!/<TopStatusBar[\s\S]{0,120}?qboAvailable=\{qboAvailable\}/.test(topbar)) {
    errors.push("Topbar.tsx: selected-company QBO capability must reach shared status chrome");
  }
  if (!/qboAvailable && qboSyncPill/.test(statusBar) || !/qboAvailable \? <span[\s\S]{0,420}?qboVis\.label/.test(statusBar)) {
    errors.push("TopStatusBar.tsx: desktop QuickBooks and QBO Sync chrome must be hidden outside TRANSP");
  }
  if (!/if \(qboAvailable\)[\s\S]{0,180}?items\.unshift\(\{ key: ["']qbo["']/.test(mobile) || !/if \(qboAvailable && qboSyncPill\)/.test(mobile)) {
    errors.push("StatusBarMobile.tsx: mobile QuickBooks and QBO Sync chrome must be hidden outside TRANSP");
  }
  if (!/visibleChecks = \(h\?\.checks \?\? \[\]\)\.filter\([\s\S]{0,120}!check\.name\.startsWith\(["']qbo\.["']\)/.test(page)) {
    errors.push("SystemModulePage.tsx: non-TRANSP service health must not expose QBO checks");
  }
  if (!/qboAvailable \? ["']QuickBooks Reconciliation, QuickBooks Sync, Program Tracker, and Software\/Build["'] : ["']Program Tracker and Software\/Build["']/.test(page)) {
    errors.push("SystemModulePage.tsx: entity-specific System footer must remain grammatical");
  }
  return errors;
}

function readIf(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8");
}

if (process.argv.includes("--selftest")) {
  const goodSidebar =
    'export const SIDEBAR_ITEM_IDS = ["home","program","system"] as const;\n' +
    'system: { id: "system", label: "SYSTEM", Icon: SlidersHorizontal, to: "/system", visibleRoles: ["Owner"] },';
  const goodManifest =
    'const SystemModulePage = React.lazy(() => import("../pages/system/SystemModulePage").then((m) => ({ default: m.SystemModulePage })));\n' +
    '<Route path="/system" element={<OwnerOnlyRoute><SystemModulePage /></OwnerOnlyRoute>} />';
  const goodPage =
    "export function SystemModulePage() { return null; }\n" +
    'import { ParityTable } from "../../components/parity/ParityTable";\n' +
    '<ParityTable<ReconObject> storageKey="system-qbo-reconciled-objects" />\n' +
    'syncHealth.isError ? <Pill tone="off">UNAVAILABLE</Pill> : <Pill>CHECKING</Pill>;\n' +
    'syncHealth.isError ? <p role="alert">Could not load QuickBooks sync health.</p> : null;\n' +
    'Program Tracker reconciliation snapshot as of {ctDateTime(tracker.data?.recon_synced_at)}. This is not a live GitHub feed;\n' +
    'const qboAvailable = selectedCompany?.code === "TRANSP";\n' +
    'enabled: enabled && qboAvailable; enabled: enabled && qboAvailable; enabled: enabled && qboAvailable;\n' +
    'const visibleTabs = SYSTEM_TABS.filter((candidate) => qboAvailable || !QBO_SYSTEM_TAB_IDS.has(candidate.id));\n' +
    'parseSystemTab(searchParams.get("tab"), qboAvailable);\n' +
    'qboAvailable ? <Card /> : null; qboAvailable ? <Card /> : null;\n' +
    'inSync ? "IN SYNC" : "DEPLOY MISMATCH";\n' +
    'function activeTrackerCount(tracker: ProgramTracker) { const { pending, in_progress, completed } = tracker.view_counts; return pending + in_progress + completed; }\n' +
    '<Row label="Active tracked blocks">{activeTrackerCount(tracker.data)}</Row>; <Row label="Active tracked blocks">{activeTrackerCount(t)}</Row>;\n' +
    'useToast();\n' +
    'await navigator.clipboard.writeText(LAUNCH_COMMAND);\n' +
    'pushToast("Could not copy the launch command", "error");\n' +
    "// not bank reconciliation\n" +
    SYSTEM_TAB_LABELS.map((l) => `"${l}"`).join(",");

  const pass = computeSystemModuleFailures({ sidebar: goodSidebar, manifest: goodManifest, page: goodPage });
  const failNoId = computeSystemModuleFailures({
    sidebar: 'export const SIDEBAR_ITEM_IDS = ["home"] as const;',
    manifest: goodManifest,
    page: goodPage,
  });
  const failNotOwner = computeSystemModuleFailures({
    sidebar: goodSidebar.replace('visibleRoles: ["Owner"]', 'visibleRoles: ["Owner", "Administrator"]'),
    manifest: goodManifest,
    page: goodPage,
  });
  const failMissingTab = computeSystemModuleFailures({
    sidebar: goodSidebar,
    manifest: goodManifest,
    page: goodPage.replace('"Claude Coder"', '"Nope"'),
  });
  const failNotOwnerRoute = computeSystemModuleFailures({
    sidebar: goodSidebar,
    manifest: goodManifest.replaceAll("OwnerOnlyRoute", "ProtectedRoute"),
    page: goodPage,
  });
  const failHandBuiltQboTable = computeSystemModuleFailures({
    sidebar: goodSidebar,
    manifest: goodManifest,
    page: goodPage.replace('<ParityTable<ReconObject> storageKey="system-qbo-reconciled-objects" />', "<table />"),
  });
  const failFalseChecking = computeSystemModuleFailures({
    sidebar: goodSidebar,
    manifest: goodManifest,
    page: goodPage
      .replace('syncHealth.isError ? <Pill tone="off">UNAVAILABLE</Pill> : <Pill>CHECKING</Pill>;', '<Pill>CHECKING</Pill>;')
      .replace('syncHealth.isError ? <p role="alert">Could not load QuickBooks sync health.</p> : null;', ""),
  });
  const failFalseLiveActivity = computeSystemModuleFailures({
    sidebar: goodSidebar,
    manifest: goodManifest,
    page: goodPage
      .replace("Program Tracker reconciliation snapshot as of", "Live feed of the most recently merged PRs")
      .replace("This is not a live GitHub feed", "Activity is live"),
  });
  const failUsmcaQboLeak = computeSystemModuleFailures({
    sidebar: goodSidebar,
    manifest: goodManifest,
    page: goodPage
      .replace('const qboAvailable = selectedCompany?.code === "TRANSP";', "const qboAvailable = true;")
      .replaceAll("enabled: enabled && qboAvailable", "enabled")
      .replace("const visibleTabs = SYSTEM_TABS.filter((candidate) => qboAvailable || !QBO_SYSTEM_TAB_IDS.has(candidate.id));", "const visibleTabs = SYSTEM_TABS;")
      .replace('parseSystemTab(searchParams.get("tab"), qboAvailable);', 'parseSystemTab(searchParams.get("tab"));')
      .replaceAll("qboAvailable ? <Card /> : null", "<Card />"),
  });
  const failDeployDirectionGuess = computeSystemModuleFailures({
    sidebar: goodSidebar,
    manifest: goodManifest,
    page: goodPage.replace('inSync ? "IN SYNC" : "DEPLOY MISMATCH"', 'inSync ? "IN SYNC" : "FRONTEND STALE"'),
  });
  const failMixedTrackerDenominator = computeSystemModuleFailures({
    sidebar: goodSidebar,
    manifest: goodManifest,
    page: goodPage.replaceAll("activeTrackerCount(", "tracker.data.registered_total || (")
      .replace("pending + in_progress + completed", "tracker.registered_total"),
  });
  const failSilentLaunchCopy = computeSystemModuleFailures({
    sidebar: goodSidebar,
    manifest: goodManifest,
    page: goodPage
      .replace("useToast();", "")
      .replace("await navigator.clipboard.writeText(LAUNCH_COMMAND);", "void navigator.clipboard?.writeText(LAUNCH_COMMAND).catch(() => undefined);")
      .replace('pushToast("Could not copy the launch command", "error");', "setCopied(which);"),
  });
  const goodGlobalQbo = {
    topbar: 'const qboAvailable = selectedCompany?.code === "TRANSP"; enabled: Boolean(companyId) && office && qboAvailable; enabled: Boolean(companyId) && office && qboAvailable; <TopStatusBar qboAvailable={qboAvailable} />',
    statusBar: 'qboAvailable ? <span>{qboVis.label}</span> : null; qboAvailable && qboSyncPill',
    mobile: 'if (qboAvailable) { items.unshift({ key: "qbo" }); } if (qboAvailable && qboSyncPill) {}',
    page: 'const visibleChecks = (h?.checks ?? []).filter((check) => qboAvailable || !check.name.startsWith("qbo.")); qboAvailable ? "QuickBooks Reconciliation, QuickBooks Sync, Program Tracker, and Software/Build" : "Program Tracker and Software/Build";',
  };
  const passGlobalQbo = computeGlobalQboCapabilityFailures(goodGlobalQbo);
  const failGlobalQbo = computeGlobalQboCapabilityFailures({
    topbar: goodGlobalQbo.topbar.replaceAll(" && qboAvailable", "").replace("qboAvailable={qboAvailable}", ""),
    statusBar: goodGlobalQbo.statusBar.replaceAll("qboAvailable", "true"),
    mobile: goodGlobalQbo.mobile.replaceAll("qboAvailable", "true"),
    page: 'const visibleChecks = h?.checks ?? []; qboAvailable ? "QuickBooks Reconciliation, QuickBooks Sync, Program Tracker, and Software/Build" : "Program Tracker, and Software/Build";',
  });

  const checks = [
    ["fully-wired inputs produce zero failures", pass.length === 0],
    ["missing sidebar id is flagged", failNoId.some((e) => e.includes("SIDEBAR_ITEM_IDS"))],
    ["non-Owner visibility is flagged", failNotOwner.some((e) => e.includes("Owner-only"))],
    ["missing tab is flagged", failMissingTab.some((e) => e.includes("Claude Coder"))],
    ["non-OwnerOnly route is flagged", failNotOwnerRoute.some((e) => e.includes("OwnerOnlyRoute"))],
    ["hand-built QBO table is flagged", failHandBuiltQboTable.some((e) => e.includes("persistent ParityTable"))],
    ["false CHECKING state is flagged", failFalseChecking.filter((e) => e.includes("QBO Sync request failures")).length === 2],
    ["false-live Claude activity is flagged", failFalseLiveActivity.filter((e) => e.includes("Claude Coder")).length === 3],
    ["USMCA QBO chrome/query leak is flagged", failUsmcaQboLeak.filter((e) => /TRANSP|QBO/.test(e)).length === 5],
    ["deploy mismatch direction guess is flagged", failDeployDirectionGuess.filter((e) => e.includes("deploy parity") || e.includes("DEPLOY MISMATCH")).length === 2],
    ["mixed Program Tracker denominator is flagged", failMixedTrackerDenominator.filter((e) => e.includes("status denominator") || e.includes("active status denominator")).length === 2],
    ["silent Claude launch copy is flagged", failSilentLaunchCopy.filter((e) => /clipboard|useToast|launch command/.test(e)).length >= 3],
    ["global QBO capability inputs produce zero failures", passGlobalQbo.length === 0],
    ["global USMCA QBO chrome/query/copy leak is flagged", failGlobalQbo.length === 6],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:system-module --selftest FAIL:");
    for (const [n] of failed) console.error("  x " + n);
    process.exit(1);
  }
  console.log(`verify:system-module --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const failures = computeSystemModuleFailures({
  sidebar: readIf("apps/frontend/src/components/layout/sidebar-config.ts"),
  manifest: readIf("apps/frontend/src/routes/manifest.tsx"),
  page: readIf("apps/frontend/src/pages/system/SystemModulePage.tsx"),
});
failures.push(...computeGlobalQboCapabilityFailures({
  topbar: readIf("apps/frontend/src/components/Topbar.tsx"),
  statusBar: readIf("apps/frontend/src/components/layout/TopStatusBar.tsx"),
  mobile: readIf("apps/frontend/src/components/layout/StatusBarMobile.tsx"),
  page: readIf("apps/frontend/src/pages/system/SystemModulePage.tsx"),
}));

if (failures.length) {
  console.error("verify:system-module FAIL — the Owner-only SYSTEM module is not fully wired:");
  for (const f of failures) console.error("  x " + f);
  process.exit(1);
}
console.log(`verify:system-module PASS (sidebar + route + page + ${SYSTEM_TAB_LABELS.length} tabs wired; Owner-only; QBO recon ≠ bank recon)`);
