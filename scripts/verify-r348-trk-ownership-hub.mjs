#!/usr/bin/env node
/**
 * ROUND 348 — TRK ownership hub remaster (equipment 112 + units 3 + assets owning_entity).
 * Structural: migration file shape. Live (DATABASE_URL): before/after counts + 9 NULLs +
 * policy_unit resolve to TRK-owned/leased-USMCA + composite FK refuse mismatched insert on fork.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const ALLOW_OFFLINE_SKIP =
  "structural asserts migration SQL shape; live Neon census only when DATABASE_URL is set";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-r348-trk-ownership-hub";
const MIG = "db/migrations/202615321200_r348_trk_ownership_hub.sql";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const UNLINKED_EXPECTED = [
  "CODEX-AUDIT-UNIT-20260816-0349",
  "CODEX-LEGAL-UNIT-20260816-1506",
  "CODEX-TEST-0033",
  "DEVIN-A-210001",
  "T-TESTMTDP79YF",
  "TEST-CC3-FLEET-001",
  "TEST-CODEX-956214",
  "TEST-U01",
  "TEST-UNIT-20260806-01",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertIncludes(src, needle, where) {
  if (!src.includes(needle)) throw new Error(`${where}: missing ${JSON.stringify(needle)}`);
}

function structural() {
  const sql = read(MIG);
  assertIncludes(sql, "ROUND 348", MIG);
  assertIncludes(sql, "org.companies", MIG);
  assertIncludes(sql, "trk.code = 'TRK'", MIG);
  assertIncludes(sql, "usmca.code = 'USMCA'", MIG);
  assertIncludes(sql, "UPDATE mdata.equipment", MIG);
  assertIncludes(sql, "UPDATE mdata.units", MIG);
  assertIncludes(sql, "owning_company_id", MIG);
  assertIncludes(sql, "owning_entity = c.code", MIG);
  assertIncludes(sql, "assets_unit_owner_same_entity_fkey", MIG);
  assertIncludes(sql, "assets_equipment_owner_same_entity_fkey", MIG);
  assertIncludes(sql, "NOT VALID", MIG);
  assertIncludes(sql, "VALIDATE CONSTRAINT", MIG);
  // Never paste uuid literals for company ids — resolve by code.
  if (/owner_company_id\s*=\s*'[0-9a-f-]{36}'/i.test(sql)) {
    throw new Error(`${MIG}: must resolve company ids by org.companies.code, never paste uuid`);
  }
  // Do not touch TRANSP assets / insurance / factoring.
  if (/UPDATE\s+mdata\.assets[\s\S]*TRANSP/i.test(sql) && /tenant_id.*TRANSP/i.test(sql)) {
    throw new Error(`${MIG}: must not rewrite TRANSP-tenant assets`);
  }
  assertIncludes(sql, "NOT NULL on owning_entity deferred", MIG);
  console.log(`${LABEL}: structural PASS`);
}

async function live() {
  const url = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL;
  if (!url) {
    console.log(`${LABEL}: live SKIP — no DATABASE_URL (structural only)`);
    return;
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const equipUs = await client.query(
      `SELECT count(*)::int AS n FROM mdata.equipment e
         JOIN org.companies c ON c.id = e.owner_company_id
        WHERE c.code = 'USMCA'`,
    );
    const unitsUs = await client.query(
      `SELECT count(*)::int AS n FROM mdata.units u
         JOIN org.companies c ON c.id = u.owner_company_id
        WHERE c.code = 'USMCA'`,
    );
    const assetsPop = await client.query(
      `SELECT count(*) FILTER (WHERE owning_entity IS NOT NULL)::int AS filled,
              count(*) FILTER (WHERE owning_entity IS NULL)::int AS blank
         FROM mdata.assets WHERE operating_company_id = $1::uuid`,
      [USMCA],
    );
    const blanks = await client.query(
      `SELECT unit_code FROM mdata.assets
        WHERE operating_company_id = $1::uuid AND owning_entity IS NULL
        ORDER BY unit_code`,
      [USMCA],
    );
    const policy = await client.query(
      `SELECT count(*)::int AS n,
              count(*) FILTER (WHERE own.code = 'TRK' AND lease.code = 'USMCA')::int AS trk_leased_usmca,
              count(*) FILTER (WHERE own.code = 'TRANSP' AND lease.code = 'USMCA')::int AS transp_leased_usmca,
              count(*) FILTER (WHERE a.owning_entity IS NULL)::int AS unlinked_null
         FROM insurance.policy_unit pu
         JOIN mdata.assets a ON a.id = pu.asset_id
         LEFT JOIN org.companies own ON own.id = a.owning_company_id
         LEFT JOIN mdata.units u ON u.id = a.unit_id
         LEFT JOIN mdata.equipment e ON e.id = a.equipment_id
         LEFT JOIN org.companies lease ON lease.id = COALESCE(
           u.currently_leased_to_company_id, e.currently_leased_to_company_id
         )
        WHERE a.operating_company_id = $1::uuid`,
      [USMCA],
    );

    const filled = assetsPop.rows[0].filled;
    const blank = assetsPop.rows[0].blank;
    const blankCodes = blanks.rows.map((r) => r.unit_code);

    if (equipUs.rows[0].n !== 0) {
      throw new Error(`live: expected 0 USMCA-owned equipment after remaster, got ${equipUs.rows[0].n}`);
    }
    if (unitsUs.rows[0].n !== 0) {
      throw new Error(`live: expected 0 USMCA-owned units after remaster, got ${unitsUs.rows[0].n}`);
    }
    if (filled !== 91) {
      throw new Error(`live: expected 91 assets with owning_entity, got ${filled}`);
    }
    if (blank !== 9) {
      throw new Error(`live: expected 9 NULL owning_entity, got ${blank}: ${blankCodes.join(",")}`);
    }
    for (const code of UNLINKED_EXPECTED) {
      if (!blankCodes.includes(code)) {
        throw new Error(`live: expected unlinked unit_code ${code} still NULL owning_entity`);
      }
    }
    if (policy.rows[0].n !== 63) {
      throw new Error(`live: expected 63 policy_unit rows on USMCA assets, got ${policy.rows[0].n}`);
    }
    // Owner proof #4: TRK-leased-USMCA is the bulk; 2 TRANSP T156 genuine; 1 unlinked TEST fixture.
    if (policy.rows[0].trk_leased_usmca !== 60) {
      throw new Error(
        `live: expected 60 policy_unit → TRK-owned leased-to-USMCA, got ${policy.rows[0].trk_leased_usmca}`,
      );
    }
    if (policy.rows[0].transp_leased_usmca !== 2) {
      throw new Error(
        `live: expected 2 policy_unit → TRANSP-owned leased-to-USMCA (T156), got ${policy.rows[0].transp_leased_usmca}`,
      );
    }
    if (policy.rows[0].unlinked_null !== 1) {
      throw new Error(
        `live: expected 1 policy_unit on unlinked NULL asset (TEST-UNIT-20260806-01), got ${policy.rows[0].unlinked_null}`,
      );
    }

    // Constraint refuse: mismatched owning_company_id vs linked unit owner.
    let refused = false;
    try {
      await client.query("SAVEPOINT refuse_mismatch");
      const u = await client.query(
        `SELECT id, owner_company_id FROM mdata.units
          WHERE owner_company_id = (SELECT id FROM org.companies WHERE code = 'TRK')
          LIMIT 1`,
      );
      const wrong = await client.query(`SELECT id FROM org.companies WHERE code = 'USMCA'`);
      await client.query(
        `INSERT INTO mdata.assets (operating_company_id, unit_code, asset_type, status, unit_id, owning_company_id, owning_entity)
         VALUES ($1, 'R348-MISMATCH-REFUSE', 'tractor', 'active', $2, $3, 'USMCA')`,
        [USMCA, u.rows[0].id, wrong.rows[0].id],
      );
      await client.query("ROLLBACK TO SAVEPOINT refuse_mismatch");
    } catch (err) {
      refused = /assets_unit_owner_same_entity_fkey|foreign key/i.test(String(err.message ?? err));
      await client.query("ROLLBACK TO SAVEPOINT refuse_mismatch").catch(() => {});
    }
    if (!refused) {
      throw new Error("live: composite FK did not refuse mismatched owning_company_id vs unit owner");
    }

    await client.query("ROLLBACK");
    console.log(
      `${LABEL}: live PASS — equip_usmca_owned=0 units_usmca_owned=0 assets_filled=91 blank=9 policy_unit=60 TRK+2 TRANSP T156+1 unlinked TEST refuse_mismatch=1`,
    );
    console.log(`${LABEL}: unlinked unit_codes (owning_entity NULL): ${blankCodes.join(", ")}`);
  } finally {
    await client.end().catch(() => {});
  }
}

async function main() {
  structural();
  await live();
}

main().catch((err) => {
  console.error(`${LABEL}: FAIL — ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
