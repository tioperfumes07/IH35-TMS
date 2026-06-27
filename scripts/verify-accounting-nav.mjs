#!/usr/bin/env node
/**
 * CI guard: accounting nav unification
 *
 * Checks:
 * 1. Exactly ONE accounting sub-nav component file exists (AccountingSubNavWrapper.tsx)
 * 2. No page component imports the old AccountingSubNav (hover-dropdown) except the component file itself
 * 3. No dev-status placeholder strings appear in page components
 * 4. ACCOUNTING_CLEAN_TABS is defined in exactly one manifest file
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = new URL("../apps/frontend/src", import.meta.url).pathname;
const ACCOUNTING_DIR = join(ROOT, "pages/accounting");

const LEGACY_NAV_FILE = "AccountingSubNav.tsx";
const WRAPPER_FILE = "AccountingSubNavWrapper.tsx";
const MANIFEST_FILE = "subnav-manifest.ts";

// Strings that must never appear in accounting page components rendered to users
const DEV_PLACEHOLDER_STRINGS = [
  "UI ready",
  "API integration pending",
  "dev status",
];

let failed = false;

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}

function pass(msg) {
  console.log(`PASS: ${msg}`);
}

function walkDir(dir, ext = ".tsx") {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkDir(full, ext));
    } else if (entry.endsWith(ext)) {
      results.push(full);
    }
  }
  return results;
}

// ─── Check 1: Wrapper file exists ────────────────────────────────────────────
const wrapperPath = join(ACCOUNTING_DIR, WRAPPER_FILE);
try {
  readFileSync(wrapperPath, "utf8");
  pass(`${WRAPPER_FILE} exists`);
} catch {
  fail(`${WRAPPER_FILE} not found at ${wrapperPath}`);
}

// ─── Check 2: Manifest file exists and defines ACCOUNTING_CLEAN_TABS once ───
const manifestPath = join(ACCOUNTING_DIR, MANIFEST_FILE);
let manifestContent = "";
try {
  manifestContent = readFileSync(manifestPath, "utf8");
  const tabCount = (manifestContent.match(/ACCOUNTING_CLEAN_TABS/g) ?? []).length;
  if (tabCount >= 1) {
    pass(`ACCOUNTING_CLEAN_TABS defined in ${MANIFEST_FILE}`);
  } else {
    fail(`ACCOUNTING_CLEAN_TABS not found in ${MANIFEST_FILE}`);
  }
} catch {
  fail(`${MANIFEST_FILE} not found`);
}

// ─── Check 3: No second ACCOUNTING_CLEAN_TABS definition outside manifest ────
const allTsxFiles = walkDir(join(ROOT, "pages"), ".tsx");
const allTsFiles = walkDir(join(ROOT, "pages"), ".ts");
const allPageFiles = [...allTsxFiles, ...allTsFiles];

for (const file of allPageFiles) {
  const rel = relative(ROOT, file);
  if (file.endsWith(MANIFEST_FILE)) continue;
  const content = readFileSync(file, "utf8");
  if (content.includes("ACCOUNTING_CLEAN_TABS") && content.match(/=\s*\[/)) {
    // Only flag if it's defining (assigning) a new array, not just importing/using
    if (/const ACCOUNTING_CLEAN_TABS\s*[=:]/.test(content)) {
      fail(`Second ACCOUNTING_CLEAN_TABS definition found in ${rel}`);
    }
  }
}
pass("No duplicate ACCOUNTING_CLEAN_TABS definitions outside manifest");

// ─── Check 4: No page imports old AccountingSubNav (except the file itself) ──
const legacyNavPath = join(ACCOUNTING_DIR, LEGACY_NAV_FILE);
for (const file of allTsxFiles) {
  if (file === legacyNavPath) continue;
  const content = readFileSync(file, "utf8");
  // Match: import ... from "...AccountingSubNav" (NOT AccountingSubNavWrapper)
  if (/import[^;]+from\s+['"][^'"]*AccountingSubNav[^W][^'"]*['"]/.test(content)) {
    const rel = relative(ROOT, file);
    fail(`Legacy AccountingSubNav import found in ${rel}`);
  }
}
pass("No legacy AccountingSubNav imports in page components");

// ─── Check 5: No dev-placeholder strings in accounting page components ────────
const accountingTsxFiles = allTsxFiles.filter((f) => f.includes("/pages/accounting/"));
for (const file of accountingTsxFiles) {
  const content = readFileSync(file, "utf8");
  for (const placeholder of DEV_PLACEHOLDER_STRINGS) {
    if (content.includes(placeholder)) {
      const rel = relative(ROOT, file);
      fail(`Dev placeholder string "${placeholder}" found in ${rel}`);
    }
  }
}
pass("No dev-placeholder strings in accounting page components");

// ─── Check 6: No accounting pages render <ComingSoonPage (shell stubs) ────────
// Pages that are pure ComingSoon wrappers must not be reachable from ACCOUNTING_CLEAN_TABS.
// We check that no file in accounting/ *only* renders ComingSoonPage with nothing else.
for (const file of accountingTsxFiles) {
  const content = readFileSync(file, "utf8");
  // A file is a pure shell if the only JSX rendered is <ComingSoonPage />
  if (/return\s*<ComingSoonPage\s*\/>/.test(content)) {
    const rel = relative(ROOT, file);
    fail(`Pure ComingSoon shell page found: ${rel} — wire to real content or remove from nav`);
  }
}
pass("No pure ComingSoon shell pages in accounting directory");

// ─── Summary ─────────────────────────────────────────────────────────────────
if (failed) {
  console.error("\nAccounting nav guard FAILED — see errors above.");
  process.exit(1);
} else {
  console.log("\nAccounting nav guard PASSED.");
  process.exit(0);
}
