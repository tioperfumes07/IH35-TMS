/**
 * LEAD 443.105 item 1 (P38 Wave-A, project law "every record links to its hubs") — THE one rule for "which trailer
 * does this load's money belong to". Companion of sameEntityLoadUnitSql (load-unit.sql.ts).
 *
 * Two kinds, never both:
 *   - CUSTOMER trailer (443.90 printed-trailer decision): mdata.loads.trailer_source = 'customer' — the load points at
 *     its dispatch.non_owned_trailers row (mdata.loads.non_owned_trailer_id), exactly as accounting.expenses carries it.
 *   - COMPANY trailer (any other load): the trailer the load's assignment recorded — the latest
 *     dispatch.load_assignment_history.new_trailer_id, the same sink accounting.expenses_trailer_from_load() reads (the
 *     expense trailer trigger) — or, when the load has no assignment trailer (loads booked by the Settlement Creator
 *     carry the post's trailer on that post's expenses), the ONE trailer the load's live expenses carry. Two different
 *     expense trailers on one load => no answer (NULL), never a guess. The trailer counts only when the load's own
 *     company owns or currently leases it — the rule mdata.refuse_cross_company_reference enforces on
 *     accounting.bills.trailer_id / bill_lines.equipment_id.
 *
 * Every writer that stamps a trailer from a load (the per-load driver-bill writers in settlement-ap-chain.service.ts
 * and settlement-bill-payment-posting.service.ts, and the posted-bill stamp in bill-trailer-stamp.service.ts) reads it
 * from here, so the forward path and the back-stamp can never disagree.
 *
 * Both return a scalar subquery (uuid or NULL). Aliases are private (lt_*) so they never capture a caller's own names.
 */
export function sameEntityLoadCompanyTrailerSql(loadIdExpr: string, companyExpr: string): string {
  return `(SELECT lt_e.id FROM mdata.loads lt_l
             JOIN mdata.equipment lt_e ON lt_e.id = COALESCE(
               (SELECT lt_h.new_trailer_id FROM dispatch.load_assignment_history lt_h
                 WHERE lt_h.load_id = lt_l.id AND lt_h.new_trailer_id IS NOT NULL
                 ORDER BY lt_h.created_at DESC LIMIT 1),
               (SELECT (array_agg(DISTINCT lt_x.trailer_id))[1] FROM accounting.expenses lt_x
                 WHERE lt_x.load_id = lt_l.id AND lt_x.operating_company_id = lt_l.operating_company_id
                   AND lt_x.voided_at IS NULL AND lt_x.trailer_id IS NOT NULL
                HAVING count(DISTINCT lt_x.trailer_id) = 1))
            WHERE lt_l.id = ${loadIdExpr} AND lt_l.operating_company_id = ${companyExpr}
              AND lt_l.trailer_source IS DISTINCT FROM 'customer'
              AND (lt_e.owner_company_id = lt_l.operating_company_id OR lt_e.currently_leased_to_company_id = lt_l.operating_company_id))`;
}

export function loadNonOwnedTrailerSql(loadIdExpr: string, companyExpr: string): string {
  return `(SELECT lt_n.id FROM mdata.loads lt_l
             JOIN dispatch.non_owned_trailers lt_n ON lt_n.id = lt_l.non_owned_trailer_id
                                                  AND lt_n.operating_company_id = lt_l.operating_company_id
            WHERE lt_l.id = ${loadIdExpr} AND lt_l.operating_company_id = ${companyExpr}
              AND lt_l.trailer_source = 'customer')`;
}
