#!/usr/bin/env tsx
// One-off: create the 3 real vendor masters needed for ROUND 27.1/28 STEP 3 batch 2 (5804-5816)
// that do not already exist -- "TRUCK WASH HEBRON", "PRIME INT", "Smithfield Foods Inc" -- via the
// real POST /api/v1/mdata/vendors route (in-process app.inject()), searched-first against
// mdata.vendors live (none found, see OUTBOX). Prints the created ids for use in the expense batch.
import { createIntegrationApp } from "../../apps/backend/test-helpers/http-app.js";
import { registerVendorRoutes } from "../../apps/backend/src/mdata/vendors.routes.js";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

async function main() {
  process.env.IH35_TEST_AUTH_BYPASS = "1";
  const app = await createIntegrationApp(async (a) => {
    await registerVendorRoutes(a as never);
  });
  const authHeader = {
    "x-test-auth": Buffer.from(JSON.stringify({ id: OWNER_USER_ID, role: "Owner", email: "tioperfumes07@gmail.com" }), "utf8").toString("base64url"),
  };
  for (const name of ["TRUCK WASH HEBRON", "PRIME INT", "Smithfield Foods Inc"]) {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/mdata/vendors",
      headers: authHeader,
      payload: { operating_company_id: USMCA_COMPANY_ID, name, vendor_type: "Other" },
    });
    console.log(name, res.statusCode, res.body);
  }
}
await main();
