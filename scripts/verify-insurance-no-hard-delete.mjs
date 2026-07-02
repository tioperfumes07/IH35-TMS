#!/usr/bin/env node
// verify-insurance-no-hard-delete.mjs — evidence-preservation regression guard.
//
// insurance.policy has ON DELETE CASCADE children: claims + lawsuit links (0285), COI (0283),
// payment_schedule (0284), policy_units (0274). A hard `DELETE FROM insurance.policy` therefore
// silently destroys legal/insurance EVIDENCE (claims, lawsuits) — unacceptable for a carrier with
// active litigation, and a direct violation of §2 void-not-delete. The delete endpoint must
// soft-cancel (UPDATE status='cancelled') instead. This static guard fails if any backend source
// re-introduces a hard DELETE against insurance.policy (or its evidence children).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src/insurance");

// Tables whose rows are legal/insurance evidence (or CASCADE-parent them). Never hard-DELETE.
const PROTECTED = ["insurance.policy", "insurance.claim", "insurance.lawsuit", "insurance.claims", "insurance.lawsuits"];

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

if (!fs.existsSync(SRC)) {
  console.log("[insurance-no-hard-delete] SKIP — apps/backend/src/insurance not present.");
  process.exit(0);
}

const errs = [];
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, "utf8");
  // Strip JS comments so the guard only inspects real code (SQL lives in template literals, never in
  // // or /* */ comments) — otherwise an explanatory comment mentioning the pattern self-trips it.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");
  const flat = code.replace(/\s+/g, " ");
  for (const tbl of PROTECTED) {
    const re = new RegExp(`DELETE\\s+FROM\\s+${tbl.replace(".", "\\.")}\\b`, "i");
    if (re.test(flat)) {
      errs.push(`${path.relative(ROOT, file)}: hard DELETE FROM ${tbl} — CASCADE destroys claims/lawsuit evidence. Soft-cancel (UPDATE status='cancelled') instead (§2 void-not-delete).`);
    }
  }
}

if (errs.length === 0) {
  console.log("[insurance-no-hard-delete] PASS — no hard DELETE against insurance.policy / claim / lawsuit; evidence preserved via soft-cancel.");
  process.exit(0);
}
console.error("\nINSURANCE-NO-HARD-DELETE GUARD FAILED (evidence-destruction risk)");
console.error("=".repeat(72));
for (const e of errs) console.error("  " + e);
console.error("=".repeat(72));
process.exit(1);
