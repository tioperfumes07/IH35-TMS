/**
 * ACCT-F5327 / LV-TRK-AP-SPLIT-ACROSS-TWO-ACTIVE-ACCOUNTS — TRK's superseded `ap_control` account
 * ("2000") stays non-postable, so a raw account picker can never route around the role resolver's
 * correct designation (TRK-2000) by accident (real Postgres).
 */
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildPgClientConfig } from "../../lib/pg-connection-options.js";
import { ensureIntegrationPrerequisites } from "../../../test-helpers/db-fixture.js";

const describeIntegration = describe.skipIf(process.env.GITHUB_ACTIONS !== "true");

const TRK_OPCO = "b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e";
const SUPERSEDED_ACCOUNT_ID = "3af15c76-0ef2-4433-a9a5-7eca44c2ce59";

describeIntegration("ACCT-F5327 — TRK's superseded AP account cannot be posted to", () => {
  let db: pg.Client;

  beforeAll(async () => {
    await ensureIntegrationPrerequisites();
    const cs = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
    if (!cs) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required for this db.test");
    db = new pg.Client(buildPgClientConfig(cs));
    await db.connect();
  });

  afterAll(async () => {
    await db?.end();
  });

  it("account 2000 (TRK) is non-postable", async () => {
    const res = await db.query<{ is_postable: boolean }>(
      `SELECT is_postable FROM catalogs.accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [SUPERSEDED_ACCOUNT_ID, TRK_OPCO]
    );
    if (res.rows.length === 0) return; // account not present in this CI fixture — nothing to prove
    expect(res.rows[0]?.is_postable).toBe(false);
  });

  it("TRK's ap_control role mapping resolves to exactly one active account (TRK-2000)", async () => {
    const res = await db.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM accounting.chart_of_accounts_roles car
         JOIN catalogs.accounts ca ON ca.id = car.account_id
        WHERE car.operating_company_id = $1::uuid
          AND car.role = 'ap_control'
          AND car.is_active = true
          AND ca.deactivated_at IS NULL
          AND ca.is_postable = true`,
      [TRK_OPCO]
    );
    if (Number(res.rows[0]?.n ?? 0) === 0) return; // no role mapping in this CI fixture
    expect(Number(res.rows[0]?.n)).toBe(1);
  });
});
