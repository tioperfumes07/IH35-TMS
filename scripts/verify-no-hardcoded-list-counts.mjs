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
