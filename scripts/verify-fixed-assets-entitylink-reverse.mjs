#!/usr/bin/env node
/**
 * Rule-17 guard: fixed assets unit EntityLink + JE reverse mapping (Law §9).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fixed-assets-entitylink-reverse";
const FIXED_PAGE = "apps/frontend/src/pages/accounting/FixedAssetsPage.tsx";
const JE_DETAIL = "apps/frontend/src/pages/accounting/journal-entries/JournalEntryDetailPage.tsx";
const ENTITY_LINK = "apps/frontend/src/components/shared/EntityLink.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertFixedAssetsEntitylinkReverse() {
  const errors = [];
  const fixed = read(FIXED_PAGE);
  const jeDetail = read(JE_DETAIL);
  const entityLink = read(ENTITY_LINK);

  if (!fixed.includes("useSearchParams")) {
    errors.push(`${FIXED_PAGE}: must honor ?asset_id= reverse drill param`);
  }
  if (!/unit_uuid/.test(fixed) || !/kind=["']unit["']/.test(fixed)) {
    errors.push(`${FIXED_PAGE}: detail must EntityLink unit_uuid → unit`);
  }
  if (!/case ["']fixed_asset["']:/.test(jeDetail) || !/case ["']fixed_asset_depreciation["']:/.test(jeDetail)) {
    errors.push(`${JE_DETAIL}: postingEntityKind must map fixed_asset + fixed_asset_depreciation`);
  }
  if (!entityLink.includes("fixed_asset") || !/\/accounting\/fixed-assets\?asset_id=/.test(entityLink)) {
    errors.push(`${ENTITY_LINK}: must resolve fixed_asset → /accounting/fixed-assets?asset_id=`);
  }
  return errors;
}

function selftest() {
  const errors = assertFixedAssetsEntitylinkReverse();
  if (errors.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  ${errors.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertFixedAssetsEntitylinkReverse();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
