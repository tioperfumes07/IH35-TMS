#!/usr/bin/env node
// SC4 — guards the Carmack/49 CFR 1005.2 cargo-claim intake against regression to the
// location+description-only skeleton. Fails if the CargoClaimsPage no longer routes to the
// Carmack creator, if that creator stops consuming the cargo-claim-reasons catalog or posting
// the claim fields, or if the backend drops the claim schema / the cargo_claim-only rejection.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function read(relPath) {
  const abs = path.resolve(ROOT, relPath);
  if (!fs.existsSync(abs)) return "";
  return fs.readFileSync(abs, "utf8");
}

const pagePath = "apps/frontend/src/pages/safety/CargoClaimsPage.tsx";
const creatorPath = "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx";
const backendPath = "apps/backend/src/safety/incidents.routes.ts";
const migrationDir = "db/migrations";

const page = read(pagePath);
const creator = read(creatorPath);
const backend = read(backendPath);

if (!page) failures.push(`missing:${pagePath}`);
if (!creator) failures.push(`missing:${creatorPath}`);
if (!backend) failures.push(`missing:${backendPath}`);

// Page must route cargo claims to the Carmack creator, not the generic skeleton surface.
if (page && !page.includes("CargoClaimIntakeSurface")) failures.push("page_not_using_carmack_creator");

// Creator must consume the previously-orphaned cargo-claim-reasons catalog...
if (creator && !creator.includes("listCargoClaimReasons") && !creator.includes("cargo-claim-reasons")) {
  failures.push("creator_missing_cargo_claim_reasons_fetch");
}
// ...and post the Carmack claim fields (regression to location+description-only fails here).
for (const field of ["load_id", "claimant_customer_id", "claim_reason_code", "damage_amount_cents"]) {
  if (creator && !creator.includes(field)) failures.push(`creator_missing_field:${field}`);
}
if (creator && !creator.includes("createSafetyIncident")) failures.push("creator_missing_create_call");

// Backend schema must accept the three claim fields...
for (const field of ["claim_reason_code", "claimant_customer_id", "claim_filed_at"]) {
  if (backend && !backend.includes(field)) failures.push(`backend_missing_field:${field}`);
}
// ...and reject claim_* on non-cargo_claim rows + enforce same-entity claimant / valid reason.
if (backend && !backend.includes('incident_type !== "cargo_claim"')) {
  failures.push("backend_missing_incident_type_rejection");
}
if (backend && !backend.includes("claimant_company_mismatch")) failures.push("backend_missing_same_entity_check");
if (backend && !backend.includes("invalid_claim_reason")) failures.push("backend_missing_reason_validation");

// A migration must add the three columns to safety.incidents.
let migrationFound = false;
const migAbs = path.resolve(ROOT, migrationDir);
if (fs.existsSync(migAbs)) {
  for (const file of fs.readdirSync(migAbs)) {
    if (!file.endsWith(".sql")) continue;
    const sql = fs.readFileSync(path.join(migAbs, file), "utf8");
    if (
      sql.includes("safety.incidents") &&
      sql.includes("claim_reason_code") &&
      sql.includes("claimant_customer_id") &&
      sql.includes("claim_filed_at")
    ) {
      migrationFound = true;
      break;
    }
  }
}
if (!migrationFound) failures.push("missing_cargo_claim_columns_migration");

if (failures.length > 0) {
  console.error("verify:cargo-claim-intake FAILED");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}

console.log("verify:cargo-claim-intake OK");
