#!/usr/bin/env node
/**
 * LV-DOC-CATEGORIES-MISSING-IDENTITY-AND-MX-LICENCE ratchet:
 *  1) Migration seeds identity_document, passport, visa, mexican_federal_license
 *  2) CreateDriverModal maps DQ upload keys to those codes (or medical_card/cdl)
 *  3) requestUploadUrl receives category_id from the resolved category
 *  4) A category GET failure is disclosed with Retry and staged uploads fail closed
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
const BOARD = path.join(ROOT, "docs/audit/GUARD-WORKORDERS.md");
const REGISTER = path.join(ROOT, "docs/audit/CC-3-FINDINGS-CHECKLIST.md");
const FINDING_ID = "LV-DOC-CATEGORIES-MISSING-IDENTITY-AND-MX-LICENCE";
const MERGED_PR = "#7668";

const REQUIRED_CODES = [
  "identity_document",
  "passport",
  "visa",
  "mexican_federal_license",
];

function findingLine(text) {
  return text.split("\n").find((line) => line.includes(FINDING_ID)) ?? "";
}

function check({ migration, modal, board, register }) {
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
  if (!/title="Couldn't load document categories"/.test(modal) || !/fileCategoriesQuery\.refetch\(\)/.test(modal)) {
    errors.push("CreateDriverModal must disclose category GET failure with Retry");
  }
  if (!/pendingDocCategoriesUnavailable/.test(modal)) {
    errors.push("CreateDriverModal must fail closed when staged document categories are unavailable");
  }
  if (!/pendingDocCategoriesUnavailable\s*\|\|\s*returningCheckLoading/.test(modal)) {
    errors.push("CreateDriverModal Save must be disabled while staged document categories are unavailable");
  }
  if (!/if \(pendingDocCategoriesUnavailable\) \{[\s\S]*?return;[\s\S]*?\}\s*saveModeRef\.current/.test(modal)) {
    errors.push("CreateDriverModal save handler must reject unavailable staged document categories");
  }
  for (const [name, text] of [["GUARD board", board], ["findings register", register]]) {
    const line = findingLine(text);
    if (!line.includes(MERGED_PR)) {
      errors.push(`${name} must credit ${FINDING_ID} to merged PR ${MERGED_PR}`);
    }
    if (line.includes("#7666")) {
      errors.push(`${name} retains stale PR #7666 provenance for ${FINDING_ID}`);
    }
  }
  return errors;
}

function selftest() {
  const orig = fs.readFileSync(MIGRATION, "utf8");
  const modal = fs.readFileSync(MODAL, "utf8");
  const board = fs.readFileSync(BOARD, "utf8");
  const register = fs.readFileSync(REGISTER, "utf8");
  const broken = orig.replace(/'mexican_federal_license'/g, "'mexican_federal_license_REMOVED'");
  if (broken === orig) throw new Error("selftest: could not plant defect");
  fs.writeFileSync(MIGRATION, broken);
  try {
    const errors = check({
      migration: fs.readFileSync(MIGRATION, "utf8"),
      modal,
      board,
      register,
    });
    if (errors.length === 0) throw new Error("selftest: planted defect did not fail");
  } finally {
    fs.writeFileSync(MIGRATION, orig);
  }
  const staleProvenance = check({
    migration: orig,
    modal,
    board,
    register: register.replace(MERGED_PR, "#7666"),
  });
  if (!staleProvenance.some((error) => error.includes("stale PR #7666 provenance"))) {
    throw new Error("selftest: planted stale PR provenance did not fail");
  }
  const mutations = [
    {
      name: "category error disclosure",
      modal: modal.replace("title=\"Couldn't load document categories\"", "title=\"Categories unavailable\""),
      expected: "disclose category GET failure",
    },
    {
      name: "staged upload save gate",
      modal: modal.replace("pendingDocCategoriesUnavailable ||\n                    returningCheckLoading", "returningCheckLoading"),
      expected: "Save must be disabled",
    },
    {
      name: "save handler defense",
      modal: modal.replace(
        "if (pendingDocCategoriesUnavailable) {\n        pushToast(\"Document categories are unavailable. Retry before saving staged files.\", \"error\");\n        return;\n      }\n      saveModeRef.current",
        "saveModeRef.current"
      ),
      expected: "save handler must reject",
    },
  ];
  for (const mutation of mutations) {
    if (mutation.modal === modal) throw new Error(`selftest: could not plant ${mutation.name}`);
    const errors = check({ migration: orig, modal: mutation.modal, board, register });
    if (!errors.some((error) => error.includes(mutation.expected))) {
      throw new Error(`selftest: planted ${mutation.name} did not fail`);
    }
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
    board: fs.readFileSync(BOARD, "utf8"),
    register: fs.readFileSync(REGISTER, "utf8"),
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
