#!/usr/bin/env node
/**
 * CI guard: accounting nav unification
 *
 * Checks:
 * 1. AccountingSubNavWrapper.tsx exists
 * 2. ACCOUNTING_CLEAN_TABS defined in manifest (single source of truth)
 * 3. No duplicate ACCOUNTING_CLEAN_TABS definitions outside manifest
 * 4. No legacy AccountingSubNav imports in page components
 * 5. No dev-placeholder strings in accounting pages
 * 6. No pure ComingSoon shell pages in accounting directory
 * 7. QboAccountingSubNav.tsx deleted (was defined, never rendered)
 * 8. ExpenseCreatePage uses AccountingSubNavWrapper (was bare, no nav)
 * 9. ROUND 443.267 — Unexpected page + /accounting/unexpected top-row after More
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
// Scope to pages this nav PR owns — exclude UI-1-owned stubs (IntegrationTransactions,
// PrepaidExpenses, Receipts) which are wired in a separate PR off main.
const UI1_OWNED = ["IntegrationTransactionsPage", "PrepaidExpensesPage", "ReceiptsPage"];
for (const file of accountingTsxFiles) {
  if (UI1_OWNED.some((name) => file.endsWith(`${name}.tsx`))) continue;
  const content = readFileSync(file, "utf8");
  if (/return\s*<ComingSoonPage\s*\/>/.test(content)) {
    const rel = relative(ROOT, file);
    fail(`Pure ComingSoon shell page found: ${rel} — wire to real content or remove from nav`);
  }
}
pass("No pure ComingSoon shell pages in accounting directory");

// ─── Check 7: QboAccountingSubNav.tsx must not exist ────────────────────────
const qboNavPath = join(ACCOUNTING_DIR, "QboAccountingSubNav.tsx");
try {
  readFileSync(qboNavPath, "utf8");
  fail("QboAccountingSubNav.tsx still exists — delete it (was defined, never rendered)");
} catch {
  pass("QboAccountingSubNav.tsx deleted");
}

// ─── Check 8: ExpenseCreatePage uses AccountingSubNavWrapper ─────────────────
const expensePath = join(ACCOUNTING_DIR, "ExpenseCreatePage.tsx");
try {
  const expenseContent = readFileSync(expensePath, "utf8");
  if (expenseContent.includes("AccountingSubNavWrapper")) {
    pass("ExpenseCreatePage uses AccountingSubNavWrapper");
  } else {
    fail("ExpenseCreatePage does not use AccountingSubNavWrapper — bare page has no accounting nav");
  }
} catch {
  fail("ExpenseCreatePage.tsx not found");
}

// ─── Check 9: ROUND 443.267 / 443.280 — Unexpected board after More ──────────
// Board: docs/design/v3/Accounting-Unexpected — UNEXPECTED after MORE.
{
  const unexpectedPage = join(ACCOUNTING_DIR, "UnexpectedExpensesPage.tsx");
  let unexpectedSrc = "";
  try {
    unexpectedSrc = readFileSync(unexpectedPage, "utf8");
    pass("UnexpectedExpensesPage.tsx exists");
  } catch {
    fail("UnexpectedExpensesPage.tsx missing — board Accounting-Unexpected requires the page");
  }

  // 443.280 — board grammar: BoardSection (not layered V3Panel), KPI labels, duplicate sub hyphen.
  if (unexpectedSrc) {
    if (!/<BoardSection\b/.test(unexpectedSrc)) {
      fail("Unexpected must wrap Candidates/By kind in <BoardSection> (443.280 board grammar)");
    } else {
      pass("Unexpected uses BoardSection");
    }
    if (/<V3Panel\b/.test(unexpectedSrc)) {
      fail("Unexpected still mounts layered <V3Panel> — 443.280 rebuild-not-layer forbids it");
    } else {
      pass("Unexpected has no V3Panel");
    }
    if (!/<V3KpiTile\b/.test(unexpectedSrc)) {
      fail("Unexpected missing V3KpiTile KPI strip");
    } else {
      pass("Unexpected mounts V3KpiTile");
    }
    for (const label of ['"Possible duplicates"', '"Linked to a truck"', '"Tows · fines"']) {
      if (!unexpectedSrc.includes(label)) fail(`Unexpected KPI label ${label} missing`);
    }
    if (!unexpectedSrc.includes('join(" - ")') && !unexpectedSrc.includes("join(' - ')")) {
      fail('Unexpected duplicate KPI sub must join amounts with " - " (board grammar)');
    } else {
      pass("Unexpected duplicate KPI sub uses board hyphen");
    }
    if (!unexpectedSrc.includes("Candidates from the bank") || !unexpectedSrc.includes("By kind")) {
      fail("Unexpected missing Candidates / By kind board panels");
    } else {
      pass("Unexpected Candidates + By kind panels present");
    }
  }

  if (!manifestContent.includes('path: "/accounting/unexpected"')) {
    fail('subnav-manifest missing path "/accounting/unexpected"');
  } else {
    pass('subnav-manifest registers /accounting/unexpected');
  }

  // Top-row order: … More, then Unexpected leaf (leafOf("/accounting/unexpected") after more).
  const moreIdx = manifestContent.lastIndexOf("GROUP_LABELS.more");
  const unexpectedLeafIdx = manifestContent.indexOf('leafOf("/accounting/unexpected")');
  if (moreIdx < 0 || unexpectedLeafIdx < 0 || unexpectedLeafIdx < moreIdx) {
    fail("Unexpected must be a top-row leaf after More in ACCOUNTING_SUB_NAV_ITEMS");
  } else {
    pass("Unexpected is top-row leaf after More");
  }

  const routesManifest = join(ROOT, "routes/manifest.tsx");
  try {
    const routes = readFileSync(routesManifest, "utf8");
    if (!routes.includes('path="/accounting/unexpected"')) {
      fail('routes/manifest.tsx missing Route path="/accounting/unexpected"');
    } else if (!routes.includes("UnexpectedExpensesPage")) {
      fail("routes/manifest.tsx missing UnexpectedExpensesPage lazy import");
    } else {
      pass("routes/manifest mounts /accounting/unexpected");
    }
  } catch {
    fail("routes/manifest.tsx not readable");
  }
}

// ─── Summary ─────────────────────────────────────────────────────────────────
if (failed) {
  console.error("\nAccounting nav guard FAILED — see errors above.");
  process.exit(1);
} else {
  console.log("\nAccounting nav guard PASSED.");
  process.exit(0);
}
