#!/usr/bin/env node
/**
 * 2663 — ACCEPTED-BUT-NEVER-WRITTEN guard for the driver create path.
 *
 * THE CLASS THIS EXISTS FOR (live, 2026-08-08, prod):
 *   `mdata.drivers` carries `date_of_birth`, `mexican_license_number`, `mexican_license_expiration`
 *   and `passport_country`. All four were NULL on 188 of 188 drivers, because `createDriverBodySchema`
 *   named none of them AND the canonical INSERT named none of them. A driver created through the
 *   product stored NULL with no warning and no error — the request was accepted and the data dropped.
 *   49 CFR 391.21(b)(2) makes DOB a statutory element of the driver application, and 391.21(b)(5)
 *   requires the licence held — for B-1 Mexican drivers under reciprocity that is the Licencia
 *   Federal, which the US `cdl_number` column cannot carry.
 *
 * WHY A FORM-ONLY FIX WOULD NOT HAVE BEEN ENOUGH, and why this guard is static-but-real:
 *   adding an input to the UI would have made the field *submittable* and still not *stored*. The
 *   only durable invariant is that every field the request schema ACCEPTS is either written to a
 *   column or explicitly declared as a non-persisted control flag. That is what is asserted here.
 *
 * FAILS WHEN: a key is added to `createDriverBodySchema` and not to the INSERT column list, and it
 * is not in CONTROL_FIELDS. Passing requires a deliberate decision either way — which is the point.
 *
 * Static only: no DB, no network, sub-second. Reads the route source as text on purpose, so it keeps
 * working when the code is refactored around it.
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ROUTE = join(ROOT, "apps/backend/src/mdata/drivers.routes.ts");

/**
 * Request fields that legitimately do NOT map to an `mdata.drivers` column. Each is a control flag
 * consumed by the handler, not driver data. Adding to this list is a decision a reviewer can see.
 */
const CONTROL_FIELDS = new Set([
  "identity_user_id", // resolved/created, then written as identity_user_id — handled separately below
  "create_login_user", // drives login provisioning, not a column
  "operating_company_id", // resolved to resolvedOperatingCompanyId, written
  "preferred_language", // lives on identity.users, not mdata.drivers
  "override_returning_warning", // rehire acknowledgement, consumed by the handler
  // roster-duplicate acknowledgement, read at drivers.routes.ts:402 to skip the 409 and never stored
  "override_duplicate_warning",
  "send_invite", // OUTBOUND CONSENT: gates the WhatsApp invite; deliberately not persisted
]);

/** Fields the INSERT writes under a different name than the request field. */
const ALIASES = new Map([["identity_user_id", "identity_user_id"]]);

function fail(msg) {
  console.error(`verify-driver-create-fields-are-written FAILED — ${msg}`);
  process.exit(1);
}

if (!existsSync(ROUTE)) fail(`route file not found: ${ROUTE}`);
const src = readFileSync(ROUTE, "utf8");

// ---- 1. the request schema's field names -----------------------------------------------------
const schemaStart = src.indexOf("const createDriverBodySchema = z.object({");
if (schemaStart === -1) fail("createDriverBodySchema not found — the guard's anchor moved");
// Walk braces from the opening `{` of z.object( so nested objects/comments cannot end it early.
const objOpen = src.indexOf("{", schemaStart + "const createDriverBodySchema = z.object(".length);
let depth = 0;
let schemaEnd = -1;
for (let i = objOpen; i < src.length; i++) {
  if (src[i] === "{") depth++;
  else if (src[i] === "}") {
    depth--;
    if (depth === 0) {
      schemaEnd = i;
      break;
    }
  }
}
if (schemaEnd === -1) fail("could not find the end of createDriverBodySchema");
const schemaBody = src.slice(objOpen, schemaEnd);
// Top-level keys only: `  name: ...` at two-space indent, ignoring comments.
const schemaFields = new Set(
  [...schemaBody.matchAll(/^\s{2}([a-z_][a-z0-9_]*)\s*:/gim)].map((m) => m[1])
);
if (schemaFields.size === 0) fail("parsed zero fields from createDriverBodySchema");

// ---- 2. the canonical INSERT's column list ----------------------------------------------------
const insertIdx = src.indexOf("INSERT INTO mdata.drivers (");
if (insertIdx === -1) fail("canonical `INSERT INTO mdata.drivers (` not found");
const colsOpen = src.indexOf("(", insertIdx + "INSERT INTO mdata.drivers".length);
const colsClose = src.indexOf(")", colsOpen);
if (colsClose === -1) fail("could not find the end of the INSERT column list");
const insertColumns = new Set(
  src
    .slice(colsOpen + 1, colsClose)
    .split(",")
    .map((c) => c.replace(/--.*$/gm, "").trim())
    .filter(Boolean)
);
if (insertColumns.size === 0) fail("parsed zero columns from the INSERT");

// ---- 3. every accepted field is written, or declared as control ------------------------------
const dropped = [];
for (const field of schemaFields) {
  if (CONTROL_FIELDS.has(field)) continue;
  const column = ALIASES.get(field) ?? field;
  if (!insertColumns.has(column)) dropped.push(field);
}

if (dropped.length > 0) {
  console.error(
    "verify-driver-create-fields-are-written FAILED — createDriverBodySchema ACCEPTS these fields " +
      "and the canonical INSERT never writes them, so a caller's data is silently dropped:\n" +
      dropped.map((f) => `  - ${f}`).join("\n") +
      "\n\nAdd each to the INSERT column list AND its values array (lockstep), or, if it is a control " +
      "flag rather than driver data, add it to CONTROL_FIELDS in this guard with a reason.\n" +
      "This is the class that left date_of_birth / mexican_license_number / mexican_license_expiration / " +
      "passport_country NULL on 188 of 188 drivers."
  );
  process.exit(1);
}

// ---- 4. the four statutory/parity fields must never regress out of either end -----------------
const REQUIRED = [
  ["date_of_birth", "49 CFR 391.21(b)(2) — statutory element of the driver application"],
  ["mexican_license_number", "49 CFR 391.21(b)(5) — Licencia Federal under B-1 reciprocity"],
  ["mexican_license_expiration", "49 CFR 391.21(b)(5) — licence validity"],
  ["passport_country", "cross-border identity; column exists and was unreachable"],
];
const missing = REQUIRED.filter(
  ([f]) => !schemaFields.has(f) || !insertColumns.has(f)
).map(([f, why]) => `  - ${f} — ${why}`);
if (missing.length > 0) {
  fail(
    "these fields must be BOTH accepted and written; one end is missing:\n" +
      missing.join("\n") +
      "\nRemoving either end reintroduces the NULL-on-every-driver defect."
  );
}

// ---- 5. outbound consent: creating a record must not message a human --------------------------
if (!/send_invite\s*===\s*true/.test(src)) {
  fail(
    "the driver invite is not gated on an explicit `send_invite === true`. Creating a record must " +
      "not dispatch a WhatsApp invite as a side effect — a placeholder driver with a real number " +
      "would message that person with a live invite link."
  );
}
if (!/is_sample_data\s*!==\s*true/.test(src)) {
  fail(
    "the driver invite is not suppressed for `is_sample_data` drivers. A QA/battery driver must " +
      "never trigger an outbound message."
  );
}

console.log(
  `verify-driver-create-fields-are-written OK — ${schemaFields.size} accepted fields, ` +
    `${insertColumns.size} written columns, 0 dropped; 4 statutory/parity fields present at both ends; ` +
    `invite gated on send_invite and suppressed for sample data`
);
