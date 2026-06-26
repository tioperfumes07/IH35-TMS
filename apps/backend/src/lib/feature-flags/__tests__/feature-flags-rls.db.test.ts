/**
 * FEATURE-FLAGS-RLS-INSERT — proves the Option-A fix (run flag writes under withLuciaBypass) against a
 * real Postgres, AND proves we did NOT open a hole:
 *   (1) under lucia-bypass (app.bypass_rls='lucia'), the app role CAN insert a flag AND a per-tenant override
 *       — satisfying the existing feature_flags_admin / ff_overrides_admin policies (USING is_lucia_bypass()).
 *   (2) WITHOUT bypass, the same inserts as the app role are STILL blocked by RLS — so admin flag writes
 *       remain gated to the elevated context (no USING(true), no RLS weakening).
 *
 * feature_flags is RLS-ENABLED-not-FORCED, so the test must run as `ih35_app` (SET ROLE) to be subject to
 * the policy — the table owner would otherwise bypass RLS. Mirrors the accounting RLS .db.test.ts harness.
 * CI-only (a migrated Postgres is available there).
 */
import { randomUUID } from "node:crypto";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../../test-helpers/db-fixture.js";

// Mirrors the proven bill-expense-lines-rls.db.test.ts gate EXACTLY: runs only in the integration/DB lane
// (GITHUB_ACTIONS=true with a migrated Postgres); skips in the no-DB build-typecheck/verify:pre-commit lane
// and locally. (The earlier ECONNREFUSED was my bug: buildPgClientConfig() was called with no connection
// string — fixed below by passing cs, like the bill test.)
const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

describeIntegration("feature_flags RLS write policy (real Postgres) — bypass writes, non-bypass blocked", () => {
  let db: pg.Client;
  let companyId: string;
  let userId: string;
  const suffix = randomUUID().slice(0, 8);
  const flagKey = `test_rls_flag_${suffix}`;
  const flagKeyBlocked = `test_rls_flag_blocked_${suffix}`;
  const RLS_ERR = /row-level security|permission denied/i;

  async function withBypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    try {
      await db.query("SET LOCAL app.bypass_rls = 'lucia'");
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  // app role, NO bypass GUC -> subject to *_admin policies (USING is_lucia_bypass() = false -> blocked)
  async function asAppNoBypass<T>(fn: () => Promise<T>): Promise<T> {
    await db.query("BEGIN");
    try {
      const out = await fn();
      await db.query("COMMIT");
      return out;
    } catch (err) {
      await db.query("ROLLBACK").catch(() => {});
      throw err;
    }
  }

  beforeAll(async () => {
    companyId = await ensureIntegrationPrerequisites(); // seeds an org.company + an identity.users row
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_URL or DATABASE_DIRECT_URL is required");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
    await db.query("SET ROLE ih35_app");
    userId = await withBypass(async () => {
      const r = await db.query<{ id: string }>("SELECT id FROM identity.users LIMIT 1");
      return r.rows[0]!.id;
    });
  });

  afterAll(async () => {
    if (db) {
      await withBypass(async () => {
        await db.query("DELETE FROM lib.feature_flag_overrides WHERE flag_key = ANY($1::text[])", [[flagKey, flagKeyBlocked]]);
        await db.query("DELETE FROM lib.feature_flags WHERE flag_key = ANY($1::text[])", [[flagKey, flagKeyBlocked]]);
      }).catch(() => {});
      await db.end().catch(() => {});
    }
  });

  it("under lucia-bypass: app role CAN insert a feature flag", async () => {
    await withBypass(() =>
      db.query(
        "INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct) VALUES ($1,$2,false,0)",
        [flagKey, "rls test flag"],
      ),
    );
    const check = await withBypass(() => db.query("SELECT 1 FROM lib.feature_flags WHERE flag_key=$1", [flagKey]));
    expect(check.rowCount).toBe(1);
  });

  it("under lucia-bypass: app role CAN insert a per-tenant override", async () => {
    await withBypass(() =>
      db.query(
        "INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid) VALUES ($1,$2::uuid,true,$3::uuid)",
        [flagKey, companyId, userId],
      ),
    );
    const check = await withBypass(() =>
      db.query("SELECT 1 FROM lib.feature_flag_overrides WHERE flag_key=$1 AND operating_company_id=$2::uuid", [flagKey, companyId]),
    );
    expect(check.rowCount).toBe(1);
  });

  it("WITHOUT bypass: app-role flag insert is BLOCKED by RLS (no hole opened)", async () => {
    await expect(
      asAppNoBypass(() =>
        db.query(
          "INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct) VALUES ($1,$2,false,0)",
          [flagKeyBlocked, "should be blocked"],
        ),
      ),
    ).rejects.toThrow(RLS_ERR);
    // confirm it truly did not land
    const check = await withBypass(() => db.query("SELECT 1 FROM lib.feature_flags WHERE flag_key=$1", [flagKeyBlocked]));
    expect(check.rowCount).toBe(0);
  });

  it("WITHOUT bypass: app-role override insert is BLOCKED by RLS (per-tenant table stays protected)", async () => {
    await expect(
      asAppNoBypass(() =>
        db.query(
          "INSERT INTO lib.feature_flag_overrides (flag_key, operating_company_id, enabled, set_by_user_uuid) VALUES ($1,$2::uuid,false,$3::uuid)",
          [flagKey, companyId, userId],
        ),
      ),
    ).rejects.toThrow(RLS_ERR);
  });
});
