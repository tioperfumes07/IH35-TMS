#!/usr/bin/env node
/**
 * Guard 6.2 — Cash Flow MODULE (top-level /cash-flow), not accounting report routes.
 * PENDING gate: passes until the Cash Flow block adds path="/cash-flow" to manifest.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const manifestPath = path.join(ROOT, "apps/frontend/src/routes/manifest.tsx");
const sidebarPath = path.join(
  ROOT,
  "apps/frontend/src/components/layout/sidebar-config.ts"
);
const cashFlowPagesDir = path.join(ROOT, "apps/frontend/src/pages/cash-flow");

const REPORT_IMPORT_PATTERNS = [
  /\/reports\/cash-flow-statement/,
  /\/reports\/cash-flow-overview/,
  /CashFlowStatementPage/,
  /CashFlowOverviewPage/,
];

function readUtf8(relativePath) {
  const abs = path.join(ROOT, relativePath);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

function parseSidebarIds(src) {
  const arrayMatch = src.match(
    /export\s+const\s+SIDEBAR_ITEM_IDS\s*=\s*\[([\s\S]*?)\]\s*as\s+const/
  );
  if (!arrayMatch) return null;
  return arrayMatch[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^"([^"]+)"/);
      return m ? m[1] : null;
    })
    .filter(Boolean);
}

const manifest = readUtf8("apps/frontend/src/routes/manifest.tsx");
if (!manifest) {
  console.error("verify-cashflow-module FAIL: manifest.tsx not found");
  process.exit(1);
}

const hasTopLevelRoute = /path="\/cash-flow"/.test(manifest);

if (!hasTopLevelRoute) {
  console.log("verify-cashflow-module: cash-flow module pending (no path=\"/cash-flow\" in manifest yet)");
  process.exit(0);
}

const errors = [];

if (/path="\/reports\/cash-flow/.test(manifest) && !hasTopLevelRoute) {
  errors.push("manifest must expose top-level /cash-flow, not only /reports/cash-flow-*");
}

const sidebar = readUtf8("apps/frontend/src/components/layout/sidebar-config.ts");
if (!sidebar) {
  errors.push("sidebar-config.ts not found");
} else {
  const ids = parseSidebarIds(sidebar);
  if (!ids) {
    errors.push("could not parse SIDEBAR_ITEM_IDS");
  } else {
    if (!ids.includes("cash-flow")) {
      errors.push('SIDEBAR_ITEM_IDS must include "cash-flow"');
    }
    const eldIdx = ids.indexOf("eld");
    const cashFlowIdx = ids.indexOf("cash-flow");
    const accountingIdx = ids.indexOf("accounting");
    if (eldIdx === -1 || cashFlowIdx === -1 || accountingIdx === -1) {
      errors.push("sidebar must contain eld, cash-flow, and accounting");
    } else if (cashFlowIdx !== eldIdx + 1 || accountingIdx !== cashFlowIdx + 1) {
      errors.push(
        `cash-flow must sit between eld and accounting; found eld@${eldIdx}, cash-flow@${cashFlowIdx}, accounting@${accountingIdx}`
      );
    }
    if (!sidebar.includes('to: "/cash-flow"')) {
      errors.push('SIDEBAR_ITEM_META must route cash-flow to "/cash-flow"');
    }
  }
}

if (fs.existsSync(cashFlowPagesDir)) {
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(tsx|ts)$/.test(entry.name)) {
        const content = fs.readFileSync(full, "utf8");
        for (const pattern of REPORT_IMPORT_PATTERNS) {
          if (pattern.test(content)) {
            errors.push(
              `${path.relative(ROOT, full)}: must not import report cash-flow routes (${pattern})`
            );
          }
        }
      }
    }
  };
  walk(cashFlowPagesDir);
}

if (errors.length > 0) {
  console.error("verify-cashflow-module FAIL:");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}

console.log("verify-cashflow-module OK — /cash-flow module route, sidebar position, no report imports");
