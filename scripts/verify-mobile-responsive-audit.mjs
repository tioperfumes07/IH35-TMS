#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareAgainstBaseline, runAudit } from "../apps/frontend/src/audit/mobile-responsive/auditor.script.mjs";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

read("apps/frontend/src/audit/mobile-responsive/auditor.script.mjs");
read("apps/frontend/src/audit/mobile-responsive/baseline.json");

const table = read("apps/frontend/src/components/shared/MobileOptimizedTable.tsx");
contains("apps/frontend/src/components/shared/MobileOptimizedTable.tsx", table, [
  { pattern: /MobileOptimizedTable/, label: "table component export" },
  { pattern: /sm:hidden/, label: "mobile card fallback" },
]);

const swipe = read("apps/frontend/src/components/shared/SwipeActionRow.tsx");
contains("apps/frontend/src/components/shared/SwipeActionRow.tsx", swipe, [
  { pattern: /onTouchStart/, label: "swipe gesture handlers" },
]);

const touchBtn = read("apps/driver-pwa/src/components/shared/TouchOptimizedButton.tsx");
contains("apps/driver-pwa/src/components/shared/TouchOptimizedButton.tsx", touchBtn, [
  { pattern: /min-h-14/, label: "56px glove-friendly button" },
]);

const reportPage = read("apps/frontend/src/pages/admin/mobile-audit/MobileAuditReport.tsx");
contains("apps/frontend/src/pages/admin/mobile-audit/MobileAuditReport.tsx", reportPage, [
  { pattern: /mobile-audit-report/, label: "audit report test id" },
  { pattern: /MobileOptimizedTable/, label: "audit table wired" },
]);

const manifest = read("apps/frontend/src/routes/manifest.tsx");
contains("apps/frontend/src/routes/manifest.tsx", manifest, [
  { pattern: /\/admin\/mobile-audit/, label: "mobile audit route" },
  { pattern: /MobileAuditReport/, label: "audit page import" },
]);

const docs = read("docs/specs/gap-91-mobile-responsive-audit.md");
contains("docs/specs/gap-91-mobile-responsive-audit.md", docs, [
  { pattern: /GAP-91/, label: "GAP-91 identifier" },
  { pattern: /375/, label: "viewport documented" },
]);

const blockReady = read(".block-ready.json");
contains(".block-ready.json", blockReady, [
  { pattern: /GAP-91-MOBILE-RESPONSIVE-AUDIT/, label: "GAP-91 block id" },
]);

const report = runAudit();
const baselinePath = path.join(ROOT, "apps/frontend/src/audit/mobile-responsive/baseline.json");
const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const { newIssues } = compareAgainstBaseline(report, baseline);

fs.writeFileSync(
  path.join(ROOT, "apps/frontend/src/audit/mobile-responsive/latest-report.json"),
  `${JSON.stringify(report, null, 2)}\n`
);

if (newIssues.length > 0) {
  fail(`regression detector: ${newIssues.length} new issue(s) vs baseline`);
  for (const issue of newIssues.slice(0, 10)) {
    fail(`  NEW ${issue.file}: ${issue.message}`);
  }
}

if (failures.length > 0) {
  console.error("verify:mobile-responsive-audit — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log(`verify:mobile-responsive-audit — OK (issues=${report.issue_count}, new_vs_baseline=0)`);
