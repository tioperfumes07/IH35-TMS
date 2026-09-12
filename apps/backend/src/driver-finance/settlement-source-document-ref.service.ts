/**
 * settlement-source-document-ref.service.ts — ROUND 10 SOURCE-DOCUMENT-REF.
 *
 * The signed settlement number (5769–5787, "USMCA BY LOAD" sheet col C) has no durable, queryable
 * home today — driver_finance.driver_settlements.display_id is a GENERATED value (the shared
 * LOAD/`S-` counter, see docs/audit/TOUR-SPLIT-PLAN-2026-09-06.md §1a) and cannot be repointed to
 * read it. Migration 202613820000 adds the additive `source_document_ref text NULL` column; this
 * is the ONE real service function that writes it — company-scoped, audited, never a raw ad-hoc
 * UPDATE from a script.
 *
 * SCOPE: this is a metadata tag on an EXISTING settlement row (the plan's "KEEP" case) — it never
 * creates a settlement, never repoints a load's presettlement_link_id, and never touches load
 * status. The 7 signed numbers the plan proposes as brand-new settlement rows are OUT OF SCOPE for
 * this function (that is the actual tour split, gated behind the lead's ✔ per
 * scripts/ops/split-seed-tours.ts's own header).
 */
import { appendCrudAudit } from "../audit/crud-audit.js";

export type Queryable = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export type SetSettlementSourceDocumentRefInput = {
  operatingCompanyId: string;
  settlementId: string;
  sourceDocumentRef: string;
  actorUserId: string;
};

/**
 * Sets driver_finance.driver_settlements.source_document_ref for exactly one settlement, scoped
 * to operating_company_id (never a cross-tenant write). Idempotent: re-running with the same value
 * is a no-op re-write, not an error. Returns the updated row, or null if no row matched (wrong id /
 * wrong company — never silently succeeds on a miss).
 */
/**
 * INSTANT PRE-SETTLEMENT NUMBER (owner ruling 2026-09-11, verbatim: "we do assign a presettlement
 * number instantly, always assigns when the load is closed. i want it assigned instantly i think
 * it is better control."). AllwaysTrack mints the settlement number only at CLOSE; we mint it the
 * instant a tour OPENS and keep it through close — so Pre-Settlement shows a real number, not a dash.
 *
 * The number CONTINUES the AllwaysTrack sequence: the imported closed tours end at 5803
 * (source_document_ref 5769..5803), so the first instant-minted open tour is 5804. Floor 5803 keeps
 * that invariant even if the max-imported row is ever voided. Company-scoped; a per-company advisory
 * lock serializes concurrent NB opens so two tours can never grab the same number. Returns the
 * allocated number as a string; the caller writes it via setSettlementSourceDocumentRef.
 */
const SETTLEMENT_SOURCE_DOC_REF_FLOOR = 5803; // last AllwaysTrack-imported closed tour; first minted = 5804

export async function allocateNextSettlementSourceDocumentRef(
  client: Queryable,
  operatingCompanyId: string
): Promise<string> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
    `settlement-source-doc-ref:${operatingCompanyId}`,
  ]);
  const res = await client.query<{ next: string }>(
    `
      SELECT (GREATEST($2::int, COALESCE(MAX((source_document_ref)::int), 0)) + 1)::text AS next
        FROM driver_finance.driver_settlements
       WHERE operating_company_id = $1::uuid
         AND source_document_ref ~ '^[0-9]+$'
    `,
    [operatingCompanyId, SETTLEMENT_SOURCE_DOC_REF_FLOOR]
  );
  return res.rows[0]!.next;
}

export async function setSettlementSourceDocumentRef(
  client: Queryable,
  input: SetSettlementSourceDocumentRefInput
): Promise<{ id: string; display_id: string; source_document_ref: string | null } | null> {
  const ref = input.sourceDocumentRef.trim();
  if (!ref) throw new Error("E_EMPTY_SOURCE_DOCUMENT_REF: sourceDocumentRef must be non-empty");

  const res = await client.query<{ id: string; display_id: string; source_document_ref: string | null }>(
    `
      UPDATE driver_finance.driver_settlements
         SET source_document_ref = $3, updated_at = now()
       WHERE id = $1::uuid
         AND operating_company_id = $2::uuid
       RETURNING id, display_id, source_document_ref
    `,
    [input.settlementId, input.operatingCompanyId, ref]
  );

  const row = res.rows[0];
  if (!row) return null;

  await appendCrudAudit(
    client,
    input.actorUserId,
    "driver_finance.settlement.source_document_ref_set",
    {
      resource_type: "driver_finance.driver_settlements",
      resource_id: row.id,
      operating_company_id: input.operatingCompanyId,
      display_id: row.display_id,
      source_document_ref: row.source_document_ref,
    },
    "info",
    "ROUND-10-SOURCE-DOCUMENT-REF"
  );

  return row;
}
