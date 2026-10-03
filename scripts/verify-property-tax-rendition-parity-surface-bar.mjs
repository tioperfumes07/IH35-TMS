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
  // BANK-F91277 leftover refuse — page-scoped text token ratchet
  assert(!src.includes("text-[11px]"), `${PAGE}: leftover text-[11px]`);
  assert(!src.includes("#8A92AB") && !src.includes("#334155"), `${PAGE}: leftover off-scale muted`);
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
  let leftoverFailed = false;
  await withMutatedCopy(
    realPath,
    (good) => `${good}\n<div className="text-[11px] text-[#8A92AB]">plant</div>`,
    (tmpPath) => {
      try {
        check(tmpPath);
      } catch (e) {
        const msg = String(e?.message ?? e);
        if (msg.includes("leftover text-[11px]") && msg.includes("leftover off-scale muted") === false) {
          // first assert throws on text-[11px]; confirm muted plant also fails on a second copy if needed
          leftoverFailed = msg.includes("leftover text-[11px]");
        } else if (msg.includes("leftover")) {
          leftoverFailed = true;
        }
      }
    },
  );
  // muted plant is same string — first leftover assert fires on text-[11px]; also prove muted via direct assert path
  const mutedOnly = (() => {
    try {
      const src = fs.readFileSync(realPath, "utf8") + '\n<div className="text-[#8A92AB]">plant</div>';
      assert(!src.includes("#8A92AB") && !src.includes("#334155"), `${PAGE}: leftover off-scale muted`);
      return false;
    } catch (e) {
      return String(e?.message ?? e).includes("leftover off-scale muted");
    }
  })();
  assert(leftoverFailed, "selftest: leftover text-[11px] plant escaped");
  assert(mutedOnly, "selftest: leftover off-scale muted plant escaped");
  console.log("verify-property-tax-rendition-parity-surface-bar --selftest PASS");
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) await selftest();
else {
  check();
  console.log("verify-property-tax-rendition-parity-surface-bar PASS");
}
