#!/usr/bin/env node
/** @matrix-built {"modules":["fuel"],"cols":["trailer"],"leafRe":"^fuel\\.modal\\.create_fuel_transaction$","task":"LINK-F5163-FUEL-TRAILER-CREATE"} */
/** @matrix-built {"modules":["insurance"],"cols":["trailer"],"leafRe":"^claims\\.create$","task":"LINK-F5163-INSURANCE-CLAIM-TRAILER-CREATE"} */
/** @matrix-built {"modules":["insurance"],"cols":["trailer","picker_law","reverse_link"],"leafRe":"^claims\\.list$","task":"LST-F5163E-INSURANCE-CLAIMS-LIST-TRAILER"} */
/** @matrix-built {"modules":["maintenance"],"cols":["trailer"],"leafRe":"^(wo\\.create|tires\\.create_record)$","task":"LINK-F5163-MAINTENANCE-TRAILER-CREATE"} */
/**
 * OWNER-EXECUTION-PLAN vertical trailer-column sweep (2026-08-14): create-side leaves capture a real
 * trailer_id + insurance claims.list must reverse-filter + show Trailer (LST-F5163E).
 *
 * Self-test: node scripts/verify-fuel-insurance-maintenance-trailer-create.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  fuel: "apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx",
  claim: "apps/frontend/src/components/insurance/ClaimCreateModal.tsx",
  claimsList: "apps/frontend/src/pages/insurance/ClaimsTab.tsx",
  wo: "apps/frontend/src/pages/maintenance/components/CreateWOSectionIdentification.tsx",
  tires: "apps/frontend/src/pages/maintenance/TireProgramPage.tsx",
};
const LABEL = "verify-fuel-insurance-maintenance-trailer-create";

export function audit(src) {
  const failures = [];
  if (!/trailer_id:\s*trailerId \|\| null/.test(src.fuel)) {
    failures.push(`${FILES.fuel}: fuel transaction create must submit a real trailer_id`);
  }
  if (!/trailer_id:\s*form\.trailer_id \|\| null/.test(src.claim)) {
    failures.push(`${FILES.claim}: insurance claim create must submit a real trailer_id`);
  }
  if (!/dataTestId="insurance-claims-trailer-filter"/.test(src.claimsList)) {
    failures.push(`${FILES.claimsList}: claims list must render EntityPicker trailer filter`);
  }
  if (!/key:\s*"trailer_id"/.test(src.claimsList) || !/kind="trailer"/.test(src.claimsList)) {
    failures.push(`${FILES.claimsList}: claims list must show Trailer EntityLink column`);
  }
  if (!/setTrailerFilter\(reverseTrailerId\)/.test(src.claimsList)) {
    failures.push(`${FILES.claimsList}: ?trailer_id= reverse deep-link must seed trailerFilter`);
  }
  if (!/register\("equipment_id"\)/.test(src.wo)) {
    failures.push(`${FILES.wo}: WO create must capture a real trailer/reefer equipment_id`);
  }
  if (!/const \[assetKind, setAssetKind\] = useState<"unit" \| "trailer">\("unit"\)/.test(src.tires)) {
    failures.push(`${FILES.tires}: tire record create must have a real unit|trailer asset-kind toggle`);
  }
  if (!/assetKind === "trailer" \? \{ equipment_id: assetId \}/.test(src.tires)) {
    failures.push(`${FILES.tires}: tire record create must scope by real equipment_id for trailer assets`);
  }
  return failures;
}

function loadSrc(root) {
  return {
    fuel: fs.readFileSync(path.join(root, FILES.fuel), "utf8"),
    claim: fs.readFileSync(path.join(root, FILES.claim), "utf8"),
    claimsList: fs.readFileSync(path.join(root, FILES.claimsList), "utf8"),
    wo: fs.readFileSync(path.join(root, FILES.wo), "utf8"),
    tires: fs.readFileSync(path.join(root, FILES.tires), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["fuel-submit", "fuel", /trailer_id:\s*trailerId \|\| null/, "trailer_id: null"],
    ["claim-submit", "claim", /trailer_id:\s*form\.trailer_id \|\| null/, "trailer_id: null"],
    ["claims-filter", "claimsList", /dataTestId="insurance-claims-trailer-filter"/, 'dataTestId="insurance-claims-filter-unit"'],
    ["claims-column", "claimsList", /key:\s*"trailer_id"/, 'key: "unit_id"'],
    ["claims-seed", "claimsList", /setTrailerFilter\(reverseTrailerId\)/, "setUnitFilter(reverseTrailerId)"],
    ["wo-register", "wo", /register\("equipment_id"\)/g, 'register("unused_field")'],
    ["tires-toggle", "tires", /const \[assetKind, setAssetKind\] = useState<"unit" \| "trailer">\("unit"\)/, 'const assetKind = "unit"'],
    ["tires-scope", "tires", /assetKind === "trailer" \? \{ equipment_id: assetId \}/, '{ unit_id: assetId } ? { equipment_id: assetId }'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — fuel/insurance/maintenance trailer create + insurance claims list reverse are real`);
