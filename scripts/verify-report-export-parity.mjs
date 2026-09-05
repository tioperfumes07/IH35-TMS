#!/usr/bin/env node
/**
 * verify-report-export-parity.mjs
 *
 * Scans all .tsx files under apps/frontend/src/pages/reports/** and verifies
 * that every data-bearing report page has:
 *   1. CSV export — `exportFilename` on ParityTable, an explicit CSV export
 *      button, a download/export action (useExportAction, downloadCSV,
 *      exportCsv, .download=, export*Report), or delegation to a shared
 *      report component that itself has export.
 *   2. Print — a Print button (onClick contains window.print), a @media print
 *      style block, printLetterHtml / openPrintableDocument, or delegation to
 *      a shared report component that itself has print.
 *
 * Hub / nav / banner / modal / category / IFTA-step pages are excluded.
 *
 * Exit 0 if all data-bearing report pages have both export + print.
 * Exit 1 otherwise, listing which pages are missing export or print.
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname, resolve } from "node:path";

const REPORTS_DIR = new URL("../apps/frontend/src/pages/reports", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");

// ── Exclusion list: hub / nav / banner / modal / category / IFTA-step / filter / table ──
const EXCLUDE_FILES = new Set([
  // banners
  "ReportBlockTPendingBanner.tsx",
  "ReportBlockVPendingBanner.tsx",
  "ScheduledReportsBackendPendingBanner.tsx",
  // hubs / nav
  "ReportsHome.tsx",
  "ReportsHub.tsx",
  "ReportsSubNav.tsx",
  // modals
  "ScheduleReportModal.tsx",
  // panels
  "ScheduledReportsPanel.tsx",
  // subscription manager
  "SubscriptionManager.tsx",
  // runner filters / table (shared components, not report pages)
  "RunnerFilters.tsx",
  "RunnerTable.tsx",
  // custom report builder
  "CustomReportBuilder.tsx",
  // IFTA steps
  "IFTAPreparer.tsx",
  "IFTAStepGallons.tsx",
  "IFTAStepMiles.tsx",
  "IFTAStepTax.tsx",
]);

// IFTA sub-directory is entirely excluded (sub-steps)
const EXCLUDE_DIRS = new Set(["categories", "ifta", "tax-regulatory"]);

// ── Helpers ──

function walkDir(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry)) continue;
      results.push(...walkDir(full));
    } else if (entry.endsWith(".tsx")) {
      if (EXCLUDE_FILES.has(entry)) continue;
      results.push(full);
    }
  }
  return results;
}

/**
 * Determine whether a file is a data-bearing report page.
 * Must export a React component and have a return with JSX.
 */
function isDataBearingReportPage(content) {
  if (!/export\s+(function|default\s+function|const)\s+\w+/i.test(content)) return false;
  if (!/return\s*\(/i.test(content) && !/return\s*<\w/i.test(content)) return false;
  return true;
}

/**
 * Check if the file has CSV export capability.
 */
function hasCsvExport(content) {
  if (/exportFilename\s*=/.test(content)) return true;
  if (/useExportAction/.test(content)) return true;
  if (/exportAction\s*\./.test(content)) return true;
  if (/downloadCsv\s*\(/i.test(content)) return true;
  if (/downloadCSV\s*\(/i.test(content)) return true;
  if (/exportCsv\s*\(/i.test(content)) return true;
  if (/\.download\s*=/.test(content)) return true;
  if (/Export\s*(CSV|PDF|XLSX|JSON)/i.test(content)) return true;
  if (/export\w*Report\s*\(/i.test(content)) return true;
  return false;
}

/**
 * Check if the file has Print capability.
 */
function hasPrint(content) {
  if (/window\.print\s*\(\s*\)/.test(content)) return true;
  if (/@media\s+print/i.test(content)) return content.includes("@media print");
  if (/printLetterHtml/.test(content)) return true;
  if (/openPrintableDocument/.test(content)) return true;
  if (/>Print</i.test(content)) return true;
  return false;
}

/**
 * For thin wrapper pages that delegate to a shared component (e.g. Audit*Page
 * → AuditReportPage), resolve the local import and check if the shared
 * component file has export + print.
 * Returns { exportOk, printOk } from the delegated component, or null.
 */
function checkDelegation(content, file) {
  // Find local relative imports (./ or ../) of components
  const importRegex = /import\s+\{([^}]+)\}\s+from\s+["'](\.\.?\/[^"']+)["']/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importedNames = match[1].split(",").map((s) => s.trim());
    const importPath = match[2];
    // Resolve relative to the current file's directory
    const resolvedDir = dirname(file);
    // Try .tsx and .ts extensions
    for (const ext of [".tsx", ".ts"]) {
      const candidate = resolve(resolvedDir, importPath + ext);
      if (existsSync(candidate)) {
        const delegatedContent = readFileSync(candidate, "utf-8");
        // Only delegate if the imported component is actually used in the file
        const isUsed = importedNames.some((name) => {
          const cleanName = name.replace(/type\s+/, "").trim();
          return cleanName && content.includes(`<${cleanName}`);
        });
        if (isUsed) {
          return {
            exportOk: hasCsvExport(delegatedContent),
            printOk: hasPrint(delegatedContent),
          };
        }
      }
    }
  }
  return null;
}

// ── Main ──

const files = walkDir(REPORTS_DIR);
const missing = [];

for (const file of files) {
  const content = readFileSync(file, "utf-8");
  if (!isDataBearingReportPage(content)) continue;

  let exportOk = hasCsvExport(content);
  let printOk = hasPrint(content);

  // If either is missing, check if this page delegates to a shared component
  if (!exportOk || !printOk) {
    const delegated = checkDelegation(content, file);
    if (delegated) {
      if (!exportOk) exportOk = delegated.exportOk;
      if (!printOk) printOk = delegated.printOk;
    }
  }

  if (!exportOk || !printOk) {
    const rel = relative(REPORTS_DIR, file);
    missing.push({
      file: rel,
      missingExport: !exportOk,
      missingPrint: !printOk,
    });
  }
}

if (missing.length === 0) {
  console.log("✅ verify-report-export-parity: all data-bearing report pages have CSV export + Print.");
  process.exit(0);
} else {
  console.error("❌ verify-report-export-parity: some data-bearing report pages are missing export or print:\n");
  for (const m of missing) {
    const parts = [];
    if (m.missingExport) parts.push("CSV export");
    if (m.missingPrint) parts.push("Print");
    console.error(`  ${m.file} — missing: ${parts.join(", ")}`);
  }
  console.error("");
  process.exit(1);
}
