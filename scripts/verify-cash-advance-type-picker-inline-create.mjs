#!/usr/bin/env node
// LISTS-PICKER-LAW-MISS-C: catalog.drivers.cash_advance_types' one live consuming picker
// (CreateAdvanceModal.tsx's Purpose field) read the catalog but had no inline "+ Add new"
// affordance -- a plain SelectCombobox with no createKind/allowAddNew. Guard requires the Purpose
// field to use Combobox with allowAddNew wired to cashAdvanceTypesCatalogClient.create(), and a
// mini-create form that invalidates the same query key the picker reads.
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/cash-advances/components/CreateAdvanceModal.tsx";

function inspect(source) {
  const failures = [];

  if (!/data-testid="advance-purpose"[\s\S]{0,300}<Combobox[\s\S]{0,800}allowAddNew=\{\{/.test(source)) {
    failures.push("Purpose field is not a Combobox with allowAddNew wired");
  }
  if (!/cashAdvanceTypesCatalogClient\.create\(operatingCompanyId, \{ code, display_name \}\)/.test(source)) {
    failures.push("saveNewAdvanceType does not call cashAdvanceTypesCatalogClient.create()");
  }
  if (
    !/await queryClient\.invalidateQueries\(\{ queryKey: \["catalogs", "cash-advance-types", operatingCompanyId\] \}\)/.test(
      source
    )
  ) {
    failures.push("saveNewAdvanceType does not invalidate the same query key the Purpose picker reads");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const realFailures = inspect(real);
  if (realFailures.length !== 0) {
    console.error("verify-cash-advance-type-picker-inline-create --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  const mutated = real.replace(
    'allowAddNew={{\n                  label: "+ Add new cash advance type",\n                  onAdd: () => setAdvanceTypeCreateOpen(true),\n                }}\n              />',
    "/>"
  );
  if (mutated === real) {
    console.error("verify-cash-advance-type-picker-inline-create --selftest: mutation did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutated);
  if (mutatedFailures.length === 0) {
    console.error("verify-cash-advance-type-picker-inline-create --selftest FAILED: mutation was not caught");
    process.exit(1);
  }
  console.log("verify-cash-advance-type-picker-inline-create --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-cash-advance-type-picker-inline-create FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-cash-advance-type-picker-inline-create: OK — cash advance type Purpose picker has a genuine inline +Add new writing the canonical catalog");
