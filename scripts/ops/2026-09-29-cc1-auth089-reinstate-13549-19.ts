#!/usr/bin/env npx tsx
/**
 * ROUND 236 (Lead, P0) — AUTH-089 voided a real expense using a (load, amount) duplicate key.
 * Expense 3ce7e2a5-b93c-406c-b8a7-341f6ecc0951 (load 13549 / settlement 5787, vendor_document_number
 * 6232741, 2026-08-20, $15.25, OTR-Scale Expense) was voided as "superseded by another live row
 * representing the same (load, amount) purchase" -- but no live row on this load carries document
 * 6232741. The row it was actually confused with, document 1106179 ($15.25, 2026-08-25), is a
 * DIFFERENT real vendor invoice on a different date. AlwaysTrack's own settlement 5787 total
 * ($140.20 non-diesel expenses) requires BOTH lines live. Reinstating via the canonical universal
 * reinstate engine (reinstateDocumentThenVoidReversal, R-191) -- never a raw UPDATE, never a new row.
 *
 * Usage:
 *   OWNER_AUTH_ID=AUTH-127 DATABASE_URL=<prod> npx tsx scripts/ops/2026-09-29-cc1-auth089-reinstate-13549-19.ts
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
const ACTOR = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // Owner actor id used throughout this session's live writes
const EXPENSE_ID = "3ce7e2a5-b93c-406c-b8a7-341f6ecc0951";

async function main() {
  if (process.env.OWNER_AUTH_ID !== "AUTH-127") {
    console.error("Refusing: set OWNER_AUTH_ID=AUTH-127");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("Refusing: DATABASE_URL required");
    process.exit(1);
  }

  const before = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
    const r = await client.query(
      `SELECT id::text, status, voided_at::text, void_reason,
              reinstated_at IS NOT NULL AS was_reinstated, vendor_document_number, total_amount_cents
         FROM accounting.expenses
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [EXPENSE_ID, USMCA]
    );
    return r.rows[0];
  });
  console.log("BEFORE", before);
  if (!before?.voided_at) {
    console.error("FAIL — expected expense to be void before reinstate");
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
      id: EXPENSE_ID,
      reason:
        "AUTH-127 (ROUND 236): AUTH-089's (load, amount) duplicate key wrongly voided this row -- " +
        "no live row on load 13549 carries its own vendor_document_number 6232741. Reinstated per " +
        "the corrected identity (operating_company_id, vendor_uuid, vendor_document_number, " +
        "transaction_date, total_amount_cents).",
      actor: { userId: ACTOR, role: "Owner" },
    }
  );
  console.log("REINSTATED", reinstated);

  const after = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [USMCA]);
    const r = await client.query(
      `SELECT id::text, status, voided_at::text, reinstated_at::text, reinstate_reason,
              reinstated_from_void_je_id::text, vendor_document_number, total_amount_cents
         FROM accounting.expenses
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [EXPENSE_ID, USMCA]
    );
    return r.rows[0];
  });
  console.log("AFTER", after);
}

main().catch((err) => {
  console.error("FAIL", err);
  process.exit(1);
});
