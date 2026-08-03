#!/usr/bin/env node
/**
 * DOCS-S01 / DOCS-LINK-01 chrome — DocsHome Entity column must use EntityLink
 * (not raw UUID slice) when docs.file_links exist.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-docs-entity-column-entitylink";
const PAGE = "apps/frontend/src/pages/docs/DocsHomePage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectProblems(src = read(PAGE)) {
  const problems = [];
  if (!/import\s*\{\s*EntityLink/.test(src)) {
    problems.push(`${PAGE}: must import EntityLink`);
  }
  if (!/<EntityLink[\s\S]*kind=\{kind\}[\s\S]*id=\{firstLink\.entity_id\}/.test(src)) {
    problems.push(`${PAGE}: Entity column must render <EntityLink kind id={firstLink.entity_id}>`);
  }
  if (/entity_id\.slice\(0,\s*8\)/.test(src)) {
    problems.push(`${PAGE}: must not display raw UUID prefix (entity_id.slice)`);
  }
  if (!/docs-entity-unlinked/.test(src)) {
    problems.push(`${PAGE}: must honest-empty unlinked rows (docs-entity-unlinked)`);
  }
  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const real = read(PAGE);
  const broken = real
    .replace(/import \{ EntityLink[\s\S]*?;\n/, "")
    .replace(/<EntityLink[\s\S]*?\/>/, `<span>{firstLink.entity_type}:{firstLink.entity_id.slice(0, 8)}</span>`);
  if (collectProblems(broken).length === 0) {
    console.error(`${LABEL} --selftest FAIL: broken fixture not flagged`);
    process.exit(1);
  }
  const good = collectProblems(real);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL:\n${good.map((p) => `  - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — DocsHome Entity column uses EntityLink (not UUID slice)`);
}
