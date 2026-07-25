#!/usr/bin/env node
/**
 * GUARD (LST-F06 leftover): expense-category pickers must read catalogs.accounts, not mdata.qbo_accounts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = [
  "apps/backend/src/maintenance/wo-cost-context.routes.ts",
  "apps/backend/src/accounting/qbo-master-read.routes.ts",
];
const LABEL = "verify-expense-category-picker-canonical";

function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|--|\*)/.test(l))
    .join("\n");
}

export function assertExpenseCategoryCanonical(sources) {
  const problems = [];
  for (const [rel, src] of Object.entries(sources)) {
    const c = code(src);
    // For qbo-master-read, only the expense-categories handler must be clean — isolate that block.
    let slice = c;
    if (rel.includes("qbo-master-read")) {
      const m = c.match(
        /app\.get\(\s*["']\/api\/v1\/accounting\/expense-categories["'][\s\S]*?(?=app\.get\(|$)/
      );
      if (!m) {
        problems.push(`${rel}: expense-categories route not found`);
        continue;
      }
      slice = m[0];
    }
    if (/FROM\s+mdata\.qbo_accounts\b/i.test(slice)) {
      problems.push(`${rel}: expense-category picker still reads mdata.qbo_accounts (mirror)`);
    }
    if (!/FROM\s+catalogs\.accounts\b/i.test(slice)) {
      problems.push(`${rel}: expense-category picker must FROM catalogs.accounts`);
    }
    if (!/is_postable\s*=\s*true/i.test(slice)) {
      problems.push(`${rel}: expense-category picker must filter is_postable = true`);
    }
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = Object.fromEntries(FILES.map((f) => [f, read(f)]));
  const broken = {
    ...real,
    [FILES[0]]: real[FILES[0]].replace(/FROM catalogs\.accounts/, "FROM mdata.qbo_accounts"),
  };
  if (assertExpenseCategoryCanonical(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: mirror read not flagged`);
    process.exit(1);
  }
  const good = assertExpenseCategoryCanonical(real);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const sources = Object.fromEntries(FILES.map((f) => [f, read(f)]));
  const problems = assertExpenseCategoryCanonical(sources);
  if (problems.length) {
    console.error(`${LABEL} FAIL:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — expense-category pickers read catalogs.accounts (postable).`);
}
