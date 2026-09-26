/**
 * R-187 G4 (step 1 of 2): create the GL 1235 "Faro Cash Reserve" account (owner-approved number, per
 * the existing code ruling "Cash Rsv is its own reserve pool, owner ruling: GL 1235" -- no new number
 * invented here) and bind it to the new factor_cash_reserve_held CoA role, mirroring 1230's own shape
 * exactly (Asset, OtherCurrentAsset, postable, top-level).
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const REQUIRED_AUTH_ID = process.env.OWNER_AUTH_ID;
if (!REQUIRED_AUTH_ID) {
  console.error("ROUND 133 P0: OWNER_AUTH_ID env var is required; refusing a production financial write without an OPEN authorization on main.");
  process.exit(1);
}
try {
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), REQUIRED_AUTH_ID], { stdio: "inherit" });
} catch {
  console.error(`ROUND 133 P0: ${REQUIRED_AUTH_ID} rejected -- see docs/bus/OWNER-AUTHORIZATIONS.md.`);
  process.exit(1);
}

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const SYSTEM_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000001";
const ACCOUNT_NUMBER = "1235";
const ACCOUNT_NAME = "Faro Cash Reserve";
const ROLE = "factor_cash_reserve_held";

async function main() {
  const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const results: Record<string, unknown> = {};

  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("RESET ROLE");
      await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA_ID]);

      const existing = await client.query<{ id: string }>(
        `SELECT id::text FROM catalogs.accounts WHERE account_number=$1 AND operating_company_id=$2::uuid`,
        [ACCOUNT_NUMBER, USMCA_ID]
      );
      let accountId: string;
      if (existing.rows[0]) {
        accountId = existing.rows[0].id;
        results.account = { status: "already_exists", id: accountId };
      } else {
        const ins = await client.query<{ id: string }>(
          `
            INSERT INTO catalogs.accounts (
              account_number, account_name, account_type, account_subtype, parent_account_id,
              qbo_account_id, is_postable, currency_code,
              notes, created_by_user_id, updated_by_user_id, operating_company_id
            )
            VALUES ($1, $2, 'Asset', 'OtherCurrentAsset', NULL,
                    NULL, true, 'USD',
                    $3, $4::uuid, $4::uuid, $5::uuid)
            RETURNING id::text
          `,
          [
            ACCOUNT_NUMBER,
            ACCOUNT_NAME,
            "R-187 G4: Faro 'Cash Rsv' export column, its own reserve pool per owner ruling (GL 1235), never the escrow reserve (1230 Factoring Reserves). Mirrors 1230's shape exactly.",
            SYSTEM_ACTOR_USER_ID,
            USMCA_ID,
          ]
        );
        accountId = ins.rows[0]!.id;
        await appendCrudAudit(
          client as never, SYSTEM_ACTOR_USER_ID, "catalogs.accounts.created",
          { resource_type: "catalogs.accounts", resource_id: accountId, operating_company_id: USMCA_ID, account_number: ACCOUNT_NUMBER, account_name: ACCOUNT_NAME, account_type: "Asset" },
          "info", "R-187-G4-CASH-RESERVE-ACCOUNT"
        );
        results.account = { status: "created", id: accountId };
      }

      // Deactivate any existing active binding for this role, then insert the new one (mirrors
      // coa-roles/routes.ts's own upsert shape).
      await client.query(
        `UPDATE accounting.chart_of_accounts_roles SET is_active=false, updated_at=now(), updated_by_user_id=$3::uuid
          WHERE operating_company_id=$1::uuid AND role=$2 AND is_active=true`,
        [USMCA_ID, ROLE, SYSTEM_ACTOR_USER_ID]
      );
      const roleIns = await client.query<{ id: string }>(
        `
          INSERT INTO accounting.chart_of_accounts_roles (operating_company_id, role, account_id, is_active, created_by_user_id, updated_by_user_id)
          VALUES ($1::uuid, $2, $3::uuid, true, $4::uuid, $4::uuid)
          RETURNING id::text
        `,
        [USMCA_ID, ROLE, accountId, SYSTEM_ACTOR_USER_ID]
      );
      await appendCrudAudit(
        client as never, SYSTEM_ACTOR_USER_ID, "accounting.coa_role.updated",
        { resource_type: "accounting.chart_of_accounts_roles", resource_id: roleIns.rows[0]!.id, operating_company_id: USMCA_ID, role: ROLE, account_id: accountId },
        "info", "R-187-G4-CASH-RESERVE-ACCOUNT"
      );
      results.role_binding = { id: roleIns.rows[0]!.id, role: ROLE, account_id: accountId };

      await client.query("COMMIT");
      console.log(JSON.stringify(results, null, 2));
      console.log("COMMITTED.");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("FAILED:", (err as Error).message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
