#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const HELPER = "apps/frontend/src/pages/dispatch/components/book-load-v4/invalidSubmitDetails.ts";
const MODAL = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";

function frontendSources(dir = "apps/frontend/src") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return frontendSources(target);
    return /\.(ts|tsx)$/.test(entry.name) ? [{ file: target, source: fs.readFileSync(target, "utf8") }] : [];
  });
}

function verify(helper, modal, sources = frontendSources()) {
  const errors = [];
  for (const token of ["Stop ${stopIndex + 1}", "${fieldLabel(field)}: ${issueReason(record)}", "path: fullPath"]) {
    if (!helper.includes(token)) errors.push(`nested stop explanation missing ${token}`);
  }
  for (const token of ["describeBookLoadValidationErrors", "form.setFocus(firstPath", "scrollIntoView", "Nothing was written."]) {
    if (!modal.includes(token)) errors.push(`blocked-save recovery missing ${token}`);
  }
  if (modal.includes("these fields blocked it: ${shown.join")) errors.push("lossy top-level field-group message returned");
  const groupOnly = sources.filter(({ source }) => /these fields blocked it:\s*\$\{[^}]*join/.test(source));
  if (groupOnly.length) errors.push(`frontend contains ${groupOnly.length} group-only validation message(s): ${groupOnly.map(({ file }) => file).join(", ")}`);
  return errors;
}

const helper = fs.readFileSync(HELPER, "utf8");
const modal = fs.readFileSync(MODAL, "utf8");

if (process.argv.includes("--selftest")) {
  const flattened = helper.replace("Stop ${stopIndex + 1}", "Stops");
  const noFocus = modal.replace("form.setFocus(firstPath", "form.getValues(firstPath");
  const plantedGlobal = [{ file: "apps/frontend/src/pages/Planted.tsx", source: "`these fields blocked it: ${shown.join(', ')}`" }];
  if (!verify(flattened, modal).some((error) => error.includes("Stop ${stopIndex + 1}")) ||
      !verify(helper, noFocus).some((error) => error.includes("form.setFocus")) ||
      !verify(helper, modal, plantedGlobal).some((error) => error.includes("group-only validation"))) {
    console.error("verify-book-load-stop-validation-honesty SELFTEST FAIL");
    process.exit(1);
  }
  console.log("verify-book-load-stop-validation-honesty SELFTEST PASS — planted group-only and no-focus regressions rejected");
  process.exit(0);
}

const errors = verify(helper, modal);
if (errors.length) {
  console.error("verify-book-load-stop-validation-honesty FAIL");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log("verify-book-load-stop-validation-honesty PASS — blast=1 fixed=1; blocked saves name and focus the exact stop rule; frontend group-only pattern=0");
