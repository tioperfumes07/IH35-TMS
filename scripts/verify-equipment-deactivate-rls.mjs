#!/usr/bin/env node
// Guard: the equipment + units /deactivate (soft-delete) endpoints must NOT use a RETURNING clause on
// the soft-delete UPDATE.
//
// Root cause of the live 42501 (diagnostic PR #1130, prod build a2f94ea): equipment_select / units_select
// USING require `deactivated_at IS NULL`. The deactivate UPDATE sets deactivated_at, so the mutated row is
// instantly SELECT-invisible. `UPDATE ... RETURNING` re-reads that mutated row under the SELECT policy
// (Postgres enforces SELECT policies on RETURNING rows in ExecWithCheckOptions) → "new row violates RLS
// for table equipment" (42501) even for an Owner whose equipment_update WITH CHECK passes. The fix derives
// the response from the pre-update SELECT + the timestamp we write, and never RETURNINGs a soft-deleted row.
//
// RLS stays ON; soft-delete only (void-not-delete); runs inside withCurrentUser. Per-entity.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => {
  console.error(`FAIL verify-equipment-deactivate-rls: ${m}`);
  process.exit(1);
};

for (const [file, table] of [
  ["apps/backend/src/mdata/equipment.routes.ts", "equipment"],
  ["apps/backend/src/mdata/units.routes.ts", "units"],
]) {
  const src = read(file);
  // Locate the /deactivate handler.
  const idx = src.indexOf(`/api/v1/mdata/${table}/:id/deactivate`);
  if (idx < 0) fail(`${table} /deactivate endpoint missing`);
  const window = src.slice(idx, idx + 4500);

  // Must run inside the per-user RLS context wrapper (same as the working customers/drivers deactivates).
  if (!/withCurrentUser\(/.test(window)) {
    fail(`${table} /deactivate must run inside withCurrentUser (sets app.current_user_id for RLS)`);
  }

  // Must be soft-delete, never a hard DELETE.
  if (new RegExp(`DELETE FROM mdata\\.${table}`).test(window)) {
    fail(`${table} inactivate must be soft-delete, never DELETE`);
  }

  // Isolate the soft-delete UPDATE statement (the SQL lives in a template literal — read to the next
  // backtick) and assert it sets deactivated_at and does NOT RETURNING the now-SELECT-invisible row.
  const updStart = window.search(new RegExp(`UPDATE mdata\\.${table}`));
  if (updStart < 0) fail(`${table} /deactivate soft-delete UPDATE missing`);
  const updEnd = window.indexOf("`", updStart);
  const updSql = updEnd > updStart ? window.slice(updStart, updEnd) : window.slice(updStart);
  if (!/deactivated_at\s*=/.test(updSql)) {
    fail(`${table} /deactivate UPDATE must set deactivated_at (soft-delete marker)`);
  }
  if (/RETURNING/i.test(updSql)) {
    fail(
      `${table} /deactivate soft-delete UPDATE must NOT use RETURNING — it re-reads the mutated row under ` +
        `${table}_select (deactivated_at IS NULL) and throws 42501. Derive the response from the pre-update SELECT.`
    );
  }
}

console.log("PASS verify-equipment-deactivate-rls");
