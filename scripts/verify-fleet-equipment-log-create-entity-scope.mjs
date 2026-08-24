#!/usr/bin/env node
/**
 * FLT-F6163-EQUIPMENT-LOG-POST-UNSCOPED-FK-WRITE — POST /api/v1/mdata/equipment-log inserted
 * caller-supplied equipment/unit/location UUIDs with no operating_company_id resolved, no GUC set,
 * and no FK-ownership check. A foreign key only proves the row exists SOMEWHERE — never that it
 * belongs to the acting entity — so an Owner session (RLS is not a scope backstop for Owner, per
 * law-of-the-land) could write a cross-entity equipment-history edge (e.g. USMCA equipment coupled
 * to a TRK unit at a TRANSP location) with zero rejection.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fleet-equipment-log-create-entity-scope";
const FILE = "apps/backend/src/mdata/equipment-log.routes.ts";

export function collectProblems(src) {
  const problems = [];
  if (!src.includes("operating_company_id: z.string().uuid(),\n  equipment_id: z.string().uuid()")) {
    problems.push(`${FILE}: createEquipmentLogBodySchema must require operating_company_id`);
  }
  if (!src.includes("await resolveOperatingCompanyId(client, authUser.uuid, b.operating_company_id)")) {
    problems.push(`${FILE}: POST handler must resolve the caller's operating_company_id via resolveOperatingCompanyId before any write`);
  }
  if (!/FROM mdata\.equipment e[\s\S]{0,80}e\.id = \$2[\s\S]{0,80}e\.owner_company_id = \$1[\s\S]{0,40}e\.currently_leased_to_company_id = \$1/.test(src)) {
    problems.push(`${FILE}: POST must validate equipment_id belongs (owner or lease) to the resolved company before insert`);
  }
  if (!/FROM mdata\.units u[\s\S]{0,120}u\.owner_company_id = \$1[\s\S]{0,40}u\.currently_leased_to_company_id = \$1/.test(src)) {
    problems.push(`${FILE}: POST must validate any from_unit_id/to_unit_id belongs (owner or lease) to the resolved company`);
  }
  if (!/FROM mdata\.locations loc[\s\S]{0,60}loc\.operating_company_id = \$1/.test(src)) {
    problems.push(`${FILE}: POST must validate any from_location_id/to_location_id belongs to the resolved company`);
  }
  if (!src.includes('throw new Error("equipment_log_entity_not_in_operating_company")')) {
    problems.push(`${FILE}: POST must reject the write when any linked entity fails the ownership check`);
  }
  return problems;
}

const good = `
const createEquipmentLogBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  equipment_id: z.string().uuid(),
});
        const scopedCompanyId = await resolveOperatingCompanyId(client, authUser.uuid, b.operating_company_id);
        const links = await client.query(
          \`SELECT
             EXISTS (
               SELECT 1 FROM mdata.equipment e
               WHERE e.id = $2 AND (e.owner_company_id = $1 OR e.currently_leased_to_company_id = $1)
             ) AS equipment_ok,
             (\$3::uuid IS NULL OR EXISTS (
               SELECT 1 FROM mdata.units u
               WHERE u.id = $3 AND (u.owner_company_id = $1 OR u.currently_leased_to_company_id = $1)
             )) AS from_unit_ok,
             (\$5::uuid IS NULL OR EXISTS (
               SELECT 1 FROM mdata.locations loc WHERE loc.id = $5 AND loc.operating_company_id = $1
             )) AS from_location_ok\`,
        );
        if (!integrity?.equipment_ok) {
          throw new Error("equipment_log_entity_not_in_operating_company");
        }
`;
const bad = `
const createEquipmentLogBodySchema = z.object({
  equipment_id: z.string().uuid(),
});
      const created = await withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          \`INSERT INTO mdata.equipment_log (equipment_id) VALUES ($1)\`,
          [b.equipment_id]
        );
        return res.rows[0];
      });
`;

if (process.argv.includes("--selftest")) {
  if (collectProblems(good).length) {
    console.error(`${LABEL} --selftest FAIL good`);
    process.exit(1);
  }
  if (collectProblems(bad).length < 5) {
    console.error(`${LABEL} --selftest FAIL bad too weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — equipment-log create resolves company and validates every linked FK belongs to it`);
process.exit(0);
