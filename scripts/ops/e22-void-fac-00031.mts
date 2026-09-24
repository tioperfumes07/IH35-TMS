#!/usr/bin/env tsx
/** Void FAC-2026-00031 (wrong fee on inv 41) then exit — feed-day-831 recreates. */
import pg from "pg";
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import factoringAdvancesPlugin from "../../apps/backend/src/accounting/factoring-advances.routes.js";
import { withCurrentUser } from "../../apps/backend/src/auth/db.js";
import { setScopedCompanyContext } from "../../apps/backend/src/_helpers/scoped-company-context.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const auth = {
  "x-test-auth": Buffer.from(
    JSON.stringify({ id: OWNER, role: "Owner", email: "tioperfumes07@gmail.com" }),
    "utf8"
  ).toString("base64url"),
  "content-type": "application/json",
};

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const app = await createIntegrationApp(async (a) => {
    await (factoringAdvancesPlugin as unknown as (x: typeof a) => Promise<void>)(a);
  });
  try {
    const id = await withCurrentUser(OWNER, async (c) => {
      await setScopedCompanyContext(c, OWNER, USMCA);
      const r = await c.query<{ id: string; status: string; advance_amount_cents: number }>(
        `SELECT id::text, status, advance_amount_cents::int
           FROM accounting.factoring_advances
          WHERE display_id = 'FAC-2026-00031'
            AND operating_company_id = $1::uuid
            AND status <> 'voided'
          LIMIT 1`,
        [USMCA]
      );
      return r.rows[0] ?? null;
    });
    if (!id) {
      console.log("FAC-2026-00031 already voided or missing — ok");
      return;
    }
    console.log(`voiding ${id.id} status=${id.status} adv_cents=${id.advance_amount_cents}`);
    const res = await app.inject({
      method: "POST",
      url: `/api/v1/accounting/factoring-advances/${id.id}/void?operating_company_id=${USMCA}`,
      headers: auth,
      payload: {
        reason: "E22 feed-day-831 wrong factor_fee_pct (missed Faro discount leg) — void and recreate",
      },
    });
    console.log(`HTTP ${res.statusCode} ${res.body.slice(0, 400)}`);
    if (res.statusCode >= 300) process.exit(1);
  } finally {
    await app.close();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
