#!/usr/bin/env node
// Guard (standing-orders rule #10): the TRK/TRANSP/USMCA entity-independence LAW must survive every agent
// handoff. Asserts docs/specs/MULTI-ENTITY-SEPARATION.md retains the locked invariants — the three entities
// + ids, share-nothing, no-commingling, per-entity RLS scoped to accessible companies (no cross-entity),
// soft-delete + deactivation-trap rule, and the ih35_app-not-neondb_owner / strict-helper rule.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-multi-entity-separation: ${m}`); process.exit(1); };
let doc;
try { doc = readFileSync(join(root, "docs/specs/MULTI-ENTITY-SEPARATION.md"), "utf8"); }
catch { fail("docs/specs/MULTI-ENTITY-SEPARATION.md must exist — the entity-independence LAW"); }

// Three entities + their canonical ids (so they can't drift/evaporate).
const entities = [
  ["TRANSP", "91e0bf0a-133f-4ce8-a734-2586cfa66d96"],
  ["TRK", "b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e"],
  ["USMCA", "5c854333-6ea5-4faa-af31-67cb272fef80"],
];
for (const [code, id] of entities) {
  if (!doc.includes(code)) fail(`entity ${code} must be documented`);
  if (!doc.includes(id)) fail(`entity ${code} canonical operating_company_id (${id}) must be documented`);
}
// Core invariants (phrase-anchored — realign the phrase here if the doc is reworded, never delete the check).
const must = [
  [/completely independent/i, "must state the entities are completely independent"],
  [/share NOTHING|share nothing/i, "must state they share NOTHING"],
  [/commingl/i, "must state no commingling"],
  [/per-entity/i, "must require per-entity scoping (not global)"],
  [/user_accessible_company_ids/i, "must scope RLS to user_accessible_company_ids (within-entity only)"],
  [/never sees another entity|never across\s*\n?\s*entities|never cross-entity/i, "must forbid cross-entity visibility for elevated roles"],
  [/soft-delete|deactivated_at/i, "must require soft-delete (deactivated_at), never hard-delete"],
  [/deactivation trap/i, "must document the RLS deactivation-trap failure class + fix"],
  [/ih35_app/i, "must require the app pool run as ih35_app (RLS enforced)"],
  [/neondb_owner/i, "must forbid the neondb_owner superuser fallback (#878)"],
];
for (const [re, msg] of must) if (!re.test(doc)) fail(msg);
console.log("PASS verify-multi-entity-separation");
