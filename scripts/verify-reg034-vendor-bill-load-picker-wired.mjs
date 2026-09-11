#!/usr/bin/env node
/** @matrix-built {"modules":["accounting"],"cols":["connectivity","picker_law"],"leafRe":"^accounting\\.parity\\.vendor_bill_create_page$","task":"LST-F50100-REG034-BILL-LOAD-PICKER"} */
// REG-034 CI guard: VendorBillForm.tsx used to offer a plain free-text "Load Number" <input> that
// only ever fed the memo string (buildMemoContext's `load:` token) — accounting.bill_lines.load_id
// stayed NULL for every bill created through this form, even though the backend has fully accepted
// a per-line load_id since #19459 (bills.routes.ts createBillLineSchema,
// buildVendorBillLinePayloads's defaultLoadId param). 0/155,271 bill_lines rows system-wide carried
// a load_id before this fix (docs/audit/GUARD-WORKORDERS.md, REG-034). Fails CLOSED if the real
// EntityPicker regresses back to a bare text input, or if the picker's value stops reaching
// buildVendorBillLinePayloads.

import { readFileSync } from "node:fs";

const FORM_PATH = "apps/frontend/src/components/accounting/VendorBillForm.tsx";

function checkSource(src) {
  const errors = [];

  if (!/<EntityPicker\s[^>]*kind="load"/.test(src)) {
    errors.push("no <EntityPicker kind=\"load\" ...> found — regressed to a free-text Load field?");
  }
  if (/placeholder="Load Number"/.test(src)) {
    errors.push("the old free-text \"Load Number\" input reappeared");
  }
  if (!src.includes("buildVendorBillLinePayloads(lines, loadId || linkedLoadId)")) {
    errors.push("the picker's loadId state no longer reaches buildVendorBillLinePayloads — the FK would go back to always-NULL for a manually-picked load");
  }
  // The picker must be wired to real state (setLoadId), not just read a static/constant value.
  if (!/setLoadId\(next/.test(src)) {
    errors.push("no setLoadId(...) onChange handler found — the picker would be read-only/decorative");
  }

  return errors;
}

function runSelftest() {
  const real = readFileSync(FORM_PATH, "utf8");
  const cases = [
    {
      name: "EntityPicker kind=load removed (reverted to free-text)",
      src: real.replace('<EntityPicker\n              kind="load"', '<EntityPicker\n              kind="removed"'),
      wantError: true,
    },
    {
      name: "old free-text Load Number input reintroduced",
      src: `${real}\n<input placeholder="Load Number" />`,
      wantError: true,
    },
    {
      name: "picker value stops reaching the payload builder",
      src: real.replace(
        "buildVendorBillLinePayloads(lines, loadId || linkedLoadId)",
        "buildVendorBillLinePayloads(lines, linkedLoadId)"
      ),
      wantError: true,
    },
    {
      name: "onChange handler removed (picker becomes read-only)",
      src: real.replace(/setLoadId\(next[^)]*\)/, "/* removed */"),
      wantError: true,
    },
    {
      name: "current real file",
      src: real,
      wantError: false,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const errors = checkSource(c.src);
    const gotError = errors.length > 0;
    if (gotError !== c.wantError) {
      failed++;
      console.error(
        `  ✗ ${c.name}: expected ${c.wantError ? "an error" : "no error"}, got ${
          gotError ? `error(s): ${errors.join(" | ")}` : "no error"
        }`
      );
    } else {
      console.log(`  ok    ${c.name} → ${c.wantError ? "FAIL (caught)" : "PASS"}`);
    }
  }

  if (failed > 0) {
    console.error(`verify-reg034-vendor-bill-load-picker-wired --selftest FAILED (${failed} case(s))`);
    process.exit(1);
  }
  console.log(`verify-reg034-vendor-bill-load-picker-wired --selftest PASS (${cases.length}/${cases.length})`);
}

if (process.argv.includes("--selftest")) {
  runSelftest();
  process.exit(0);
}

const src = readFileSync(FORM_PATH, "utf8");
const errors = checkSource(src);
if (errors.length > 0) {
  console.error(`verify-reg034-vendor-bill-load-picker-wired FAILED (${FORM_PATH}):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(
  "verify-reg034-vendor-bill-load-picker-wired OK — VendorBillForm's Load field is a real EntityPicker, wired through to buildVendorBillLinePayloads."
);
