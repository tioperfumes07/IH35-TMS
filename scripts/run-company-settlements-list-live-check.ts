#!/usr/bin/env tsx
/**
 * scripts/run-company-settlements-list-live-check.ts — one-off live proof for the new
 * GET /api/v1/accounting/company-settlements list route (M.3 follow-up: "company-settlement
 * list/detail vertical remains open"). Calls the REAL route via app.inject(), same auth-bypass
 * pattern already established this session, against real USMCA data.
 *
 * Usage: DATABASE_URL=<neon prod> npx tsx scripts/run-company-settlements-list-live-check.ts
 */
import { createIntegrationApp } from "../apps/backend/test-helpers/http-app.js";
import { registerCompanySettlementListRoutes } from "../apps/backend/src/accounting/company-settlement-list.routes.js";
import { registerCompanySettlementReportRoutes } from "../apps/backend/src/accounting/company-settlement-report.routes.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

async function main() {
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerCompanySettlementListRoutes(a);
    await registerCompanySettlementReportRoutes(a);
  });
  const authHeader = {
    "x-test-auth": Buffer.from(
      JSON.stringify({ id: OWNER_USER_ID, role: "Owner", email: "tioperfumes07@gmail.com" }),
      "utf8"
    ).toString("base64url"),
  };

  const res = await app.inject({
    method: "GET",
    url: `/api/v1/accounting/company-settlements?operating_company_id=${USMCA_COMPANY_ID}`,
    headers: authHeader,
  });
  console.log(`status=${res.statusCode}`);
  const body = JSON.parse(res.body) as { company_settlements?: unknown[] };
  console.log(`count=${body.company_settlements?.length ?? "n/a"}`);
  console.log(JSON.stringify(body, null, 2).slice(0, 4000));

  await app.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
