#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COUNT_SPEC = path.join(ROOT, "apps/backend/src/lists/lists-module-count-spec.ts");

const EXPECTED_TABLE_COUNTS = {
  fleet: 10,
  fuel: 12,
  maintenance: 9,
  accounting: 12,
};

const ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT = 3;
const EXPECTED_ACCOUNTING_HEADER = EXPECTED_TABLE_COUNTS.accounting + ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT;

const HOOK_CONSUMERS = [
  "apps/frontend/src/components/layout/SubNavCounts.tsx",
  "apps/frontend/src/components/layout/ModuleHeader.tsx",
  "apps/frontend/src/pages/lists/components/DomainModuleTab.tsx",
];

function fail(message) {
  console.error(`verify:header-counts-match-actual FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const specSource = read("apps/backend/src/lists/lists-module-count-spec.ts");

function countTablesInSpec(domain) {
  const blockPattern = new RegExp(`${domain}:\\s*\\[([\\s\\S]*?)\\],`, "m");
  const block = specSource.match(blockPattern)?.[1] ?? "";
  const matches = block.match(/table:\s*["'][^"']+["']/g) ?? [];
  return matches.length;
}

for (const [domain, expected] of Object.entries(EXPECTED_TABLE_COUNTS)) {
  const actual = countTablesInSpec(domain);
  if (actual !== expected) {
    fail(`${domain} module count spec has ${actual} tables, expected ${expected}`);
  }
}

const journalConstant = specSource.match(/ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT\s*=\s*(\d+)/);
const journalCount = Number(journalConstant?.[1] ?? 0);
if (journalCount !== ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT) {
  fail(`ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT expected ${ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT}, found ${journalCount}`);
}

const accountingHeader = EXPECTED_TABLE_COUNTS.accounting + journalCount;
if (accountingHeader !== EXPECTED_ACCOUNTING_HEADER) {
  fail(`accounting header total expected ${EXPECTED_ACCOUNTING_HEADER}, computed ${accountingHeader}`);
}

for (const rel of HOOK_CONSUMERS) {
  const source = read(rel);
  if (rel.endsWith("ModuleHeader.tsx")) {
    if (!source.includes("SubNavCounts")) {
      fail("ModuleHeader.tsx must compose SubNavCounts for optional module counts");
    }
    continue;
  }
  if (!source.includes("useModuleCount")) {
    fail(`${rel} must use useModuleCount for live header counts`);
  }
}

console.log(
  `verify:header-counts-match-actual PASS (fleet=${EXPECTED_TABLE_COUNTS.fleet}, fuel=${EXPECTED_TABLE_COUNTS.fuel}, maintenance=${EXPECTED_TABLE_COUNTS.maintenance}, accounting=${EXPECTED_ACCOUNTING_HEADER})`
);
