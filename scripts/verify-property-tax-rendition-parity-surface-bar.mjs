#!/usr/bin/env node
/**
 * COMP-F3548 — Property-tax rendition taxable-asset lines must use ParityTable
 * (Search+Range+gear), not a raw HTML table that skips the surface bar.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withMutatedCopy } from "./_lib/selftest-safe-mutation.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

export function check(filePath = path.join(ROOT, PAGE)) {
  const src = fs.readFileSync(filePath, "utf8");
  assert(src.includes('storageKey="property-tax-rendition-lines"'), "PropertyTaxRenditionPage: lines must set storageKey");
  assert(src.includes('tableTestId="property-tax-rendition-lines-table"'), "PropertyTaxRenditionPage: lines must set tableTestId");
  assert(src.includes("No taxable assets rendered yet."), "PropertyTaxRenditionPage: keep lines empty copy");
  assert(!/<table\b/.test(src), "PropertyTaxRenditionPage: must not use raw HTML table");
  assert(src.includes("addRenditionLine"), "PropertyTaxRenditionPage: keep add-line mutation");
  assert(src.includes("property-tax-rendition-asset-picker"), "PropertyTaxRenditionPage: multi-asset Combobox picker");
  assert(src.includes("property-tax-rendition-selected-assets"), "PropertyTaxRenditionPage: selected-asset chips");
  assert(src.includes('data-testid="property-tax-rendition-create-lines"'), "PropertyTaxRenditionPage: batch create-lines button");
  assert(src.includes("MoneyInput"), "PropertyTaxRenditionPage: QBO money inputs for cost/rendered/assessed");
  assert(src.includes("DatePicker"), "PropertyTaxRenditionPage: QBO date picker for acquisition date");
  assert(
    src.includes("<Combobox") && src.includes('dataTestId="property-tax-rendition-asset-picker"'),
    "PropertyTaxRenditionPage: asset picker must be Combobox",
  );
}

// GUARD-SELFTEST-MUTATES-SOURCE fix: never write the plant into the real tracked file. Copy it
// to a temp path (withMutatedCopy), plant there, assert against the copy — apps/ is never touched.
async function selftest() {
  check();
  const realPath = path.join(ROOT, PAGE);
  let failed = false;
  await withMutatedCopy(
    realPath,
    (good) => {
  const planted = good.replace(
    /storageKey="property-tax-rendition-lines"[\s\S]*?\/>/,
    `storageKey="x" /><table className="min-w-full"><tbody /></table>`,
  );
  assert(planted.includes("<table"), "selftest plant must include raw table");
      return planted;
    },
    (tmpPath) => {
      try {
        check(tmpPath);
      } catch {
        failed = true;
      }
    },
  );
  assert(failed, "selftest: expected FAIL on raw HTML table");
  console.log("verify-property-tax-rendition-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-property-tax-rendition-parity-surface-bar PASS");
}
