import { createHash } from "node:crypto";

export function normalizeBankTransactionDescription(input: string | null | undefined): string {
  return String(input ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 $.\-]/g, "")
    .trim();
}

export type BankTxDedupParts = {
  bank_account_id: string;
  transaction_date: string;
  amount_cents: number;
  normalized_description: string;
};

export function computeBankTransactionDedupHash(parts: BankTxDedupParts): string {
  const amt = Math.abs(Math.round(Number(parts.amount_cents)));
  const payload = `${parts.bank_account_id}|${parts.transaction_date}|${amt}|${parts.normalized_description}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export type MergeManualStubResult =
  | { merged: false; reason: "no_stub" | "multiple_stubs" }
  | { merged: true; stub_id: string };

/** Merge a single manual receipt/intake row into a Plaid-backed row and delete the stub. */
export async function mergeManualBankTransactionStub(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }> },
  args: {
    plaidRowId: string;
    operatingCompanyId: string;
    bankAccountId: string;
    transactionDate: string;
    amountCents: number;
    normalizedDescription: string;
  }
): Promise<MergeManualStubResult> {
  const dedupHash = computeBankTransactionDedupHash({
    bank_account_id: args.bankAccountId,
    transaction_date: args.transactionDate,
    amount_cents: args.amountCents,
    normalized_description: args.normalizedDescription,
  });

  const stubRes = await client.query(
    `
      SELECT id
      FROM banking.bank_transactions
      WHERE bank_account_id = $1::uuid
        AND operating_company_id = $2::uuid
        AND dedup_hash = $3
        AND COALESCE(source, 'manual') = 'manual'
        AND plaid_transaction_id IS NULL
      ORDER BY created_at ASC
      LIMIT 2
    `,
    [args.bankAccountId, args.operatingCompanyId, dedupHash]
  );
  if (stubRes.rows.length === 0) return { merged: false, reason: "no_stub" };
  if (stubRes.rows.length > 1) return { merged: false, reason: "multiple_stubs" };
  const stubId = String((stubRes.rows[0] as { id: string }).id);

  const stubDetail = await client.query(
    `
      SELECT receipt_evidence_r2_key, reconciled_obligation_type, reconciled_obligation_id, notes
      FROM banking.bank_transactions
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [stubId]
  );
  const stub = stubDetail.rows[0] as {
    receipt_evidence_r2_key: string | null;
    reconciled_obligation_type: string | null;
    reconciled_obligation_id: string | null;
    notes: string | null;
  } | undefined;
  if (!stub) return { merged: false, reason: "no_stub" };

  await client.query(
    `
      UPDATE banking.bank_transactions
      SET
        receipt_evidence_r2_key = COALESCE(receipt_evidence_r2_key, $2::text),
        reconciled_obligation_type = COALESCE(reconciled_obligation_type, $3::text),
        reconciled_obligation_id = COALESCE(reconciled_obligation_id, $4::uuid),
        notes = CASE
          WHEN $5::text IS NOT NULL AND length(trim($5::text)) > 0 THEN trim(BOTH E'\\n' FROM concat_ws(E'\\n', notes, 'merged_manual_stub:' || $5::text))
          ELSE notes
        END,
        dedup_hash = $6::text,
        updated_at = now()
      WHERE id = $1::uuid
    `,
    [
      args.plaidRowId,
      stub.receipt_evidence_r2_key,
      stub.reconciled_obligation_type,
      stub.reconciled_obligation_id,
      stub.notes,
      dedupHash,
    ]
  );

  await client.query(`DELETE FROM banking.bank_transactions WHERE id = $1::uuid`, [stubId]);
  return { merged: true, stub_id: stubId };
}
