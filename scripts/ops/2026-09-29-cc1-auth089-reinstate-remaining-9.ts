#!/usr/bin/env npx tsx
/**
 * ROUND 236/248 (Lead, P0) — reinstate the remaining 9 AUTH-089-voided expenses that carry a
 * vendor_document_number with NO live row on the same load bearing that same document (the 10th,
 * 3ce7e2a5 / load 13549 / doc 6232741, was reinstated separately under AUTH-127). Same canonical
 * reinstateDocumentThenVoidReversal (R-191) for every row -- no raw UPDATE, no new row.
 *
 * Usage:
 *   OWNER_AUTH_ID=AUTH-128 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-29-cc1-auth089-reinstate-remaining-9.ts
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withLuciaBypass } from "../../apps/backend/src/auth/db.js";
import { withCompanyScope } from "../../apps/backend/src/accounting/shared.js";
import { reinstateDocumentThenVoidReversal } from "../../apps/backend/src/accounting/reinstate-document.service.js";

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
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const EXPENSE_IDS = [
  "64f2b99c-dd9f-4548-8a23-1f4bb56ed2b5", // load 13514, doc 1597129, $15.25
  "edb89fc2-1d29-449f-9834-3db7765abce0", // load 13514, doc 1360475, $15.25
  "9f6990c0-32c0-4544-9e96-6d2cbc369bda", // load 13515, doc 1295089, $15.25
  "df3dc885-f5b1-4214-bf95-f701e79a2a70", // load 13515, doc 1295098, $5.25
  "5ee11e39-8077-4f4a-a2c7-f55e389856cd", // load 13515, doc 40016373, $5.25
  "24b9378b-0b13-4e00-8770-989f6c193383", // load 13515, doc 39016214, $15.25
  "c0c1aace-f701-4f05-89cf-c0b5826092cb", // load 13528, doc 2044386, $15.25
  "831733cd-d607-48b2-82b6-3cb9ac2f8daf", // load 13548, doc 1230441, $15.25
  "964abc3d-8672-40d5-9c74-3a60c8da99ec", // load 13565, doc 2047749, $15.25
];

async function main() {
  if (process.env.OWNER_AUTH_ID !== "AUTH-128") {
    console.error("Refusing: set OWNER_AUTH_ID=AUTH-128");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Refusing: DATABASE_URL required");
    process.exit(1);
  }

  const results: Array<{ id: string; before: unknown; reinstated: unknown }> = [];

  for (const id of EXPENSE_IDS) {
    const before = await withLuciaBypass(async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
      const r = await client.query(
        `SELECT id::text, status, voided_at::text, vendor_document_number, total_amount_cents
           FROM accounting.expenses WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [id, USMCA]
      );
      return r.rows[0];
    });
    if (!before?.voided_at) {
      console.error(`SKIP ${id} — not currently void (already reinstated?)`, before);
      continue;
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
        id,
        reason:
          "ROUND 236 — voided in error by AUTH-089, which keyed duplicates on (load, amount) instead of vendor document.",
        actor: { userId: ACTOR, role: "Owner" },
      }
    );
    console.log(`REINSTATED ${id}`, reinstated);
    results.push({ id, before, reinstated });
  }

  console.log(`\nTotal reinstated: ${results.length} of ${EXPENSE_IDS.length}`);
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
