/**
 * FUEL-03 — book driver fuel-overage receivable via the existing JE writer (no new GL math).
 *
 * Economics: company already expensed the full card swipe via postFuelExpenseFromEvent. The overage
 * portion is reclassified from company fuel expense to a driver receivable:
 *   Dr fuel_overage_receivable (resolveRoleAccount)
 *   Cr fuel expense (resolveAccountForCategory — same path as the fuel poster)
 */
import type { PoolClient } from "pg";
import { createJournalEntryOnClient } from "../accounting/journal-entries.service.js";
import { resolveRoleAccount } from "../accounting/coa-roles/resolver.service.js";
import { resolveAccountForCategory } from "../accounting/expense-category-map/resolver.service.js";
import { mapFuelTypeToPostingKind } from "../accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js";
import { companyBusinessDate } from "../lib/company-business-date.js";

export type PostFuelOverageReceivableInput = {
  operating_company_id: string;
  fuel_transaction_id: string;
  overage_event_id: string;
  driver_id: string;
  overage_cents: number;
  fuel_type: string;
  transaction_at: string;
  actor_user_id: string;
  actor_role?: string;
};

export type PostFuelOverageReceivableResult =
  | { status: "posted"; journal_entry_id: string }
  | { status: "already_posted"; journal_entry_id: string };

function buildIdempotencyKey(operatingCompanyId: string, fuelTransactionId: string): string {
  return ["ih35:fuel-overage-receivable:v1", operatingCompanyId.toLowerCase(), fuelTransactionId].join(":");
}

export async function postFuelOverageReceivable(
  client: PoolClient,
  input: PostFuelOverageReceivableInput
): Promise<PostFuelOverageReceivableResult> {
  const amountCents = Math.round(Number(input.overage_cents ?? 0));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("fuel_overage_receivable_amount_must_be_positive");
  }

  const existing = await client.query<{ journal_entry_id: string }>(
    `
      SELECT journal_entry_id::text
        FROM fuel.fuel_card_overage_events
       WHERE id = $1::uuid
         AND operating_company_id = $2::uuid
         AND journal_entry_id IS NOT NULL
       LIMIT 1
    `,
    [input.overage_event_id, input.operating_company_id]
  );
  if (existing.rows[0]?.journal_entry_id) {
    return { status: "already_posted", journal_entry_id: existing.rows[0].journal_entry_id };
  }

  const idempotencyKey = buildIdempotencyKey(input.operating_company_id, input.fuel_transaction_id);
  const batchHit = await client.query<{ journal_entry_uuid: string }>(
    `
      SELECT jep.journal_entry_uuid::text
        FROM accounting.posting_batches pb
        JOIN accounting.journal_entry_postings jep ON jep.posting_batch_id = pb.id
       WHERE pb.operating_company_id = $1::uuid
         AND pb.idempotency_key = $2
       LIMIT 1
    `,
    [input.operating_company_id, idempotencyKey]
  );
  if (batchHit.rows[0]?.journal_entry_uuid) {
    return { status: "already_posted", journal_entry_id: batchHit.rows[0].journal_entry_uuid };
  }

  const receivableAccountId = await resolveRoleAccount(
    client as never,
    input.operating_company_id,
    "fuel_overage_receivable"
  );
  const fuelKind = mapFuelTypeToPostingKind(input.fuel_type);
  const expense = await resolveAccountForCategory(input.operating_company_id, "fuel", fuelKind);

  const entryDate = (input.transaction_at?.slice(0, 10) || companyBusinessDate()).trim();
  const memo =
    `Driver fuel-card overage receivable — txn ${input.fuel_transaction_id} ` +
    `(driver ${input.driver_id}, $${(amountCents / 100).toFixed(2)})`;

  const je = await createJournalEntryOnClient(
    client as never,
    {
      operating_company_id: input.operating_company_id,
      entry_date: entryDate,
      memo,
      source: "auto",
      postings: [
        {
          account_id: receivableAccountId,
          debit_or_credit: "debit",
          amount_cents: amountCents,
          description: "Driver fuel-card overage receivable",
        },
        {
          account_id: expense.account_id,
          debit_or_credit: "credit",
          amount_cents: amountCents,
          description: "Reclassify fuel expense to driver receivable",
        },
      ],
    },
    { userId: input.actor_user_id, role: input.actor_role ?? "system" }
  );

  await client.query(
    `
      UPDATE fuel.fuel_card_overage_events
         SET journal_entry_id = $1::uuid,
             status = 'posted',
             updated_at = now()
       WHERE id = $2::uuid
         AND operating_company_id = $3::uuid
    `,
    [je.id, input.overage_event_id, input.operating_company_id]
  );

  return { status: "posted", journal_entry_id: je.id };
}
