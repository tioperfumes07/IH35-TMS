#!/usr/bin/env node
// PROPERTY-TAX-RENDITION-ID-PARAM-UNVALIDATED-500: the 4 :id routes on
// property-tax.routes.ts cast req.params without validation, so a non-uuid value (a
// stale/bookmarked literal ":id", a bot probe, a copy-paste error) reached
// getRendition()/updateRendition()/addRenditionLine()'s `r.id = $N::uuid` comparisons as a raw
// Postgres 500 instead of a clean 400 -- confirmed live (Sentry IH35-TMS-PROD-46, the literal
// string ":id" reaching the query). Guard requires all 4 :id route handlers to validate via
// idParamSchema before extracting id.
import fs from "node:fs";

const FILE = "apps/backend/src/compliance/property-tax/property-tax.routes.ts";

function inspect(source) {
  const failures = [];

  if (!/const idParamSchema = z\.object\(\{ id: z\.string\(\)\.uuid\(\) \}\);/.test(source)) {
    failures.push("idParamSchema is missing");
  }
  const validatedCount = (source.match(/const paramsResult = idParamSchema\.safeParse\(req\.params\);/g) ?? []).length;
  if (validatedCount < 4) {
    failures.push(`expected 4 :id route handlers to validate via idParamSchema, found ${validatedCount}`);
  }
  if (/const \{ id \} = req\.params as \{ id: string \};/.test(source)) {
    failures.push("at least one :id route handler still casts req.params without validation");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const realFailures = inspect(real);
  if (realFailures.length !== 0) {
    console.error("verify-property-tax-rendition-id-param-validated --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  // Mutate exactly one call site back to the unvalidated cast (the first GET /renditions/:id one).
  const mutated = real.replace(
    'const paramsResult = idParamSchema.safeParse(req.params);\n    if (!paramsResult.success) return reply.code(400).send({ error: "validation_error", details: paramsResult.error.flatten() });\n    const { id } = paramsResult.data;',
    'const { id } = req.params as { id: string };'
  );
  if (mutated === real) {
    console.error("verify-property-tax-rendition-id-param-validated --selftest: mutation did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutated);
  if (mutatedFailures.length === 0) {
    console.error("verify-property-tax-rendition-id-param-validated --selftest FAILED: mutation was not caught");
    process.exit(1);
  }
  console.log("verify-property-tax-rendition-id-param-validated --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-property-tax-rendition-id-param-validated FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-property-tax-rendition-id-param-validated: OK — all 4 :id routes validate the param via idParamSchema before use");
