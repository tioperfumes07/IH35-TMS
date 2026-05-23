#!/usr/bin/env tsx
/**
 * verify-architectural-design.ts
 *
 * Locks accepted UI surface against silent removals. The baseline lives in:
 *   docs/locked-ui-surface.json
 *
 * Verification behavior:
 * - FAIL if any locked route is no longer registered in App.tsx
 * - FAIL if any locked sidebar item id is removed
 * - FAIL if any locked sub-nav tab is removed
 * - FAIL if any locked named section is removed
 * - PASS when only additions are made
 *
 * Use --write-baseline to regenerate the lock file intentionally.
 */

import * as fs from "node:fs";
import { execSync } from "node:child_process";

const APP_PATH = "apps/frontend/src/App.tsx";
const SIDEBAR_PATH = "apps/frontend/src/components/layout/sidebar-config.ts";
const LOCK_FILE_PATH = "docs/locked-ui-surface.json";
const EXTRA_GUARDS = [
  "scripts/verify-home-attention-tenant-scope.mjs",
  "scripts/verify-fleet-snapshot-tenant-scope.mjs",
  "scripts/verify-customers-tenant-scope.mjs",
  "scripts/verify-vendors-tenant-scope.mjs",
  "scripts/verify-94-live-counter-linkage.mjs",
  "scripts/verify-tms-item-push-tenant-chain.mjs",
  "scripts/verify-tms-account-push-tenant-chain.mjs",
  "scripts/verify-tms-invoice-push-tenant-chain.mjs",
  "scripts/verify-tms-invoice-line-item-shape.mjs",
  "scripts/verify-qbo-invoices-mirror-shape.mjs",
  "scripts/verify-qbo-customer-sync-tenant-chain.mjs",
  "scripts/verify-qbo-sync-event-log-tenant-scope.mjs",
  "scripts/verify-samsara-qbo-vendor-mapping-tenant-scope.mjs",
  "scripts/verify-qbo-sync-state-machine-transitions.mjs",
  "scripts/verify-samsara-vendor-mapping-actions-tenant-scope.mjs",
  "scripts/verify-cash-basis-engine-determinism.mjs",
  "scripts/verify-period-cash-basis-snapshot-shape.mjs",
  "scripts/verify-basis-selector-allowed-pages.mjs",
  "scripts/verify-period-cash-basis-snapshot-readonly.mjs",
  "scripts/verify-expense-category-map-tenant-scope.mjs",
  "scripts/verify-expense-category-map-soft-delete.mjs",
] as const;

type LockedUiSurface = {
  schemaVersion: 1;
  generatedAt: string;
  source: {
    branch: string;
    commit: string;
  };
  routes: string[];
  sidebarItemIds: string[];
  subNavTabs: Record<string, string[]>;
  namedSections: Record<string, string[]>;
};

type SubNavSource = {
  module: string;
  file: string;
  startToken: string;
  valueField: "label" | "id";
};

type NamedSectionSource = {
  module: string;
  file: string;
  patterns: RegExp[];
};

