#!/usr/bin/env node
// Guard: the equipment + units /deactivate (soft-delete) endpoints set the tenant session context
// (app.operating_company_id, scoped to the row's own company) BEFORE the UPDATE — otherwise the
// RLS check rejects the soft-delete row (Postgres 42501) and inactivate 500s. Matches the working
// bulk-update path. RLS stays ON; per-entity.
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
  // Within a window of the handler: it reads the row's company and sets the tenant context before
  // the UPDATE.
  const window = src.slice(idx, idx + 4500);
  if (!/owner_company_id|currently_leased_to_company_id/.test(window)) {
    fail(`${table} /deactivate must read the row's company (owner_company_id / currently_leased_to_company_id)`);
  }
  if (!/set_config\('app\.operating_company_id'/.test(window)) {
    fail(`${table} /deactivate must SET app.operating_company_id before the UPDATE (RLS context)`);
  }
  const setPos = window.indexOf("set_config('app.operating_company_id'");
  const updPos = window.search(new RegExp(`UPDATE mdata\\.${table}`));
  if (setPos < 0 || updPos < 0 || setPos > updPos) {
    fail(`${table} /deactivate must set the tenant context BEFORE the UPDATE`);
  }
  if (new RegExp(`DELETE FROM mdata\\.${table}`).test(window)) fail(`${table} inactivate must be soft-delete, never DELETE`);
}

console.log("PASS verify-equipment-deactivate-rls");
