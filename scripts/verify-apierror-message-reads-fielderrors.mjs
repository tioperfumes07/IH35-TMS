#!/usr/bin/env node
// APIERROR-MESSAGE-GETTER-DROPS-FIELDERRORS: messageFromApiPayload() (the function behind
// ApiError.prototype.message, used by any caller doing `error instanceof Error ? error.message
// : ...` rather than the more robust userFacingApiError) must read a zod validation_error
// response's details.fieldErrors before falling back to the bare "validation_error" code string
// -- otherwise a caller sees the unhelpful literal code instead of the real field-level reason.
import fs from "node:fs";

const FILE = "apps/frontend/src/api/client.ts";

function inspect(source) {
  const failures = [];

  if (
    !/for \(const key of \["message", "error_description", "detail"\] as const\) \{[\s\S]{0,300}\}\s*\n\s*\/\/ APIERROR-MESSAGE-GETTER-DROPS-FIELDERRORS[\s\S]{0,900}fieldErrors[\s\S]{0,400}const err = o\.error;/.test(
      source
    )
  ) {
    failures.push(
      "messageFromApiPayload does not read details.fieldErrors between the message/error_description/detail loop and the bare error-code fallback"
    );
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const realFailures = inspect(real);
  if (realFailures.length !== 0) {
    console.error("verify-apierror-message-reads-fielderrors --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  // Mutate: drop the fieldErrors block entirely, simulating the pre-fix source.
  const mutated = real.replace(
    /\s*\/\/ APIERROR-MESSAGE-GETTER-DROPS-FIELDERRORS[\s\S]*?\n(\s*const err = o\.error;)/,
    "\n$1"
  );
  if (mutated === real) {
    console.error("verify-apierror-message-reads-fielderrors --selftest: mutation regex did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutated);
  if (mutatedFailures.length === 0) {
    console.error("verify-apierror-message-reads-fielderrors --selftest FAILED: mutation was not caught");
    process.exit(1);
  }
  console.log("verify-apierror-message-reads-fielderrors --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-apierror-message-reads-fielderrors FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-apierror-message-reads-fielderrors: OK — messageFromApiPayload reads details.fieldErrors before the bare error-code fallback");
