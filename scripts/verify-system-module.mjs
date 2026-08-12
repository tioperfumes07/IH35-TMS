#!/usr/bin/env node
/**
 * verify-system-module.mjs
 * CI guard: the Owner-only SYSTEM module (owner-supplied design) must stay WIRED — sidebar entry, route,
 * page, and all six tabs. It also enforces the module's design law: SYSTEM is Owner-only, and QuickBooks
 * Reconciliation is NOT combined with bank reconciliation.
 *
 * FAILS IF ANY OF:
 *   1. sidebar-config.ts SIDEBAR_ITEM_IDS does not include "system".
 *   2. sidebar-config.ts SIDEBAR_ITEM_META lacks a `system:` entry routing to "/system" with Owner-only
 *      visibleRoles.
 *   3. routes/manifest.tsx does not lazy-import SystemModulePage AND register path="/system" behind
 *      OwnerOnlyRoute.
 *   4. SystemModulePage.tsx is missing or does not export SystemModulePage.
 *   5. Any of the six canonical tab labels is missing from SystemModulePage.tsx.
 *
 * Self-test (pure logic, no filesystem): node scripts/verify-system-module.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The six canonical SYSTEM tab labels (must match SYSTEM_TABS in SystemModulePage.tsx). */
export const SYSTEM_TAB_LABELS = [
  "Overview",
  "QuickBooks Reconciliation",
  "QuickBooks Sync",
  "Program Tracker",
  "Software / Build",
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

  const checks = [
    ["fully-wired inputs produce zero failures", pass.length === 0],
    ["missing sidebar id is flagged", failNoId.some((e) => e.includes("SIDEBAR_ITEM_IDS"))],
    ["non-Owner visibility is flagged", failNotOwner.some((e) => e.includes("Owner-only"))],
    ["missing tab is flagged", failMissingTab.some((e) => e.includes("Claude Coder"))],
    ["non-OwnerOnly route is flagged", failNotOwnerRoute.some((e) => e.includes("OwnerOnlyRoute"))],
    ["hand-built QBO table is flagged", failHandBuiltQboTable.some((e) => e.includes("persistent ParityTable"))],
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

if (failures.length) {
  console.error("verify:system-module FAIL — the Owner-only SYSTEM module is not fully wired:");
  for (const f of failures) console.error("  x " + f);
  process.exit(1);
}
console.log("verify:system-module PASS (sidebar + route + page + 6 tabs wired; Owner-only; QBO recon ≠ bank recon)");
