#!/usr/bin/env node
/**
 * COMP-F3548 — Property-tax rendition taxable-asset lines must use ParityTable
 * (Search+Range+gear), not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check() {
  const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  assert(src.includes('storageKey="property-tax-rendition-lines"'), "PropertyTaxRenditionPage: lines must set storageKey");
  assert(src.includes('tableTestId="property-tax-rendition-lines-table"'), "PropertyTaxRenditionPage: lines must set tableTestId");
  assert(src.includes("No taxable assets rendered yet."), "PropertyTaxRenditionPage: keep lines empty copy");
  assert(!/<table\b/.test(src), "PropertyTaxRenditionPage: must not use raw HTML table");
  assert(src.includes("addRenditionLine"), "PropertyTaxRenditionPage: keep add-line mutation");
}

function selftest() {
  check();
  const filePath = path.join(ROOT, PAGE);
  const good = fs.readFileSync(filePath, "utf8");
  const planted = good.replace(
    /storageKey="property-tax-rendition-lines"[\s\S]*?\/>/,
    `storageKey="x" /><table className="min-w-full"><tbody /></table>`,
  );
  assert(planted.includes("<table"), "selftest plant must include raw table");
  fs.writeFileSync(filePath, planted);
  let failed = false;
  try {
    check();
  } catch {
    failed = true;
  }
  fs.writeFileSync(filePath, good);
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-property-tax-rendition-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  check();
  console.log("verify-property-tax-rendition-parity-surface-bar PASS");
}
