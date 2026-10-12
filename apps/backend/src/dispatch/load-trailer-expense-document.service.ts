/**
 * LEAD 443.109 (ruled (a), owner 2026-10-12: "the document decides") — record a load's physical trailer from the trailer
 * named on the load's OWN live expense documents.
 *
 * Why: 443.107's GPS match proved Samsara holds no trailer GPS for the fleet (0 rows for 82 trailers at real truck
 * dwells), so GPS cannot decide. The Settlement Creator books each post's trailer onto that post's expenses, so the
 * load's own expenses are the document of record for its trailer.
 *
 * Candidates: live loads of the company with no assignment trailer (dispatch.load_assignment_history.new_trailer_id)
 * that are not customer-trailer loads (those keep their non-owned trailer). The trailer is the ONE distinct trailer
 * across the load's live expenses (header trailer_id) and their live lines (expense_lines.trailer_id) — and only when
 * the load's own company owns or currently leases it (the same-entity rule of load-trailer.sql.ts). Zero -> listed
 * ("no trailer on any expense"); two or more -> listed ("expenses name two trailers"), never a guess, nothing written.
 *
 * WRITES (dryRun=false), each load in its own SAVEPOINT, METADATA ONLY (never an amount, account, status or JE):
 *   1. a dispatch.load_assignment_history row (assignment_method 'auto_reassign', reason_code 'expense_document_trailer',
 *      notes naming the expense ids) — the load's assignment trailer, which load-trailer.sql.ts, the expense trailer
 *      trigger and the driver-bill writers all read;
 *   2. the same trailer on the load's other live expenses / lines whose trailer is still empty (only where NULL);
 *   3. one audit event load.trailer_from_expense_document.
 * The route then runs the existing Owner driver-bill trailer stamp (only-where-NULL). A load that already has an
 * assignment trailer is not a candidate, so a second run writes nothing.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";

type Queryable = { query: <R = any>(sql: string, params?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }> };

export type LoadExpenseTrailerDecision = {
  load_id: string;
  load_number: string | null;
  decision: "match" | "no_expense_trailer" | "two_trailers";
  trailer_id: string | null;
  trailer_number: string | null;
  expense_ids: string[];
  reason: string;
  outcome: "planned" | "stamped" | "skipped" | "refused";
  expenses_stamped?: number;
  expense_lines_stamped?: number;
  error?: string;
};

export type LoadExpenseTrailerResult = {
  dry_run: boolean;
  operating_company_id: string;
  loads_considered: number;
  matched: number;
  no_expense_trailer: number;
  two_trailers: number;
  stamped_loads: number;
  refused_loads: number;
  loads: LoadExpenseTrailerDecision[];
};

export async function stampLoadTrailersFromExpenses(
  client: Queryable,
  input: { operatingCompanyId: string; actorUserId: string; dryRun: boolean; loadIds?: string[] }
): Promise<LoadExpenseTrailerResult> {
  const opco = input.operatingCompanyId;
  const loads = (
    await client.query<{
      id: string; load_number: string | null;
      trailers: { id: string; number: string | null; same_entity: boolean }[] | null; expense_ids: string[] | null;
    }>(
      `WITH cand AS (
         SELECT l.id, l.load_number, l.operating_company_id
           FROM mdata.loads l
          WHERE l.operating_company_id = $1::uuid
            AND l.voided_at IS NULL AND l.soft_deleted_at IS NULL
            AND l.trailer_source IS DISTINCT FROM 'customer'
            AND NOT EXISTS (SELECT 1 FROM dispatch.load_assignment_history h
                             WHERE h.load_id = l.id AND h.operating_company_id = l.operating_company_id AND h.new_trailer_id IS NOT NULL)
            AND ($2::uuid[] IS NULL OR l.id = ANY($2::uuid[]))
       ), named AS (
         SELECT x.load_id, x.trailer_id, x.id AS expense_id
           FROM accounting.expenses x JOIN cand c ON c.id = x.load_id AND c.operating_company_id = x.operating_company_id
          WHERE x.voided_at IS NULL AND x.trailer_id IS NOT NULL
         UNION ALL
         SELECT x.load_id, el.trailer_id, x.id
           FROM accounting.expense_lines el
           JOIN accounting.expenses x ON x.id = el.expense_id AND x.operating_company_id = el.operating_company_id
           JOIN cand c ON c.id = x.load_id AND c.operating_company_id = x.operating_company_id
          WHERE x.voided_at IS NULL AND el.trailer_id IS NOT NULL
       )
       SELECT c.id::text, c.load_number::text,
              (SELECT json_agg(DISTINCT jsonb_build_object(
                        'id', n.trailer_id::text, 'number', e.equipment_number::text, 'same_entity', e.id IS NOT NULL))
                 FROM named n
                 LEFT JOIN mdata.equipment e ON e.id = n.trailer_id
                                            AND (e.owner_company_id = c.operating_company_id OR e.currently_leased_to_company_id = c.operating_company_id)
                WHERE n.load_id = c.id) AS trailers,
              (SELECT array_agg(DISTINCT n.expense_id::text) FROM named n WHERE n.load_id = c.id) AS expense_ids
         FROM cand c
        ORDER BY c.load_number`,
      [opco, input.loadIds?.length ? input.loadIds : null]
    )
  ).rows;

  const result: LoadExpenseTrailerResult = {
    dry_run: input.dryRun, operating_company_id: opco, loads_considered: loads.length,
    matched: 0, no_expense_trailer: 0, two_trailers: 0, stamped_loads: 0, refused_loads: 0, loads: [],
  };

  for (const l of loads) {
    const named = l.trailers ?? [];
    const d: LoadExpenseTrailerDecision = {
      load_id: l.id, load_number: l.load_number, decision: "no_expense_trailer", trailer_id: null, trailer_number: null,
      expense_ids: l.expense_ids ?? [], reason: "", outcome: "skipped",
    };
    result.loads.push(d);
    if (named.length === 0) {
      d.reason = "no trailer on any expense";
      result.no_expense_trailer += 1;
      continue;
    }
    if (named.length > 1) {
      // A trailer of another company still counts: two distinct trailers named is never resolved by dropping one.
      d.decision = "two_trailers";
      d.reason = `expenses name two trailers: ${named.map((t) => t.number ?? t.id).join(",")}`;
      result.two_trailers += 1;
      continue;
    }
    const t = named[0]!;
    if (!t.same_entity) {
      // The load's company neither owns nor leases it — never written (mdata.refuse_cross_company_reference law).
      d.reason = `expense trailer ${t.number ?? t.id} is not owned or leased by the load's company — not written`;
      result.no_expense_trailer += 1;
      continue;
    }
    d.decision = "match";
    d.trailer_id = t.id;
    d.trailer_number = t.number;
    d.reason = `trailer ${t.number ?? t.id} named on ${d.expense_ids.length} live expense document(s)`;
    d.outcome = "planned";
    result.matched += 1;
    if (input.dryRun) continue;

    await client.query("SAVEPOINT expense_trailer_load");
    try {
      await client.query(
        `INSERT INTO dispatch.load_assignment_history
           (operating_company_id, load_id, assignment_method, previous_trailer_id, new_trailer_id,
            assigned_by_user_id, warnings_acknowledged, reason_code, notes)
         VALUES ($1::uuid, $2::uuid, 'auto_reassign', NULL, $3::uuid, $4::uuid, '[]'::jsonb, 'expense_document_trailer', $5)`,
        [opco, l.id, t.id, input.actorUserId, JSON.stringify({ rule: "LEAD 443.109 — the load's own expense documents name the trailer", expense_ids: d.expense_ids })]
      );
      const ex = await client.query<{ id: string }>(
        `UPDATE accounting.expenses x SET trailer_id = $3::uuid
          WHERE x.load_id = $2::uuid AND x.operating_company_id = $1::uuid AND x.voided_at IS NULL
            AND x.trailer_id IS NULL AND x.non_owned_trailer_id IS NULL
          RETURNING x.id::text`,
        [opco, l.id, t.id]
      );
      const exl = await client.query(
        `UPDATE accounting.expense_lines el SET trailer_id = $3::uuid
           FROM accounting.expenses x
          WHERE el.expense_id = x.id AND el.operating_company_id = x.operating_company_id
            AND x.load_id = $2::uuid AND x.operating_company_id = $1::uuid AND x.voided_at IS NULL
            AND x.non_owned_trailer_id IS NULL AND el.trailer_id IS NULL`,
        [opco, l.id, t.id]
      );
      d.expenses_stamped = ex.rows.length;
      d.expense_lines_stamped = exl.rowCount ?? 0;
      await appendCrudAudit(
        client as never,
        input.actorUserId,
        "load.trailer_from_expense_document",
        { resource_type: "mdata.loads", resource_id: l.id, operating_company_id: opco, load_number: l.load_number,
          trailer_id: t.id, trailer_number: t.number, expense_ids: d.expense_ids,
          expenses_stamped: d.expenses_stamped, expense_lines_stamped: d.expense_lines_stamped },
        "info",
        "LEAD-443.109-EXPENSE-DOCUMENT-TRAILER"
      );
      await client.query("RELEASE SAVEPOINT expense_trailer_load");
      d.outcome = "stamped";
      result.stamped_loads += 1;
    } catch (e) {
      await client.query("ROLLBACK TO SAVEPOINT expense_trailer_load");
      d.outcome = "refused";
      d.error = String((e as Error)?.message ?? e);
      result.refused_loads += 1;
    }
  }
  return result;
}
