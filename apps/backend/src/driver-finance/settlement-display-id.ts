import type { Queryable } from "./settlement-source-document-ref.service.js";

/**
 * R-186.1 (owner 2026-09-25 06:35 PM CT): open pre-settlements get OUR P-series
 * (P-0001…), NEVER AlwaysTrack's continuing sequence. allocateNextSettlementSourceDocumentRef
 * minted fake 5817/5818/5819 on open — that path is retired for display_id.
 *
 * AlwaysTrack numbers typed by the owner land in source_document_ref via the editable
 * header / Creator field (setSettlementSourceDocumentRef), not this allocator.
 *
 * periodDate kept for call-site compatibility; P-series is opco-scoped, not date-scoped.
 */
export async function allocateSettlementDisplayId(
  client: Queryable,
  operatingCompanyId: string,
  periodDate: string,
): Promise<string> {
  void periodDate;
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
    `settlement-p-series:${operatingCompanyId}`,
  ]);
  const res = await client.query<{ next: string }>(
    `
      SELECT ('P-' || lpad((COALESCE(MAX(substring(display_id from '^P-([0-9]+)$')::int), 0) + 1)::text, 4, '0')) AS next
        FROM driver_finance.driver_settlements
       WHERE operating_company_id = $1::uuid
         AND display_id ~ '^P-[0-9]+$'
    `,
    [operatingCompanyId],
  );
  const id = res.rows[0]?.next;
  if (typeof id !== "string" || !/^P-\d{4,}$/.test(id)) {
    throw new Error("Settlement number allocation failed: expected P-NNNN");
  }
  return id;
}

/** True when the typed value is our editable P-series (not an AlwaysTrack document number). */
export function isPresettlementPSeries(value: string): boolean {
  return /^P-\d{4,}$/i.test(value.trim());
}

/** True when the typed value is a bare AlwaysTrack settlement document number. */
export function isAlwaysTrackSettlementNumber(value: string): boolean {
  return /^\d{4,}$/.test(value.trim());
}
