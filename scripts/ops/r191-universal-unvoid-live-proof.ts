#!/usr/bin/env npx tsx
/**
 * R-191 item 2 — LIVE proof: universal reinstateDocument on AUTH-117 voided check #1001.
 * reinstate → measure reinstated_* → re-void (leave voided; seat-fixtures law).
 *
 * Usage:
 *   OWNER_AUTH_ID=AUTH-118 DATABASE_URL=<prod> npx tsx scripts/ops/r191-universal-unvoid-live-proof.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withLuciaBypass } from "../../apps/backend/src/auth/db.js";
import {
  reinstateDocumentThenVoidReversal,
} from "../../apps/backend/src/accounting/reinstate-document.service.js";
import { voidCheck } from "../../apps/backend/src/accounting/checks/check-void.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
{
  const authId = process.env.OWNER_AUTH_ID;
  if (!authId) {
    console.error("OWNER_AUTH_ID required");
    process.exit(1);
  }
  execFileSync("node", [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), authId], {
    stdio: "inherit",
  });
}

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACTOR = "86e1e31f-c7b6-4427-bca6-40c5c4cff6d8";
const CHECK_ID = "9b5fcc6c-6d8c-4e14-83ab-49c79c9132e9";

async function main() {
  if (process.env.OWNER_AUTH_ID !== "AUTH-118") {
    console.error("Refusing: set OWNER_AUTH_ID=AUTH-118");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Refusing: DATABASE_URL required");
    process.exit(1);
  }

  const before = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
    const r = await client.query(
      `SELECT id::text, status, posting_status,
              voided_at IS NOT NULL AS is_void,
              reinstated_at IS NOT NULL AS was_reinstated,
              reinstate_reason, reversed_by_je_id::text AS reversed_by_je_id
         FROM accounting.expenses
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [CHECK_ID, USMCA]
    );
    return r.rows[0];
  });
  console.log("BEFORE", before);
  if (!before?.is_void) {
    console.error("FAIL — expected check #1001 expense to be void before reinstate");
    process.exit(1);
  }

  const reinstated = await reinstateDocumentThenVoidReversal(
    (fn) =>
      withCompanyScope(ACTOR, USMCA, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
        return fn(client as never);
      }),
    {
      operatingCompanyId: USMCA,
      type: "expense",
      id: CHECK_ID,
      reason: "AUTH-118 R-191 universal reinstateDocument live proof",
      actor: { userId: ACTOR, role: "Owner" },
    }
  );
  console.log("REINSTATED", reinstated);

  const mid = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
    const r = await client.query(
      `SELECT id::text, status, posting_status,
              voided_at IS NOT NULL AS is_void,
              reinstated_at IS NOT NULL AS was_reinstated,
              reinstate_reason,
              reinstated_by_user_id::text AS reinstated_by_user_id,
              reinstated_from_void_je_id::text AS reinstated_from_void_je_id
         FROM accounting.expenses
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [CHECK_ID, USMCA]
    );
    return r.rows[0];
  });
  console.log("MID", mid);
  if (mid?.is_void) {
    console.error("FAIL — expense still void after reinstateDocument");
    process.exit(1);
  }
  if (!mid?.was_reinstated) {
    console.error("FAIL — reinstated_at not stamped");
    process.exit(1);
  }
  if (!String(mid.reinstate_reason ?? "").includes("AUTH-118")) {
    console.error("FAIL — reinstate_reason missing AUTH-118");
    process.exit(1);
  }

  const voided = await voidCheck(USMCA, ACTOR, CHECK_ID, "AUTH-118 re-void after reinstate proof (leave voided)");
  console.log("REVOIDED", voided);

  const after = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
    const r = await client.query(
      `SELECT id::text, status, posting_status,
              voided_at IS NOT NULL AS is_void,
              reinstated_at IS NOT NULL AS was_reinstated
         FROM accounting.expenses
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [CHECK_ID, USMCA]
    );
    return r.rows[0];
  });
  console.log("AFTER", after);
  if (!after?.is_void || after.status !== "void") {
    console.error("FAIL — must leave check VOIDED (seat-fixtures law)");
    process.exit(1);
  }

  console.log("AUTH-118 LIVE PROOF PASS — reinstateDocument(expense) + re-void");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