const SUB_NAV_SOURCES: SubNavSource[] = [
  {
    module: "accounting",
    file: "apps/frontend/src/pages/accounting/AccountingSubNav.tsx",
    startToken: "export const ACCOUNTING_SUB_NAV_ITEMS = [",
    valueField: "label",
  },
  {
    module: "maintenance",
    file: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx",
    startToken: "const SUBNAV = [",
    valueField: "label",
  },
  {
    module: "fuel",
    file: "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
    startToken: "const SUBNAV = [",
    valueField: "label",
  },
  {
    module: "drivers",
    file: "apps/frontend/src/pages/Drivers.tsx",
    startToken: "const DRIVERS_SUBNAV = [",
    valueField: "label",
  },
  {
    module: "banking",
    file: "apps/frontend/src/pages/banking/BankingHome.tsx",
    startToken: "const BANKING_TABS = [",
    valueField: "label",
  },
  {
    module: "banking_transactions_review_tabs",
    file: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    startToken: "export const BANKING_REVIEW_TABS = [",
    valueField: "label",
  },
  {
    module: "banking_transactions_type_filters",
    file: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    startToken: "export const TRANSACTION_TYPE_FILTER_OPTIONS = [",
    valueField: "label",
  },
  {
    module: "banking_transactions_view_menu",
    file: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    startToken: "export const VIEW_SETTINGS_LOCK_LABELS = [",
    valueField: "label",
  },
  {
    module: "banking_transactions_print_export",
    file: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    startToken: "export const PRINT_EXPORT_CONTROL_LABELS = [",
    valueField: "label",
  },
  {
    module: "safety",
    file: "apps/frontend/src/pages/safety/SafetyTabsMeta.ts",
    startToken: "export const TABS = [",
    valueField: "id",
  },
  {
    module: "reports",
    file: "apps/frontend/src/pages/reports/ReportsSubNav.tsx",
    startToken: "export const REPORTS_SUB_NAV_ITEMS: NavItem[] = [",
    valueField: "label",
  },
  {
    module: "lists",
    file: "apps/frontend/src/pages/lists/ListsSubNav.tsx",
    startToken: "export const LISTS_SUB_NAV_ITEMS: NavItem[] = [",
    valueField: "label",
  },
  {
    module: "legal",
    file: "apps/frontend/src/pages/legal/LegalModuleTabs.tsx",
    startToken: "const TABS = [",
    valueField: "label",
  },
  {
    module: "form425c",
    file: "apps/frontend/src/pages/form425c/Form425CHome.tsx",
    startToken: "const TABS: Array<{ id: TabId; label: string }> = [",
    valueField: "label",
  },
];

const NAMED_SECTION_SOURCES: NamedSectionSource[] = [
  {
    module: "accounting",
    file: "apps/frontend/src/pages/accounting/AccountingHubPage.tsx",
    patterns: [/<PageHeader[^>]*\btitle="([^"]+)"/g, /<HubSection[^>]*\btitle="([^"]+)"/g],
  },
  {
    module: "banking",
    file: "apps/frontend/src/pages/banking/BankingHome.tsx",
    patterns: [/<PageHeader[^>]*\btitle="([^"]+)"/g],
  },
  {
    module: "maintenance",
    file: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx",
    patterns: [/<PageHeader[^>]*\btitle="([^"]+)"/g],
  },
  {
    module: "fuel",
    file: "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
    patterns: [/<PageHeader[^>]*\btitle="([^"]+)"/g, /<h3[^>]*>\s*([^<]+?)\s*<\/h3>/g],
  },
  {
    module: "drivers",
    file: "apps/frontend/src/pages/Drivers.tsx",
    patterns: [/<PageHeader[^>]*\btitle="([^"]+)"/g, /<DataPanel[^>]*\btitle="([^"]+)"/g],
  },
  {
    module: "dispatch",
    file: "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
    patterns: [/>\s*(Book load)\s*</g],
  },
];

function unique(items: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const value = item.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function readRequired(path: string): string {
  if (!fs.existsSync(path)) {
    console.error(`✘ Missing required file: ${path}`);
    process.exit(1);
  }
  return fs.readFileSync(path, "utf8");
}

function extractArrayBlock(content: string, startToken: string): string {
  const start = content.indexOf(startToken);
  if (start < 0) {
    throw new Error(`Could not find array start token: ${startToken}`);
  }
  const assignment = content.indexOf("=", start);
  if (assignment < 0) {
    throw new Error(`Could not find '=' after token: ${startToken}`);
  }
  const startBracket = content.indexOf("[", assignment);
  if (startBracket < 0) {
    throw new Error(`Could not find '[' after token: ${startToken}`);
  }
  let depth = 0;
  for (let i = startBracket; i < content.length; i++) {
    const ch = content[i];
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) return content.slice(startBracket, i + 1);
    }
  }
  throw new Error(`Unclosed array for token: ${startToken}`);
}

