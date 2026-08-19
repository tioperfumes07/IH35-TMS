#!/usr/bin/env node
/**
 * verify-company-violation-create-error-surface
 * SAF-COMPANY-VIOLATION-CREATE-SILENT-FAIL — CompanyViolationCreateModal must
 * surface mutation.isError (same silent-fail class as meet/train/permits).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-company-violation-create-error-surface";
const TARGET = "apps/frontend/src/pages/safety/components/CompanyViolationCreateModal.tsx";

function assertSrc(src) {
  const errors = [];
  if (!src.includes("mutation.isError")) errors.push("missing mutation.isError");
  if (!src.includes("userFacingApiError")) errors.push("missing userFacingApiError");
  if (!src.includes("company-violation-create-error")) errors.push("missing company-violation-create-error testid");
  return errors;
}

function selftest() {
  const bad = `<Button type="submit" loading={mutation.isPending}>Save</Button>`;
  const good = `{mutation.isError ? <p data-testid="company-violation-create-error">{userFacingApiError(mutation.error, "fail")}</p> : null}`;
  if (assertSrc(bad).length === 0 || assertSrc(good).length > 0) {
    console.error(`${LABEL} SELFTEST FAIL`, { bad: assertSrc(bad), good: assertSrc(good) });
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertSrc(fs.readFileSync(path.join(process.cwd(), TARGET), "utf8"));
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — CompanyViolationCreateModal surfaces mutation.isError`);
