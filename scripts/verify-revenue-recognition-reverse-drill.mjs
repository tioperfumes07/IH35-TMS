#!/usr/bin/env node
/**
 * Rule-17: revenue recognition reverse drill — contract detail must EntityLink source invoice/load/customer.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-revenue-recognition-reverse-drill";
const PAGE = "apps/frontend/src/pages/accounting/RevenueRecognitionPage.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertRevenueRecognitionReverse(sources) {
  const errors = [];
  const page = sources?.page ?? read(PAGE);
  const api = sources?.api ?? read("apps/frontend/src/api/revenue-recognition.ts");
  const manifest = sources?.manifest ?? read("apps/frontend/src/routes/manifest.tsx");

  if (!/from "\.\.\/\.\.\/components\/shared\/EntityLink"/.test(page)) {
    errors.push(`${PAGE}: must import EntityLink`);
  }
  if (!/data-testid="revenue-recognition-reverse-drill"/.test(page)) {
    errors.push(`${PAGE}: reverse drill marker missing`);
  }
  if (!/kind="invoice"/.test(page) || !/detail\.source_invoice_id/.test(page)) {
    errors.push(`${PAGE}: must EntityLink detail.source_invoice_id`);
  }
  if (!/kind="load"/.test(page) || !/detail\.source_load_id/.test(page)) {
    errors.push(`${PAGE}: must EntityLink detail.source_load_id`);
  }
  if (!/kind="customer"/.test(page) || !/detail\.customer_uuid/.test(page)) {
    errors.push(`${PAGE}: must EntityLink detail.customer_uuid`);
  }
  if (!/source_invoice_id/.test(api) || !/source_load_id/.test(api)) {
    errors.push("revenue-recognition API types must expose source_invoice_id + source_load_id");
  }
  if (!/\/accounting\/revenue-recognition/.test(manifest)) {
    errors.push("manifest: /accounting/revenue-recognition route missing");
  }
  return errors;
}

/**
 * Planted-regression selftest: runs the REAL assertion against MUTATED COPIES of the REAL files.
 * The previous version compared two string literals declared inside this script and never read the
 * repo, so it exited 0 even against a broken page — it proved nothing.
 */
function selftest() {
  const live = {
    page: read(PAGE),
    api: read("apps/frontend/src/api/revenue-recognition.ts"),
    manifest: read("apps/frontend/src/routes/manifest.tsx"),
  };
  const problems = [];

  const liveErrors = assertRevenueRecognitionReverse(live);
  if (liveErrors.length) problems.push(`live sources rejected: ${liveErrors.join("; ")}`);

  const cases = [
    ["EntityLink import removed", { ...live, page: live.page.replace(/from "\.\.\/\.\.\/components\/shared\/EntityLink"/g, 'from "./nope"') }, "must import EntityLink"],
    ["reverse-drill marker removed", { ...live, page: live.page.replace(/data-testid="revenue-recognition-reverse-drill"/g, "") }, "reverse drill marker missing"],
  ];
  for (const [name, mutated, expect] of cases) {
    if (mutated.page === live.page) { problems.push(`planted regression "${name}" did not mutate the source — selftest is inert`); continue; }
    if (!assertRevenueRecognitionReverse(mutated).some((e) => e.includes(expect))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} --selftest FAIL`);
    for (const pr of problems) console.error("  •", pr);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — live sources clean; ${cases.length} planted regressions caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertRevenueRecognitionReverse();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
