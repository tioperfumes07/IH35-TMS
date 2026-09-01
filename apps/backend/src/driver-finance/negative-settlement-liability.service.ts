// RULING B — NEGATIVE SETTLEMENTS (owner ruling 2026-09-01). A negative net_pay means the driver
// owes the company. It posts AUTOMATICALLY to the driver's account on the RECEIVABLE side, per the
// locked decision (Driver Cash Advance = ASSET, Driver Escrow = LIABILITY) -- the debt ledger this
// codebase already carries for that receivable side is driver_finance.driver_liabilities (already
// wired for display via driver_finance.recompute_driver_debt(), read by the settlement detail debt
// banner; nothing wrote to it from a settlement close before this).
//
// "No settlement may close negative without creating the corresponding account entry." This is
// that write, called from every settlement-close path that can produce a negative net_pay. NOT a
// write-off: write-off is a separate, deliberate, permissioned act (not built here). This function
// only ever CREATES a pending_recovery liability -- it never forgives, never zeroes a balance.

export type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type NegativeSettlementLiabilityResult =
  | { outcome: "not_negative" }
  | { outcome: "already_exists"; liability_id: string }
  | { outcome: "created"; liability_id: string; amount: number };

/**
 * Idempotent: keyed on origin='driver_settlement' + origin_id=settlementId, so a retried finalize
 * (or a settlement finalized twice by two racing requests) can never double-post the liability.
 */
export async function postNegativeSettlementLiabilityIfNeeded(
  client: DbClient,
  input: {
    operatingCompanyId: string;
    settlementId: string;
    driverId: string;
    displayId: string | null;
    netPay: number;
  }
): Promise<NegativeSettlementLiabilityResult> {
  if (!(input.netPay < 0)) return { outcome: "not_negative" };

  const existing = await client.query<{ id: string }>(
    `SELECT id::text FROM driver_finance.driver_liabilities
      WHERE operating_company_id = $1::uuid AND origin = 'driver_settlement' AND origin_id = $2::uuid
      LIMIT 1`,
    [input.operatingCompanyId, input.settlementId]
  );
  if (existing.rows[0]?.id) {
    return { outcome: "already_exists", liability_id: existing.rows[0].id };
  }

  const amount = Math.abs(input.netPay);
  const label = input.displayId ?? input.settlementId;
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO driver_finance.driver_liabilities (
        operating_company_id, driver_id, type, source_description,
        original_amount, current_balance, paid_to_date, requires_acknowledgment,
        origin, origin_id, reference_doc_id, status
      )
      VALUES ($1::uuid, $2::uuid, 'negative_settlement', $3, $4, $4, 0, false,
              'driver_settlement', $5::uuid, $5::uuid, 'pending_recovery')
      RETURNING id::text
    `,
    [
      input.operatingCompanyId,
      input.driverId,
      `Negative settlement ${label} (net pay $${amount.toFixed(2)}) -- carries forward, deducted on the driver's next settlement`,
      amount,
      input.settlementId,
    ]
  );
  const liabilityId = inserted.rows[0]?.id;
  if (!liabilityId) throw new Error("negative_settlement_liability_insert_failed");

  return { outcome: "created", liability_id: liabilityId, amount };
}
