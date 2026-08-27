#!/usr/bin/env node
// LISTS-TERMINATION-REASONS-PARSE-CONFLICT-NARROW-FIELD — guard
//
// TerminationReasonsListPage.tsx's parseConflict() used to read ONLY fieldErrors.code — a validation
// error on any other field (label, description, severity) was silently swallowed, the same class of bug
// LISTS-LOAD-CANCELLATION-REASONS-CREATE-DESCRIPTION-NULL-400 (#16702) fixed for the sibling catalog.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const PAGE_FILE = "apps/frontend/src/pages/lists/drivers/TerminationReasonsListPage.tsx";

export function check(text) {
  const failures = [];
  if (!/for \(const messages of Object\.values\(fieldErrors\)\) \{\s*\n\s*if \(messages\?\.\[0\]\) return messages\[0\];/.test(text)) {
    failures.push(`${PAGE_FILE} parseConflict no longer surfaces field errors from every field`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, PAGE_FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: lists-termination-reasons-parse-conflict-any-field");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: TerminationReasonsListPage surfaces a validation error from any field, not just code");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, PAGE_FILE), "utf8");
  const offender = text.replace(
    /const fieldErrors = data\?\.details\?\.fieldErrors;[\s\S]*?return null;\n\}/,
    "return data?.details?.fieldErrors?.code?.[0] ?? null;\n}"
  );
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (reverted to code-only) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
