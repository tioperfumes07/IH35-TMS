#!/usr/bin/env tsx
// AUTH-078 (Lead ROUND 154.1 follow-up). Voids exactly ONE document: accounting.expenses
// 2f7cd068-8daf-4cb3-8894-b64b439d7d0b (expense_number 13546-2, $624.60), a duplicate of
// 99d26c7b-192b-4946-b5a0-95658ac2fbb7 (13546-3, the live/current one) for the same fuel purchase
// on load 13546 / AlwaysTrack document 5788. Both were posted; 13546-2's own fuel_transactions row
// (d908b8d4-f2de-405a-80f5-d14969ff930f) was archived 2026-09-24T18:58:45Z as part of the same
// batch that correctly superseded 218 other rows tonight -- this expense was the one row where the
// matching void never happened.
//
// Reuses the EXISTING /api/v1/expenses/:id/void route's own internal logic verbatim (this file
// mirrors apps/backend/src/accounting/expenses.routes.ts's void handler, minus the HTTP/session
// layer) -- reversePostedSourceTransactionInClientTx (one of the six reversal engines, no
// seventh) + the same header UPDATE. No new GL math, no new stamper.
//
// verify-owner-authorization.mjs AUTH-078 required before this runs.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { withCompanyScope } from "../../apps/backend/src/accounting/shared.js";
import { reversePostedSourceTransactionInClientTx, PostingEngineError } from "../../apps/backend/src/accounting/posting-engine.service.js";
import { todayIso } from "../../apps/backend/src/accounting/void.service.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const EXPENSE_ID = "2f7cd068-8daf-4cb3-8894-b64b439d7d0b";
const VOID_REASON =
  "Duplicate of 13546-3 (99d26c7b) for the same fuel purchase on load 13546 -- this expense's own fuel_transaction (d908b8d4) was archived 2026-09-24 as part of the Direction-1 supersession batch, but this expense itself was never voided. Corrected 2026-09-28 under Lead ruling 148-02/154.1, AUTH-078.";
const OWNER_AUTH_ID = process.env.OWNER_AUTH_ID;

if (OWNER_AUTH_ID !== "AUTH-078") {
  console.error(`FAIL: OWNER_AUTH_ID must be AUTH-078 (got ${JSON.stringify(OWNER_AUTH_ID ?? null)}).`);
  process.exit(1);
}
execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-owner-authorization.mjs"), "AUTH-078"], { stdio: "inherit" });

async function main() {
  const result = await withCompanyScope(OWNER_USER_ID, USMCA_COMPANY_ID, async (client) => {
    const pre = await client.query(
      `SELECT posting_status, status FROM accounting.expenses WHERE id=$1::uuid AND operating_company_id=$2::uuid LIMIT 1`,
      [EXPENSE_ID, USMCA_COMPANY_ID]
    );
    const exp = pre.rows[0] as { posting_status: string; status: string } | undefined;
    if (!exp) throw new Error("expense not found");
    if (exp.status === "void" || exp.posting_status === "reversed") {
      console.log("already void -- no-op");
      return { already_void: true, reversing_je_id: null as string | null };
    }

    let reversingJeId: string | null = null;
    if (exp.posting_status === "posted") {
      const rev = await reversePostedSourceTransactionInClientTx(
        client,
        { operating_company_id: USMCA_COMPANY_ID, source_transaction_type: "expense", source_transaction_id: EXPENSE_ID },
        { userId: OWNER_USER_ID },
        todayIso()
      );
      reversingJeId = rev.journal_entry_id;
    }

    await client.query(
      `UPDATE accounting.expenses
          SET status='void',
              posting_status = CASE WHEN posting_status='posted' THEN 'reversed' ELSE posting_status END,
              reversed_by_je_id = COALESCE($2::uuid, reversed_by_je_id),
              voided_at = now(), voided_by_user_id = $3::uuid, void_reason = $4, updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $5::uuid`,
      [EXPENSE_ID, reversingJeId, OWNER_USER_ID, VOID_REASON, USMCA_COMPANY_ID]
    );
    return { already_void: false, reversing_je_id: reversingJeId };
  });
  console.log("RESULT", JSON.stringify(result));
}

main().catch((e) => {
  if (e instanceof PostingEngineError) console.error("PostingEngineError", e.code, e.message);
  else console.error(e);
  process.exit(1);
});
