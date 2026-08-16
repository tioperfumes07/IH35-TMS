#!/usr/bin/env node
/**
 * LV-DOC-CATEGORIES-MISSING-IDENTITY-AND-MX-LICENCE ratchet:
 *  1) Migration seeds identity_document, passport, visa, mexican_federal_license
 *  2) CreateDriverModal maps DQ upload keys to those codes (or medical_card/cdl)
 *  3) requestUploadUrl receives category_id from the resolved category
 *
 * --selftest strips mexican_federal_license from the migration and expects FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = path.join(
  ROOT,
  "db/migrations/202608152200_seed_file_categories_identity_mx.sql"
);
const MODAL = path.join(ROOT, "apps/frontend/src/components/drivers/CreateDriverModal.tsx");

const REQUIRED_CODES = [
  "identity_document",
  "passport",
  "visa",
  "mexican_federal_license",
];

function check({ migration, modal }) {
  const errors = [];
  if (!fs.existsSync(MIGRATION)) {
    errors.push("missing migration 202608152200_seed_file_categories_identity_mx.sql");
    return errors;
  }
  for (const code of REQUIRED_CODES) {
    if (!migration.includes(`'${code}'`)) {
      errors.push(`migration missing seed code '${code}'`);
    }
  }
  if (!/ON CONFLICT\s*\(\s*code\s*\)\s*DO NOTHING/i.test(migration)) {
    errors.push("migration must be idempotent ON CONFLICT (code) DO NOTHING");
  }
  if (!/DRIVER_CREATE_DOC_CATEGORY_CODES/.test(modal)) {
    errors.push("CreateDriverModal missing DRIVER_CREATE_DOC_CATEGORY_CODES map");
  }
  for (const code of ["identity_document", "mexican_federal_license", "medical_card", "cdl", "passport"]) {
    if (!modal.includes(`"${code}"`) && !modal.includes(`'${code}'`)) {
      errors.push(`CreateDriverModal missing category code reference ${code}`);
    }
  }
  if (!/listFileCategories/.test(modal)) {
    errors.push("CreateDriverModal must load listFileCategories to resolve category_id");
  }
  if (!/category_id:\s*categoryId/.test(modal) && !/category_id:\s*categoryByCode/.test(modal)) {
    if (!/category_id:\s*/.test(modal) || !/pendingDocs/.test(modal)) {
      errors.push("CreateDriverModal upload path must pass category_id");
    } else if (!/category_id:\s*[a-zA-Z_]/.test(modal)) {
      errors.push("CreateDriverModal upload path must pass category_id from resolved map");
    }
  }
  return errors;
}

function selftest() {
  const orig = fs.readFileSync(MIGRATION, "utf8");
  const broken = orig.replace(/'mexican_federal_license'/g, "'mexican_federal_license_REMOVED'");
  if (broken === orig) throw new Error("selftest: could not plant defect");
  fs.writeFileSync(MIGRATION, broken);
  try {
    const errors = check({
      migration: fs.readFileSync(MIGRATION, "utf8"),
      modal: fs.readFileSync(MODAL, "utf8"),
    });
    if (errors.length === 0) throw new Error("selftest: planted defect did not fail");
  } finally {
    fs.writeFileSync(MIGRATION, orig);
  }
  console.log("verify-doc-categories-identity-mx-license --selftest OK");
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = check({
    migration: fs.readFileSync(MIGRATION, "utf8"),
    modal: fs.readFileSync(MODAL, "utf8"),
  });
  if (errors.length) {
    console.error("verify-doc-categories-identity-mx-license FAIL:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    "verify-doc-categories-identity-mx-license OK — seed + CreateDriverModal category wiring present"
  );
}

main();
