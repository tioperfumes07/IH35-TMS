#!/usr/bin/env node
// DRIVER-CREATE-MODAL-CDL-CLASS-AND-STATUS-HARDCODED-BYPASS-CATALOG: CreateDriverModal.tsx's "CDL
// Class" field used to be fed by a hardcoded ["A","B","C"] array bypassing the real, 9-row
// reference.license_classes catalog (6 codes unreachable at driver-create time). Guard requires the
// picker to read the live catalog with an inline "+ Add new" affordance, and both the frontend form
// schema and the backend route schema to accept more than the 3 hardcoded literals.
import fs from "node:fs";

const FE_FILE = "apps/frontend/src/components/drivers/CreateDriverModal.tsx";
const BE_FILE = "apps/backend/src/mdata/drivers.routes.ts";

function inspectFe(source) {
  const failures = [];
  if (!/licenseClassesCatalogClient\.list\(\{\}\)/.test(source)) {
    failures.push("CreateDriverModal.tsx does not fetch reference.license_classes via licenseClassesCatalogClient.list()");
  }
  if (!/cdlClassComboboxOptions = useMemo\(/.test(source)) {
    failures.push("cdlClassComboboxOptions is not derived from a live query (still a hardcoded array?)");
  }
  if (/const cdlClassComboboxOptions = \["A", "B", "C"\]/.test(source)) {
    failures.push("cdlClassComboboxOptions is still the old hardcoded [\"A\",\"B\",\"C\"] array");
  }
  if (!/^\s*allowAddNew=\{\{\s*$/m.test(source) || !/label: "\+ Add new license class"/.test(source)) {
    failures.push("CDL Class Combobox has no allowAddNew wired");
  }
  if (!/cdl_class: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(20\)\.optional\(\)/.test(source)) {
    failures.push("CreateDriverModal.tsx's own form-validation schema still restricts cdl_class to a fixed enum");
  }
  return failures;
}

function inspectBe(source) {
  const failures = [];
  if (!/const cdlClassSchema = z\.string\(\)\.trim\(\)\.min\(1\)\.max\(20\);/.test(source)) {
    failures.push("drivers.routes.ts's cdlClassSchema still restricts cdl_class to z.enum([\"A\",\"B\",\"C\"])");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const feReal = fs.readFileSync(FE_FILE, "utf8");
  const beReal = fs.readFileSync(BE_FILE, "utf8");
  const feRealFailures = inspectFe(feReal);
  const beRealFailures = inspectBe(beReal);
  if (feRealFailures.length !== 0 || beRealFailures.length !== 0) {
    console.error("verify-driver-create-cdl-class-catalog-backed --selftest FAILED: real source itself fails:", [...feRealFailures, ...beRealFailures]);
    process.exit(1);
  }
  const feMutated = feReal.replace(
    'allowAddNew={{\n                label: "+ Add new license class",\n                onAdd: () => setLicenseClassCreateOpen(true),\n              }}\n            />',
    "/>"
  );
  if (feMutated === feReal) {
    console.error("verify-driver-create-cdl-class-catalog-backed --selftest: FE mutation did not match live source — update the test");
    process.exit(1);
  }
  const feMutatedFailures = inspectFe(feMutated);
  if (feMutatedFailures.length === 0) {
    console.error("verify-driver-create-cdl-class-catalog-backed --selftest FAILED: FE mutation was not caught");
    process.exit(1);
  }
  const beMutated = beReal.replace(
    "const cdlClassSchema = z.string().trim().min(1).max(20);",
    'const cdlClassSchema = z.enum(["A", "B", "C"]);'
  );
  if (beMutated === beReal) {
    console.error("verify-driver-create-cdl-class-catalog-backed --selftest: BE mutation did not match live source — update the test");
    process.exit(1);
  }
  const beMutatedFailures = inspectBe(beMutated);
  if (beMutatedFailures.length === 0) {
    console.error("verify-driver-create-cdl-class-catalog-backed --selftest FAILED: BE mutation was not caught");
    process.exit(1);
  }
  console.log("verify-driver-create-cdl-class-catalog-backed --selftest: OK (both mutations caught, real source clean)");
  process.exit(0);
}

const feFailures = inspectFe(fs.readFileSync(FE_FILE, "utf8"));
const beFailures = inspectBe(fs.readFileSync(BE_FILE, "utf8"));
const failures = [...feFailures, ...beFailures];
if (failures.length > 0) {
  console.error("verify-driver-create-cdl-class-catalog-backed FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-driver-create-cdl-class-catalog-backed: OK — CDL Class picker is catalog-backed with inline create, both FE+BE schemas widened");
