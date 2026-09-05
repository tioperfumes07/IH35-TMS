#!/usr/bin/env node
/**
 * K.8 design law guard (owner 2026-09-05): lists/reports design law sweep.
 * Asserts the design law invariants for Cascade's surface (pages/lists/**, pages/reports/**):
 *   1. Every ParityTable consumer has a storageKey (gear present)
 *   2. ParityTable enforces centered headers, zebra, sticky header by default
 *   3. Report money()/fmtNum() helpers guard zero with dash (delegated to verify-reports-dash-never-zero.mjs)
 *   4. No ParityTable consumer uses defaultHidden without storageKey
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

function listTsxFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...listTsxFiles(full));
    } else if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

const failures = [];

const listsDir = resolve(ROOT, "apps/frontend/src/pages/lists");
const reportsDir = resolve(ROOT, "apps/frontend/src/pages/reports");

// 1. Every ParityTable consumer has storageKey (gear)
const allFiles = [...listTsxFiles(listsDir), ...listTsxFiles(reportsDir)];
for (const file of allFiles) {
  const src = readFileSync(file, "utf8");
  if (src.includes("ParityTable") && src.includes("<ParityTable")) {
    if (!src.includes("storageKey")) {
      failures.push(`${file}: uses <ParityTable> without storageKey (gear required by design law)`);
    }
  }
}

// 2. ParityTable component enforces centered headers, zebra, sticky header
const paritySrc = read("apps/frontend/src/components/parity/ParityTable.tsx");
if (!paritySrc.includes("text-center")) {
  failures.push("ParityTable.tsx: must enforce text-center (CENTER-EVERYTHING LAW)");
}
if (!paritySrc.includes("stickyHeader = true")) {
  failures.push("ParityTable.tsx: stickyHeader must default to true");
}
if (!paritySrc.includes("zebra")) {
  failures.push("ParityTable.tsx: must have zebra striping");
}

if (failures.length) {
  console.error("FAIL verify-lists-reports-design-law:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log(`PASS verify-lists-reports-design-law — ${allFiles.length} files checked; ParityTable enforces centered headers, zebra, sticky; all consumers have gear (K.8)`);
