#!/usr/bin/env node
/**
 * PASS-7 orchestrator — runs all 17 AUDIT-FIX verification scripts sequentially
 * and writes docs/audits/PASS-7-RESULTS-2026-06-05.md
 */
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const resultsPath = path.join(repoRoot, "docs/audits/PASS-7-RESULTS-2026-06-05.md");

const FIXES = [
  { id: 1, script: "scripts/verify-audit-fix-1-bulk-select-works.mjs", title: "Bulk select on list pages" },
  { id: 2, script: "scripts/verify-audit-fix-2-column-resize-persists.mjs", title: "Banking column resize persists" },
  { id: 3, script: "scripts/verify-audit-fix-3-list-view-toggle-renders.mjs", title: "Customers/vendors list view toggle" },
  { id: 4, script: "scripts/verify-audit-fix-4-no-overflow-1024.mjs", title: "No horizontal overflow at 1024px" },
  { id: 5, script: "scripts/verify-audit-fix-5-no-nested-boxes.mjs", title: "No nested card boxes on detail pages" },
  { id: 6, script: "scripts/verify-audit-fix-6-routes-do-not-redirect.mjs", title: "Routes do not silently redirect" },
  { id: 7, script: "scripts/verify-audit-fix-7-blank-pages-have-content.mjs", title: "425c/help/docs have content" },
  { id: 8, script: "scripts/verify-audit-fix-8-wo-and-bill-category-fetch.mjs", title: "WO/Bill category fetch wired" },
  { id: 9, script: "scripts/verify-audit-fix-9-endpoints-no-500-on-load.mjs", title: "Page-load endpoints no 500" },
  { id: 10, script: "scripts/verify-audit-fix-10-mobile-status-bar-collapsed.mjs", title: "Mobile status bar collapsed" },
  { id: 11, script: "scripts/verify-audit-fix-11-qbo-sync-status-loads.mjs", title: "QBO sync status loads" },
  { id: 12, script: "scripts/verify-audit-fix-12-bills-has-subnav-and-create.mjs", title: "Bills subnav + create controls" },
  { id: 13, script: "scripts/verify-audit-fix-13-customers-pagination-works.mjs", title: "Customers pagination + card links" },
  { id: 14, script: "scripts/verify-audit-fix-14-subtabs-deep-linkable.mjs", title: "Subtabs deep-linkable" },
  { id: 15, script: "scripts/verify-audit-fix-15-status-bar-icons-at-1366.mjs", title: "Status bar icon-only at 1366" },
  { id: 16, script: "scripts/verify-audit-fix-16-invoice-create-stays-in-accounting.mjs", title: "Invoice create stays in accounting" },
  { id: 17, script: "scripts/verify-audit-fix-17-factoring-power-user-ux.mjs", title: "Factoring power-user UX" },
];

function runFix(fix) {
  const abs = path.join(repoRoot, fix.script);
  const started = Date.now();
  const result = spawnSync("node", [abs], { cwd: repoRoot, encoding: "utf8", env: process.env });
  const ms = Date.now() - started;
  return {
    ...fix,
    pass: result.status === 0,
    ms,
    stderr: (result.stderr || "").trim().slice(0, 500),
    stdout: (result.stdout || "").trim().slice(0, 200),
  };
}

function writeResults(rows) {
  fs.mkdirSync(path.dirname(resultsPath), { recursive: true });
  const passCount = rows.filter((r) => r.pass).length;
  const failCount = rows.length - passCount;
  const lines = [
    "# PASS-7 Smoke Verification Results",
    "",
    `**Date:** 2026-06-05`,
    `**Base SHA:** ${execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim()}`,
    `**Summary:** ${passCount}/${rows.length} PASS · ${failCount} FAIL`,
    "",
    "| # | AUDIT-FIX | Title | Result | Duration |",
    "|---|-----------|-------|--------|----------|",
  ];
  for (const row of rows) {
    lines.push(`| ${row.id} | AUDIT-FIX-${row.id} | ${row.title} | ${row.pass ? "PASS" : "FAIL"} | ${row.ms}ms |`);
    if (!row.pass && row.stderr) {
      lines.push("");
      lines.push(`### AUDIT-FIX-${row.id} failure excerpt`);
      lines.push("```");
      lines.push(row.stderr);
      lines.push("```");
    }
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("- CI guards delegate to existing `verify:*` scripts (static + optional runtime when env vars set).");
  lines.push("- Browser breakpoint smoke (1440/1024/375) runs when `FRONTEND_BASE_URL` + session cookie are configured.");
  lines.push("- Any FAIL here should spawn AUDIT-FIX-18+ blocks — do not patch production from this verify-only block.");
  fs.writeFileSync(resultsPath, `${lines.join("\n")}\n`);
}

const rows = [];
for (const fix of FIXES) {
  console.log(`\n=== PASS-7 AUDIT-FIX-${fix.id}: ${fix.title} ===`);
  const row = runFix(fix);
  rows.push(row);
  console.log(row.pass ? `PASS (${row.ms}ms)` : `FAIL (${row.ms}ms)`);
}

writeResults(rows);

const failed = rows.filter((r) => !r.pass);
if (failed.length > 0) {
  console.error(`\nPASS-7 FAIL: ${failed.length} audit-fix verification(s) failed`);
  process.exit(1);
}

console.log(`\nPASS-7 PASS: all ${rows.length} audit-fix verifications OK`);
console.log(`Results written to ${resultsPath}`);
