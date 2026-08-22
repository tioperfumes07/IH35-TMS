#!/usr/bin/env node
/**
 * verify-customer-create-required-field-error-has-toast.mjs
 *
 * ROOT CAUSE (live-pinned 2026-08-22): both Customer-create paths (the inline picker drawer,
 * NewCustomerDrawerForm.tsx, and the standalone Customers.tsx page create form) share
 * validateCustomerProfileForCreate()'s 3 required-field codes (legal_name_required /
 * customer_type_required / email_required). Their onError handlers set an INLINE field error and
 * `return` early -- unlike every other error path in the same handler, which also calls
 * pushToast(...). Both forms are long/scrollable; a user who fills the top fields, scrolls to the
 * bottom, and clicks Save sees the inline error rendered off the TOP of a long form (confirmed
 * live: getBoundingClientRect().top === -3303 relative to the scrolled Save button) with ZERO
 * toast, ZERO visible feedback -- indistinguishable from a dead button / silent no-op. Live-
 * reproduced via a real Create Customer submit (USMCA): fetch never fired, no visible error at
 * the current scroll position, DOM query confirmed a real (but off-screen) "Email is required"
 * span.
 *
 * INVARIANT (static -- no database): in both files, each of the 3 required-field `onError`
 * branches (legal_name_required / customer_type_required / email_required) must call
 * `pushToast(` somewhere in the same branch body, not just `setFieldErrors`/`setCreateFieldErrors`.
 *
 * Self-test: node scripts/verify-customer-create-required-field-error-has-toast.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-customer-create-required-field-error-has-toast";

const FILES = [
  "apps/frontend/src/components/parity/drawers/NewCustomerDrawerForm.tsx",
  "apps/frontend/src/pages/Customers.tsx",
];
const CODES = ["legal_name_required", "customer_type_required", "email_required"];

export function findMissingToastCodes(src) {
  const missing = [];
  for (const code of CODES) {
    // Find the `if (...code === "<code>") { ... }` block and check it contains pushToast(
    // before its closing brace. Scoped to a single `if` block via brace-depth tracking so we
    // don't accidentally match pushToast calls that belong to a DIFFERENT branch.
    const codeIdx = src.indexOf(`"${code}"`);
    if (codeIdx === -1) continue; // code not present in this file at all -- not this guard's concern
    const braceStart = src.indexOf("{", codeIdx);
    if (braceStart === -1) continue;
    let depth = 0;
    let end = braceStart;
    for (let i = braceStart; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    const block = src.slice(braceStart, end);
    if (!block.includes("pushToast(")) {
      missing.push(code);
    }
  }
  return missing;
}

function staticCheck() {
  const failures = [];
  for (const rel of FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      failures.push(`${rel}: file missing`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    const missing = findMissingToastCodes(src);
    for (const code of missing) {
      failures.push(
        `${rel}: "${code}" branch sets a field error but never calls pushToast(...) -- ` +
          `invisible if the field is scrolled out of view (SILENT-VALIDATION-OFFSCREEN).`
      );
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const bad = `
    if (code === "email_required") {
      setFieldErrors({ email: "Email is required" });
      return;
    }
  `;
  const badMissing = findMissingToastCodes(bad);
  if (badMissing.length !== 1 || badMissing[0] !== "email_required") {
    console.error(`${LABEL} SELFTEST FAIL -- missing pushToast was not caught`);
    process.exit(1);
  }

  const good = `
    if (code === "email_required") {
      setFieldErrors({ email: "Email is required" });
      pushToast("Email is required", "error");
      return;
    }
  `;
  if (findMissingToastCodes(good).length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL -- correct pushToast-present branch was wrongly flagged`);
    process.exit(1);
  }

  const absent = `if (code === "some_other_code") { setFieldErrors({}); return; }`;
  if (findMissingToastCodes(absent).length !== 0) {
    console.error(`${LABEL} SELFTEST FAIL -- a file with none of the 3 codes present was wrongly flagged`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS -- missing-toast branch caught, correct/absent shapes accepted`);
  process.exit(0);
}

const failures = staticCheck();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK -- both Customer-create paths toast on every required-field validation code`);
