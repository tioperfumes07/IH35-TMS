#!/usr/bin/env node
// LISTS-LOAD-CANCELLATION-REASONS-CREATE-DESCRIPTION-NULL-400 — guard
//
// Live-reproduced this session (/lists/dispatch/load-cancellation-reasons): "Create Entry" with
// Description left blank (the common case for this optional field) 400'd with
// fieldErrors.description: ["Invalid input: expected string, received null"] — the frontend's blank
// value is `null` (LoadCancellationReasonsListPage.tsx's onSave: `description: form.description ||
// null`), but createReasonBodySchema's description field was a bare `.optional()` (accepts undefined,
// rejects null). Compounding it: parseConflict() only ever read fieldErrors.reason_code, so
// setConflictError(null) left the modal showing NOTHING on the real 400 — a completely silent failure on
// an active "+ Create Entry" button. Confirmed live via direct fetch against prod: description:null ->
// 400 (no row persisted, confirmed via Neon); description:"real text" -> 201 (row created, then voided
// per CREATE-TEST-THEN-VOID). Fixed on both ends — this guard locks both.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const ROUTES_FILE = "apps/backend/src/catalogs/load-cancellation-reasons.routes.ts";
const PAGE_FILE = "apps/frontend/src/pages/lists/dispatch/LoadCancellationReasonsListPage.tsx";

export function check(routesText, pageText) {
  const failures = [];

  const createIdx = routesText.indexOf("export const createReasonBodySchema = z.object({");
  const createBlock = createIdx >= 0 ? routesText.slice(createIdx, createIdx + 1200) : "";
  if (!/description: z\.string\(\)\.trim\(\)\.max\(1000\)\.nullable\(\)\.optional\(\),/.test(createBlock)) {
    failures.push(`${ROUTES_FILE} createReasonBodySchema's description field no longer accepts null — a blank-Description create will 400 again`);
  }

  if (!/for \(const messages of Object\.values\(fieldErrors\)\) \{\s*\n\s*if \(messages\?\.\[0\]\) return messages\[0\];/.test(pageText)) {
    failures.push(`${PAGE_FILE} parseConflict no longer surfaces field errors from every field — a validation error on any field other than reason_code will be silently swallowed again`);
  }

  return failures;
}

function run() {
  const routesText = fs.readFileSync(path.join(root, ROUTES_FILE), "utf8");
  const pageText = fs.readFileSync(path.join(root, PAGE_FILE), "utf8");
  const failures = check(routesText, pageText);
  if (failures.length > 0) {
    console.error("FAIL: load-cancellation-reasons-create-description-null-400");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Load Cancellation Reasons Create Entry accepts a blank Description and never silently swallows a validation error");
}

function selftest() {
  const routesText = fs.readFileSync(path.join(root, ROUTES_FILE), "utf8");
  const pageText = fs.readFileSync(path.join(root, PAGE_FILE), "utf8");

  const offenderRoutes = routesText.replace(
    "description: z.string().trim().max(1000).nullable().optional(),\n});",
    "description: z.string().trim().max(1000).optional(),\n});"
  );
  if (offenderRoutes === routesText) {
    console.error("FAIL(selftest): offender mutation A did not change the routes file — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(offenderRoutes, pageText);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (schema no longer nullable) was NOT caught");
    process.exit(1);
  }

  const offenderPage = pageText.replace(
    /const fieldErrors = data\?\.details\?\.fieldErrors;[\s\S]*?return null;\n\}/,
    "return data?.details?.fieldErrors?.reason_code?.[0] ?? null;\n}"
  );
  if (offenderPage === pageText) {
    console.error("FAIL(selftest): offender mutation B did not change the page file — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(routesText, offenderPage);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (parseConflict reverted to reason_code-only) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): 2/2 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