function extractRoutesFromApp(): string[] {
  const content = readRequired(APP_PATH);
  const out: string[] = [];

  const directRouteRegex = /<Route\b[^>]*\bpath=(?:"([^"]+)"|'([^']+)')/g;
  let directMatch: RegExpExecArray | null;
  while ((directMatch = directRouteRegex.exec(content)) !== null) {
    const route = directMatch[1] ?? directMatch[2];
    if (route) out.push(route);
  }

  const mappedPathArrayRegex = /\[((?:.|\r|\n)*?)\]\.map\(\(path\)\s*=>[\s\S]*?<Route[\s\S]*?\bpath=\{path\}/g;
  let mappedMatch: RegExpExecArray | null;
  while ((mappedMatch = mappedPathArrayRegex.exec(content)) !== null) {
    const arrayBlock = mappedMatch[1];
    const literalRegex = /"([^"]+)"|'([^']+)'/g;
    let literal: RegExpExecArray | null;
    while ((literal = literalRegex.exec(arrayBlock)) !== null) {
      const value = literal[1] ?? literal[2];
      if (value && (value.startsWith("/") || value === "*")) out.push(value);
    }
  }

  const mappedTupleArrayRegex = /\[((?:.|\r|\n)*?)\]\.map\(\(\[path[^\]]*\]\)\s*=>[\s\S]*?<Route[\s\S]*?\bpath=\{path\}/g;
  let tupleMatch: RegExpExecArray | null;
  while ((tupleMatch = mappedTupleArrayRegex.exec(content)) !== null) {
    const arrayBlock = tupleMatch[1];
    const pathLiteralRegex = /"((?:\/|\*)[^"]*)"|'((?:\/|\*)[^']*)'/g;
    let pathLiteral: RegExpExecArray | null;
    while ((pathLiteral = pathLiteralRegex.exec(arrayBlock)) !== null) {
      const value = pathLiteral[1] ?? pathLiteral[2];
      if (value) out.push(value);
    }
  }

  return unique(out).sort();
}

function extractSidebarItemIds(): string[] {
  const content = readRequired(SIDEBAR_PATH);
  const block = extractArrayBlock(content, "export const SIDEBAR_ITEM_IDS = [");
  const out: string[] = [];
  const regex = /"([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(block)) !== null) {
    out.push(match[1]);
  }
  return unique(out);
}

function extractSubNavTabs(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const source of SUB_NAV_SOURCES) {
    const content = readRequired(source.file);
    const block = extractArrayBlock(content, source.startToken);
    const regex = source.valueField === "label" ? /label:\s*"([^"]+)"/g : /id:\s*"([^"]+)"/g;
    const values: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = regex.exec(block)) !== null) {
      values.push(match[1]);
    }
    out[source.module] = unique(values);
  }
  return out;
}

function extractNamedSections(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const source of NAMED_SECTION_SOURCES) {
    const content = readRequired(source.file);
    const moduleValues = out[source.module] ?? [];
    for (const pattern of source.patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        moduleValues.push(match[1]);
      }
    }
    out[source.module] = unique(moduleValues);
  }
  return out;
}

function resolveGitDir(): string | null {
  const gitMetaPath = ".git";
  if (!fs.existsSync(gitMetaPath)) return null;
  const stats = fs.statSync(gitMetaPath);
  if (stats.isDirectory()) return gitMetaPath;
  const raw = fs.readFileSync(gitMetaPath, "utf8").trim();
  const match = raw.match(/^gitdir:\s*(.+)$/i);
  if (!match) return null;
  return match[1].trim();
}

function getCurrentRef(): { branch: string; commit: string } {
  try {
    const branch = execSync("git branch --show-current", { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim() || "unknown";
    const commit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim() || "unknown";
    return { branch, commit };
  } catch {
    // Fall through to filesystem-based fallback below.
  }
  const gitDir = resolveGitDir();
  if (!gitDir) return { branch: "unknown", commit: "unknown" };
  const headPath = `${gitDir}/HEAD`;
  if (!fs.existsSync(headPath)) return { branch: "unknown", commit: "unknown" };
  const head = fs.readFileSync(headPath, "utf8").trim();
  if (head.startsWith("ref: ")) {
    const ref = head.slice(5);
    const branch = ref.split("/").at(-1) ?? "unknown";
    const refPath = `${gitDir}/${ref}`;
    const commit = fs.existsSync(refPath) ? fs.readFileSync(refPath, "utf8").trim() : "unknown";
    return { branch, commit };
  }
  return { branch: "detached", commit: head };
}

function buildCurrentSurface(): LockedUiSurface {
  const ref = getCurrentRef();
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      branch: ref.branch,
      commit: ref.commit,
    },
    routes: extractRoutesFromApp(),
    sidebarItemIds: extractSidebarItemIds(),
    subNavTabs: extractSubNavTabs(),
    namedSections: extractNamedSections(),
  };
}

