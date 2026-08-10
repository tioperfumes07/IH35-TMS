#!/usr/bin/env node
/**
 * DOCS-ECON-01 / DOCS-LINK-01 — generated dispatch packets must be classified and linked at write time.
 * Run: node scripts/verify-docs-econ-link-pack.mjs [--selftest]
 */
import fs from "node:fs";

const LABEL = "verify-docs-econ-link-pack";
const WRITER = "apps/backend/src/dispatch/load-distribution.service.ts";
const PAGE = "apps/frontend/src/pages/docs/DocsHomePage.tsx";

function inspect(writer, page) {
  const problems = [];
  const categoryUses = writer.match(/code\s*=\s*'dispatch_instructions'/g)?.length ?? 0;
  if (categoryUses < 2) problems.push("both generated docs.files rows must resolve dispatch_instructions category_id");
  for (const required of [
    '[fileId, "load", load.id]',
    '[customerFileId, "load", load.id]',
    '[fileId, "driver", load.assigned_primary_driver_id]',
    '[customerFileId, "customer", load.customer_id]',
  ]) {
    if (!writer.includes(required)) problems.push(`missing generated document link: ${required}`);
  }
  if (!/INSERT INTO docs\.file_links[\s\S]*ON CONFLICT \(file_id, entity_type, entity_id\)/.test(writer)) {
    problems.push("writer must persist idempotent docs.file_links in the same transaction");
  }
  if (!/links\.map\(\(link\)[\s\S]*<EntityLink[\s\S]*id=\{link\.entity_id\}/.test(page)) {
    problems.push("Docs Entity column must render every persisted link with EntityLink");
  }
  if (/label=\{`\$\{link\.entity_type\}`\}/.test(page) || /label=\{link\.entity_type\}/.test(page)) {
    problems.push("EntityLink must resolve the human label; entity_type is not a human entity label");
  }
  return problems;
}

function main() {
  const writer = fs.readFileSync(WRITER, "utf8");
  const page = fs.readFileSync(PAGE, "utf8");
  const problems = inspect(writer, page);
  if (problems.length) {
    console.error(`${LABEL}: FAIL\n- ${problems.join("\n- ")}`);
    process.exit(1);
  }
  if (process.argv.includes("--selftest")) {
    const mutations = [
      writer.replace("code = 'dispatch_instructions'", "code = 'other'"),
      writer.replace('[fileId, "driver", load.assigned_primary_driver_id]', '[fileId, "load", load.id]'),
      writer.replace("INSERT INTO docs.file_links", "INSERT INTO docs.missing_links"),
    ];
    const detected = mutations.filter((mutant) => inspect(mutant, page).length > 0).length;
    const pageMutant = page.replace("links.map((link)", "links.slice(0, 1).map((link)");
    if (detected !== mutations.length || inspect(writer, pageMutant).length === 0) {
      console.error(`${LABEL}: selftest FAIL`);
      process.exit(1);
    }
    console.log(`${LABEL}: selftest 4/4`);
  }
  console.log(`${LABEL}: PASS`);
}

main();
