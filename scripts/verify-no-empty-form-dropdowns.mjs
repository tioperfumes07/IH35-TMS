#!/usr/bin/env node
/**
 * FINAL-AUDIT-PASS CI guard: form Select/Combobox must have static options or a data hook.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND = path.join(ROOT, "apps/frontend/src");

function fail(msg) {
  console.error(`verify:no-empty-form-dropdowns FAIL: ${msg}`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      walk(abs, out);
    } else if (entry.name.endsWith(".tsx")) {
      out.push(abs);
    }
  }
  return out;
}

function extractJsxBlock(src, start) {
  const selfClose = src.indexOf("/>", start);
  const nextClose = src.indexOf(">", start);
  if (selfClose !== -1 && selfClose < nextClose + 40) {
    return src.slice(start, selfClose + 2);
  }
  return src.slice(start, Math.min(start + 1500, src.length));
}

function hasDropdownDataSource(block, fileSrc, startIdx) {
  const window = fileSrc.slice(Math.max(0, startIdx - 500), startIdx + 1500);
  if (block.includes("intentional-static-options")) return true;
  if (block.includes("options={")) return true;
  if (block.includes("items={")) return true;
  if (block.includes("<option")) return true;
  if (block.includes(".map(") || window.includes(".map(")) return true;
  if (window.includes("useQuery") || window.includes("useCatalogQuery")) return true;
  if (/options=\{[\s\S]*?\}/.test(block)) return true;
  return false;
}

function scanFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  const src = fs.readFileSync(filePath, "utf8");
  const violations = [];
  const tagPatterns = [
    /<Combobox[\s/>]/g,
    /<SearchableCombobox[\s/>]/g,
    /<CatalogCombobox[\s/>]/g,
    /<Select[\s/>]/g,
  ];

  for (const pattern of tagPatterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(src)) !== null) {
      const start = match.index;
      if (src.slice(start, start + 15).includes("ComboboxOption")) continue;
      if (src.slice(start, start + 20).includes("SelectHTMLAttributes")) continue;
      const block = extractJsxBlock(src, start);
      if (!hasDropdownDataSource(block, src, start)) {
        const line = src.slice(0, start).split("\n").length;
        violations.push(`${rel}:${line} dropdown missing options or query hook`);
      }
    }
  }

  return violations;
}

function main() {
  const files = walk(FRONTEND);
  const all = files.flatMap(scanFile);
  if (all.length > 0) {
    for (const v of all.slice(0, 25)) console.error(v);
    if (all.length > 25) console.error(`... and ${all.length - 25} more`);
    fail(`${all.length} dropdown(s) without data source`);
  }
  console.log(`verify:no-empty-form-dropdowns PASS (${files.length} tsx files scanned)`);
}

main();