function readBaseline(): LockedUiSurface {
  if (!fs.existsSync(LOCK_FILE_PATH)) {
    console.error(`✘ Baseline file missing: ${LOCK_FILE_PATH}`);
    console.error(`  Run: tsx scripts/verify-architectural-design.ts --write-baseline`);
    process.exit(1);
  }
  const parsed = JSON.parse(fs.readFileSync(LOCK_FILE_PATH, "utf8")) as LockedUiSurface;
  if (parsed.schemaVersion !== 1) {
    console.error(`✘ Unsupported ${LOCK_FILE_PATH} schemaVersion: ${String((parsed as { schemaVersion?: unknown }).schemaVersion)}`);
    process.exit(1);
  }
  return parsed;
}

function diffMissing(expected: string[], actual: string[]): string[] {
  const actualSet = new Set(actual);
  return expected.filter((item) => !actualSet.has(item));
}

function verifyAgainstBaseline(current: LockedUiSurface, baseline: LockedUiSurface): string[] {
  const failures: string[] = [];

  const missingRoutes = diffMissing(baseline.routes, current.routes);
  if (missingRoutes.length > 0) {
    failures.push(`routes missing from code (${missingRoutes.length}): ${missingRoutes.join(", ")}`);
  }

  const missingSidebarIds = diffMissing(baseline.sidebarItemIds, current.sidebarItemIds);
  if (missingSidebarIds.length > 0) {
    failures.push(`sidebar ids missing from code (${missingSidebarIds.length}): ${missingSidebarIds.join(", ")}`);
  }

  const baselineModules = Object.keys(baseline.subNavTabs).sort();
  for (const moduleName of baselineModules) {
    const expectedTabs = baseline.subNavTabs[moduleName] ?? [];
    const actualTabs = current.subNavTabs[moduleName] ?? [];
    const missingTabs = diffMissing(expectedTabs, actualTabs);
    if (missingTabs.length > 0) {
      failures.push(`sub-nav tabs missing for '${moduleName}' (${missingTabs.length}): ${missingTabs.join(", ")}`);
    }
  }

  const baselineSectionModules = Object.keys(baseline.namedSections).sort();
  for (const moduleName of baselineSectionModules) {
    const expectedSections = baseline.namedSections[moduleName] ?? [];
    const actualSections = current.namedSections[moduleName] ?? [];
    const missingSections = diffMissing(expectedSections, actualSections);
    if (missingSections.length > 0) {
      failures.push(`named sections missing for '${moduleName}' (${missingSections.length}): ${missingSections.join(", ")}`);
    }
  }

  return failures;
}

function writeBaseline(surface: LockedUiSurface) {
  fs.writeFileSync(LOCK_FILE_PATH, `${JSON.stringify(surface, null, 2)}\n`, "utf8");
}

function main() {
  const args = new Set(process.argv.slice(2));
  const writeMode = args.has("--write-baseline");
  const current = buildCurrentSurface();

  if (writeMode) {
    writeBaseline(current);
    console.log(`✅ Wrote locked UI baseline: ${LOCK_FILE_PATH}`);
    console.log(`   Routes: ${current.routes.length}`);
    console.log(`   Sidebar ids: ${current.sidebarItemIds.length}`);
    console.log(`   Sub-nav modules: ${Object.keys(current.subNavTabs).length}`);
    console.log(`   Named section modules: ${Object.keys(current.namedSections).length}`);
    return;
  }

  const baseline = readBaseline();
  const failures = verifyAgainstBaseline(current, baseline);

  if (failures.length > 0) {
    console.error("\n--- FAILURES (build blocked) ---");
    for (const failure of failures) {
      console.error(`✘ ${failure}`);
    }
    console.error("\nFix: restore removed UI surface OR update docs/locked-ui-surface.json in the same PR to make intentional removals explicit.");
    process.exit(1);
  }

  for (const guardPath of EXTRA_GUARDS) {
    execSync(`node ${guardPath}`, { stdio: "inherit" });
  }

  console.log("✅ Locked UI surface check passed");
  console.log(`   Routes checked: ${baseline.routes.length}`);
  console.log(`   Sidebar ids checked: ${baseline.sidebarItemIds.length}`);
  console.log(`   Sub-nav modules checked: ${Object.keys(baseline.subNavTabs).length}`);
  console.log(`   Named section modules checked: ${Object.keys(baseline.namedSections).length}`);
}

main();
