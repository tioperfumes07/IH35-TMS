import { allocateNextSettlementSourceDocumentRef, type Queryable } from "./settlement-source-document-ref.service.js";

/**
 * P0-B (Lead ruling, 2026-09-22): "The AlwaysTrack settlement document number IS the settlement
 * number... No parallel series, no synthetic counter, no zero-padding, no S-YYYY- prefix inventing
 * a second identity for a document that already has one."
 *
 * SUPERSEDES the old body of this function (`SELECT driver_finance.next_settlement_display_id(...)`,
 * a synthetic per-(opco,year) "S-YYYY-NNNN" MAX()+1 counter, completely independent of the real
 * AlwaysTrack document number stored in source_document_ref) — confirmed live to have already
 * diverged in production (e.g. display_id="S-2026-5825" vs source_document_ref="5814").
 *
 * Reuses, does not reinvent: allocateNextSettlementSourceDocumentRef (settlement-source-document-
 * ref.service.ts) is the EXISTING, owner-ruled minting function for exactly this moment -- its own
 * header quotes the owner verbatim (2026-09-11): "we do assign a presettlement number instantly,
 * always assigns when the load is closed. i want it assigned instantly i think it is better
 * control." It continues the real AlwaysTrack sequence (floor 5803, so the first instant-minted
 * number is 5804), company-scoped, advisory-lock-serialized against concurrent opens. Until now it
 * only ever populated source_document_ref, via a SEPARATE, later, deferred call
 * (setSettlementSourceDocumentRef) -- display_id was minted from the unrelated synthetic counter
 * in the meantime. This wrapper now mints display_id from the SAME sequence, at the SAME instant,
 * so the two fields start in agreement by construction rather than coincidentally overlapping for
 * a while and then drifting apart. The later deferred source_document_ref-set step is UNCHANGED
 * and stays the audited record of a real AlwaysTrack document match; re-confirming the same value
 * it was instant-assigned is a documented no-op per that function's own contract.
 *
 * periodDate is accepted for call-site compatibility (all 6 existing callers pass it) but is no
 * longer used to compute the number -- the AlwaysTrack sequence is opco-scoped, not date-scoped.
 */
export async function allocateSettlementDisplayId(
  client: Queryable,
  operatingCompanyId: string,
  periodDate: string,
): Promise<string> {
  void periodDate;
  const id = await allocateNextSettlementSourceDocumentRef(client, operatingCompanyId);
  if (typeof id !== "string" || !/^\d+$/.test(id)) {
    throw new Error("Settlement number allocation failed: expected a bare AlwaysTrack-sequence number");
  }
  return id;
}
