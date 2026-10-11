/**
 * void-stray-salaried-driver-bill.service.ts — LEAD RULING 443.44 Ask B (CC-3, 2026-10-11).
 *
 * A salaried driver's week has NO per-load driver bill (Lead 443.36 #2, isSalariedZeroRateOverride): the salary is the
 * settlement's own pay line. Before SETL-F44346 (#26317) the delivery path re-read the load without its override reason
 * and minted a per-mile bill anyway — 5816 left bill 2d48d11e (load 13595, $169.65) OPEN on prod, unposted and unlinked,
 * where a later pay run could sweep it and pay money that is not owed.
 *
 * correctOpenDriverBillMileage (void-open-driver-bill.service.ts) voids AND re-mints a replacement, which is wrong here:
 * a salaried load must end with ZERO live bills. This module owns that one narrow case and nothing else. It refuses
 * unless EVERY condition holds (fail-closed):
 *   - the bill belongs to this company, is status 'open' and not voided, and was never settled (settled_in_settlement_id NULL);
 *   - its load carries the 0-rate "Salaried" override (rate 0 AND reason starting "Salaried");
 *   - no live settlement line points at it, no A/P-chain gl_bills row names it, and no journal-entry posting carries it;
 *   - the reason is real (>= 20 characters).
 * It voids (void-not-delete: status 'void', voided_at, void_reason, voided_by_user_id — never a DELETE, never an amount
 * edit) and writes an audit row. It mints nothing and posts nothing: the bill never reached the ledger.
 */

type QueryClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export class StraySalariedBillVoidRefusedError extends Error {
  readonly code = "stray_salaried_bill_void_refused";
}

export type VoidStraySalariedBillResult = {
  voided_bill_id: string;
  load_number: string | null;
  gross_amount_cents: number;
};

export async function voidStraySalariedDriverBill(
  client: QueryClient,
  input: { operatingCompanyId: string; driverBillId: string; reason: string; actorUserId: string },
  audit: (eventClass: string, payload: Record<string, unknown>) => Promise<void>,
): Promise<VoidStraySalariedBillResult> {
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 20) throw new StraySalariedBillVoidRefusedError("reason must be a real, specific reason (>= 20 chars)");

  const bill = (
    await client.query<{
      id: string; status: string; voided_at: string | null; settled_in_settlement_id: string | null;
      gross_amount_cents: string | null; load_number: string | null; rate: string | null; override_reason: string | null;
    }>(
      `SELECT db.id::text, db.status, db.voided_at::text, db.settled_in_settlement_id::text,
              db.gross_amount_cents::text, l.load_number,
              l.driver_pay_rate_per_mile::text AS rate, l.driver_pay_rate_override_reason AS override_reason
         FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id AND l.operating_company_id = db.operating_company_id
        WHERE db.id = $1::uuid AND db.operating_company_id = $2::uuid
        FOR UPDATE OF db`,
      [input.driverBillId, input.operatingCompanyId],
    )
  ).rows[0];
  if (!bill) throw new StraySalariedBillVoidRefusedError("driver bill not found for this company");
  if (bill.voided_at || bill.status !== "open") throw new StraySalariedBillVoidRefusedError(`bill is ${bill.voided_at ? "already void" : `status '${bill.status}'`} — only an OPEN bill`);
  if (bill.settled_in_settlement_id) throw new StraySalariedBillVoidRefusedError("bill was settled in a settlement — not a stray bill");
  const salaried = bill.rate != null && Number(bill.rate) === 0 && /^(salaried|local driver — weekly salary)/i.test((bill.override_reason ?? "").trim()) && (bill.override_reason ?? "").trim().length >= 10;
  if (!salaried) throw new StraySalariedBillVoidRefusedError("the bill's load is not a Salaried 0-rate override load");

  const links = (
    await client.query<{ lines: string; gl_bills: string; postings: string }>(
      `SELECT
         (SELECT count(*) FROM driver_finance.settlement_lines sl WHERE sl.source_driver_bill_id = $1::uuid AND sl.voided_at IS NULL AND sl.is_active)::text AS lines,
         (SELECT count(*) FROM driver_finance.driver_settlement_gl_bills gb WHERE gb.driver_bill_id = $1::uuid)::text AS gl_bills,
         (SELECT count(*) FROM accounting.journal_entry_postings p WHERE p.source_transaction_id = $1::text)::text AS postings`,
      [input.driverBillId],
    )
  ).rows[0];
  if (Number(links.lines) > 0) throw new StraySalariedBillVoidRefusedError(`bill has ${links.lines} live settlement line(s) — not a stray bill`);
  if (Number(links.gl_bills) > 0) throw new StraySalariedBillVoidRefusedError("bill is on an A/P-chain settlement run — not a stray bill");
  if (Number(links.postings) > 0) throw new StraySalariedBillVoidRefusedError("bill carries journal-entry postings — reverse through the ledger, not here");

  const upd = await client.query<{ id: string }>(
    `UPDATE driver_finance.driver_bills
        SET status = 'void', voided_at = now(), void_reason = $2, voided_by_user_id = $3::uuid, updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $4::uuid AND status = 'open' AND voided_at IS NULL
      RETURNING id::text`,
    [input.driverBillId, reason, input.actorUserId, input.operatingCompanyId],
  );
  if (!upd.rows[0]) throw new StraySalariedBillVoidRefusedError("bill changed while voiding — nothing voided");

  const result: VoidStraySalariedBillResult = {
    voided_bill_id: input.driverBillId,
    load_number: bill.load_number,
    gross_amount_cents: Number(bill.gross_amount_cents ?? 0),
  };
  await audit("driver_finance.driver_bill.voided_stray_salaried", {
    resource_id: input.driverBillId,
    resource_type: "driver_finance.driver_bills",
    operating_company_id: input.operatingCompanyId,
    load_number: bill.load_number,
    gross_amount_cents: result.gross_amount_cents,
    reason,
  });
  return result;
}
