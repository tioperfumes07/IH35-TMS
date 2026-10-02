#!/usr/bin/env node
/**
 * ROUND 342 — v_factor_reserve_balance / reserve-balance field trap.
 *
 * After CC-1 renames factoring.reserve_movement.tenant_id → operating_company_id, the view
 * factoring.v_factor_reserve_balance OUTPUT field renames with it. Reading row.tenant_id alone
 * yields undefined — a blank reserve balance is indistinguishable from zero.
 *
 * Static contract:
 *  - reserve.service maps company via operating_company_id ?? tenant_id (companyIdFromRow)
 *  - FactorReserveBalanceRow / ReserveMovementRow expose operating_company_id
 *  - FE api/factoring.ts Factor / Batch / ReserveMovement types expose operating_company_id
 *  - No live SELECT of tenant_id FROM factoring.v_factor_reserve_balance in apps/
 */
export const ALLOW_OFFLINE_SKIP =
  "static wiring always runs; live view column rename lands with CC-1";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-r342-factor-reserve-oci-field";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(hay, needle, why) {
  if (!hay.includes(needle)) {
    console.error(`${LABEL}: FAIL — ${why}\n  missing: ${needle}`);
    process.exit(1);
  }
}

function assertNotIncludes(hay, needle, why) {
  if (hay.includes(needle)) {
    console.error(`${LABEL}: FAIL — ${why}\n  forbidden: ${needle}`);
    process.exit(1);
  }
}

function selftest() {
  const reserve = read("apps/backend/src/factoring/reserve.service.ts");
  const fe = read("apps/frontend/src/api/factoring.ts");
  assertIncludes(reserve, "companyIdFromRow", "mapper must accept OCI or tenant_id");
  assertIncludes(reserve, "operating_company_id ?? row.tenant_id", "fallback order OCI first");
  assertIncludes(reserve, "operating_company_id: companyId", "balance/movement rows emit OCI");
  assertIncludes(fe, "operating_company_id?: string", "FE Factor/Batch types expose OCI");
  // Live SELECT of the view by tenant_id alone is the blank-balance trap.
  const appsDir = path.join(ROOT, "apps");
  const offenders = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name === "dist") continue;
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|mjs)$/.test(ent.name)) {
        const t = fs.readFileSync(p, "utf8");
        if (/SELECT[\s\S]{0,200}tenant_id[\s\S]{0,200}FROM\s+factoring\.v_factor_reserve_balance/i.test(t)) {
          offenders.push(path.relative(ROOT, p));
        }
      }
    }
  }
  walk(appsDir);
  if (offenders.length) {
    console.error(`${LABEL}: FAIL — SELECT tenant_id FROM v_factor_reserve_balance:\n  ${offenders.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — OCI field trap wiring present; 0 live view tenant_id SELECTs`);
}

if (process.argv.includes("--selftest") || !process.env.DATABASE_URL) {
  selftest();
  process.exit(0);
}

selftest();
console.log(`${LABEL}: LIVE INFO — view column rename is CC-1's job; static trap guard holds`);
process.exit(0);
