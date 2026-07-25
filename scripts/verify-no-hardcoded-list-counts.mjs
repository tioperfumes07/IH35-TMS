#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const hubHeaderFiles = [
  "apps/frontend/src/pages/lists/ListsHubPage.tsx",
  "apps/frontend/src/pages/lists/components/DomainRibbon.tsx",
  "apps/frontend/src/pages/lists/components/DomainTab.tsx",
  "apps/frontend/src/pages/lists/components/DomainModuleTab.tsx",
];

const failures = [];

// S2 (docs/trackers/GUARD-SHAPE-VS-SUBSTANCE-REGISTER.md): this guard scanned ONLY the 4 frontend
// hub files above, while the live hardcode sat in the BACKEND count source —
// ACCOUNTING_JOURNAL_ENTRY_TYPES_COUNT = 3 was added to the accounting total while
// catalogs.journal_entry_types held 16 rows. The guard named for this defect class could not see it.
// The count SOURCE is now in scope: a literal added to a module count, or a `count += <number>`,
// is the defect regardless of which layer it lives in.
const COUNT_SOURCE_FILES = [
  "apps/backend/src/lists/lists-module-count-spec.ts",
  "apps/backend/src/lists/lists-counts.routes.ts",
];

for (const rel of COUNT_SOURCE_FILES) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`${rel}: missing count-source file`);
    continue;
  }
  const source = fs.readFileSync(abs, "utf8");
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

  // `count += 3` / `total = total + 7` — a literal added to a live count.
  for (const hit of stripped.match(/\b(count|total)\s*\+=\s*\d+/g) ?? []) {
    failures.push(`${rel}: literal added to a live count: ${hit.trim()}`);
  }
  // An exported *_COUNT constant bound to a number literal — the exact shape that shipped.
  for (const hit of stripped.match(/export\s+const\s+\w*COUNT\w*\s*=\s*\d+/g) ?? []) {
    failures.push(`${rel}: hardcoded count constant ${hit.trim()} — count the real table instead`);
  }
}

for (const rel of hubHeaderFiles) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    failures.push(`${rel}: missing hub header file`);
    continue;
  }
  const source = fs.readFileSync(abs, "utf8");

  if (/const\s+count\s*=\s*rows\.length/.test(source)) {
    failures.push(`${rel}: hub header count must not use rows.length (catalog cardinality)`);
  }

  const literalCountProps = source.match(/count=\{\s*\d+\s*\}/g) ?? [];
  for (const hit of literalCountProps) {
    failures.push(`${rel}: hardcoded count prop ${hit.trim()}`);
  }

  const literalBadgeNumbers = source.match(/>\s*\{\s*\d+\s*\}\s*<\//g) ?? [];
  for (const hit of literalBadgeNumbers) {
    failures.push(`${rel}: hardcoded badge literal ${hit.trim()}`);
  }
}

if (failures.length > 0) {
  console.error("verify:no-hardcoded-list-counts FAIL");
  for (const line of failures) {
    console.error(`  ${line}`);
  }
  process.exit(1);
}

console.log("verify:no-hardcoded-list-counts PASS");
