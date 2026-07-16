/**
 * Guard: postFuelExpenseFromEvent must have a production caller path after fuel.fuel_transactions land.
 * Prevents the 0441 "zero callers" regression.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

const maybePostPath = "apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.ts";
const ingestPath = "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.ts";
const cronPath = "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts";
const csvPath = "apps/backend/src/integrations/relay-payments/relay-fuel-csv-import.routes.ts";
const importRoutesPath = "apps/backend/src/fuel/fuel-transaction-import.routes.ts";

function read(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    errors.push(`missing ${rel}`);
    return "";
  }
  return fs.readFileSync(abs, "utf8");
}

const maybeSrc = read(maybePostPath);
const ingestSrc = read(ingestPath);
const cronSrc = read(cronPath);
const csvSrc = read(csvPath);
const importSrc = read(importRoutesPath);

if (maybeSrc && !maybeSrc.includes("postFuelExpenseFromEvent")) {
  errors.push(`${maybePostPath} must call postFuelExpenseFromEvent`);
}
if (maybeSrc && !maybeSrc.includes("EXPENSE_GL_POSTING_ENABLED")) {
  errors.push(`${maybePostPath} must gate on EXPENSE_GL_POSTING_ENABLED`);
}
if (maybeSrc && !maybeSrc.includes("isEnabled(")) {
  errors.push(`${maybePostPath} must call isEnabled(`);
}
if (ingestSrc && !ingestSrc.includes("gl_post_candidate")) {
  errors.push(`${ingestPath} must return gl_post_candidate for post-commit flush`);
}
if (cronSrc && !cronSrc.includes("flushFuelGlPostsAfterCommit")) {
  errors.push(`${cronPath} must flushFuelGlPostsAfterCommit after ingest commit`);
}
if (csvSrc && !csvSrc.includes("flushFuelGlPostsAfterCommit")) {
  errors.push(`${csvPath} must flushFuelGlPostsAfterCommit after CSV import commit`);
}
if (importSrc && !importSrc.includes("flushFuelGlPostsAfterCommit")) {
  errors.push(`${importRoutesPath} must flushFuelGlPostsAfterCommit after fleet-card import commit`);
}
// Never enable QBO push from this wiring.
for (const [rel, src] of [
  [maybePostPath, maybeSrc],
  [cronPath, cronSrc],
  [csvPath, csvSrc],
  [importRoutesPath, importSrc],
]) {
  if (src && /QBO_JE_PUSH_ENABLED\s*=\s*true|QBO_ENTITY_PUSH_ENABLED\s*=\s*true/.test(src)) {
    errors.push(`${rel} must not enable QBO push`);
  }
}

if (errors.length) {
  console.error("verify-fuel-gl-poster-callers FAIL:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("verify-fuel-gl-poster-callers OK — production callers + EXPENSE_GL_POSTING_ENABLED gate present");
