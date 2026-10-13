/**
 * LEAD 443.105 item 1 (P38 Wave-A, project law "every record links to its hubs") — stamp the trailer on POSTED driver
 * bills from their loads. Companion of bill-unit-stamp.service.ts (443.102 ruling 1); same shape, same guarantees.
 *
 * WHY: the per-load driver-bill writers never passed the load's trailer, so every driver-pay bill floated off its
 * trailer (prod 2026-10-12: 146 of 146 live USMCA driver bills with trailer_id NULL; 10 of their loads ride a customer
 * trailer). The forward writers are fixed in the same change; this is the Owner engine path for the bills already posted.
 *
 * METADATA ONLY: it writes accounting.bills.trailer_id (company trailer) or accounting.bills.non_owned_trailer_id
 * (customer trailer), and accounting.bill_lines.equipment_id (company trailer) — only where NULL. Never an amount,
 * account, item, status, journal entry or posting. The trailer comes from load-trailer.sql.ts (the SAME rule the
 * forward writers use). A bill's header takes the trailer only when every live load line resolves to one and the same
 * trailer of one kind; otherwise the header stays NULL (reported).
 *
 * Owner only (refusal audited). dryRun returns the whole plan and writes nothing. Each bill is stamped inside its own
 * SAVEPOINT: a bill the database refuses is rolled back alone and reported, never half-stamped. One audit row per
 * stamped bill (before / after). Idempotent: a second run plans 0 changes.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { loadNonOwnedTrailerSql, sameEntityLoadCompanyTrailerSql } from "./load-trailer.sql.js";

type Queryable = { query: <R = any>(sql: string, params?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }> };

export class BillTrailerStampError extends Error {
  constructor(public readonly code: "owner_only", message: string, public readonly statusCode: number) {
    super(message);
    this.name = "BillTrailerStampError";
  }
}

export type TrailerKind = "company" | "non_owned";
export type BillTrailerStampLine = {
  line_id: string;
  load_id: string;
  load_number: string | null;
  kind: TrailerKind | null;
  trailer_id: string | null;
  trailer_number: string | null;
  action: "stamp" | "skip";
  reason?: string;
};
export type BillTrailerStampBill = {
  bill_id: string;
  bill_number: string | null;
  display_id: string | null;
  header: { action: "stamp" | "keep_null" | "already_set"; kind: TrailerKind | null; trailer_id: string | null; trailer_number: string | null; reason?: string };
  lines: BillTrailerStampLine[];
  outcome: "planned" | "stamped" | "refused";
  error?: string;
};
export type BillTrailerStampResult = {
  dry_run: boolean;
  operating_company_id: string;
  bills_considered: number;
  bills_changed: number;
  header_stamps: number;
  company_trailer_headers: number;
  non_owned_trailer_headers: number;
  line_stamps: number;
  no_trailer_bills: number;
  mixed_trailer_bills: number;
  refused_bills: number;
  bills: BillTrailerStampBill[];
};

const AUDIT_EVENT = "bill.trailer_stamped_from_load";

/** Owner gate: anyone else is refused with 403 and the refusal is audited. */
export async function refuseNonOwnerBillTrailerStamp(client: Queryable, actor: { userId: string; role?: string | null }, opco: string): Promise<void> {
  if (actor.role === "Owner") return;
  await appendCrudAudit(
    client as never,
    actor.userId,
    "bill.trailer_stamp_refused_non_owner",
    { resource_type: "accounting.bills", operating_company_id: opco, role: actor.role ?? null },
    "warning",
    "LEAD-443.105-OWNER-ONLY"
  );
  throw new BillTrailerStampError("owner_only", "Only the Owner can stamp trailers on posted bills.", 403);
}

export type TrailerCandidateRow = {
  bill_id: string;
  bill_number: string | null;
  display_id: string | null;
  header_trailer_id: string | null;
  header_non_owned_trailer_id: string | null;
  line_id: string;
  load_id: string;
  load_number: string | null;
  line_equipment_id: string | null;
  company_trailer_id: string | null;
  company_trailer_number: string | null;
  non_owned_trailer_id: string | null;
  non_owned_trailer_number: string | null;
};

/** Live driver bills of the company that still miss a trailer on the header or (company trailer) on a load line. */
async function loadCandidates(client: Queryable, opco: string): Promise<TrailerCandidateRow[]> {
  const r = await client.query<TrailerCandidateRow>(
    `SELECT b.id::text AS bill_id, b.bill_number, b.display_id,
            b.trailer_id::text AS header_trailer_id, b.non_owned_trailer_id::text AS header_non_owned_trailer_id,
            bl.id::text AS line_id, bl.load_id::text AS load_id, l.load_number,
            bl.equipment_id::text AS line_equipment_id,
            ct.trailer_id::text AS company_trailer_id, e.equipment_number AS company_trailer_number,
            nt.trailer_id::text AS non_owned_trailer_id, n.trailer_number AS non_owned_trailer_number
       FROM accounting.bills b
       JOIN accounting.bill_lines bl ON bl.bill_id = b.id AND bl.operating_company_id = b.operating_company_id
                                    AND bl.voided_at IS NULL AND bl.load_id IS NOT NULL
       LEFT JOIN mdata.loads l ON l.id = bl.load_id AND l.operating_company_id = b.operating_company_id
       LEFT JOIN LATERAL (SELECT ${sameEntityLoadCompanyTrailerSql("bl.load_id", "b.operating_company_id")} AS trailer_id) ct ON true
       LEFT JOIN LATERAL (SELECT ${loadNonOwnedTrailerSql("bl.load_id", "b.operating_company_id")} AS trailer_id) nt ON true
       LEFT JOIN mdata.equipment e ON e.id = ct.trailer_id
                                  AND (e.owner_company_id = b.operating_company_id OR e.currently_leased_to_company_id = b.operating_company_id)
       LEFT JOIN dispatch.non_owned_trailers n ON n.id = nt.trailer_id AND n.operating_company_id = b.operating_company_id
      WHERE b.operating_company_id = $1::uuid
        AND b.driver_id IS NOT NULL
        AND b.voided_at IS NULL AND b.revoked_at IS NULL AND COALESCE(b.status, '') <> 'void'
        AND ((b.trailer_id IS NULL AND b.non_owned_trailer_id IS NULL) OR (bl.equipment_id IS NULL AND ct.trailer_id IS NOT NULL))
      ORDER BY b.bill_date NULLS LAST, b.bill_number NULLS LAST, b.id, bl.line_sequence NULLS LAST, bl.id`,
    [opco]
  );
  return r.rows;
}

/** Pure planner: groups candidate lines per bill and decides header + line stamps. Exported for the unit tests. */
export function planBillTrailerStamps(rows: TrailerCandidateRow[]): BillTrailerStampBill[] {
  const byBill = new Map<string, TrailerCandidateRow[]>();
  for (const r of rows) {
    const list = byBill.get(r.bill_id) ?? [];
    list.push(r);
    byBill.set(r.bill_id, list);
  }
  const out: BillTrailerStampBill[] = [];
  for (const [billId, list] of byBill) {
    const first = list[0]!;
    const derive = (r: TrailerCandidateRow): { kind: TrailerKind | null; id: string | null; number: string | null } =>
      r.company_trailer_id
        ? { kind: "company", id: r.company_trailer_id, number: r.company_trailer_number }
        : r.non_owned_trailer_id
          ? { kind: "non_owned", id: r.non_owned_trailer_id, number: r.non_owned_trailer_number }
          : { kind: null, id: null, number: null };
    const lines: BillTrailerStampLine[] = list.map((r) => {
      const d = derive(r);
      const base = { line_id: r.line_id, load_id: r.load_id, load_number: r.load_number, kind: d.kind, trailer_id: d.id, trailer_number: d.number };
      if (d.kind !== "company") return { ...base, action: "skip", reason: d.kind === "non_owned" ? "customer_trailer_lives_on_the_header" : "load_has_no_recorded_trailer" };
      if (r.line_equipment_id) return { ...base, trailer_id: r.line_equipment_id, action: "skip", reason: "line_already_has_equipment" };
      return { ...base, action: "stamp" };
    });
    let header: BillTrailerStampBill["header"];
    if (first.header_trailer_id || first.header_non_owned_trailer_id) {
      header = {
        action: "already_set",
        kind: first.header_trailer_id ? "company" : "non_owned",
        trailer_id: first.header_trailer_id ?? first.header_non_owned_trailer_id,
        trailer_number: null,
      };
    } else {
      const derived = list.map(derive);
      const keys = new Set(derived.map((d) => (d.kind ? `${d.kind}:${d.id}` : null)));
      const only = keys.size === 1 ? derived[0]! : null;
      if (only && only.kind) {
        header = { action: "stamp", kind: only.kind, trailer_id: only.id, trailer_number: only.number };
      } else {
        header = { action: "keep_null", kind: null, trailer_id: null, trailer_number: null, reason: keys.has(null) ? "a_load_line_has_no_recorded_trailer" : "lines_name_different_trailers" };
      }
    }
    const changes = (header.action === "stamp" ? 1 : 0) + lines.filter((x) => x.action === "stamp").length;
    if (changes === 0 && header.action !== "keep_null") continue;
    out.push({ bill_id: billId, bill_number: first.bill_number, display_id: first.display_id, header, lines, outcome: "planned" });
  }
  return out;
}

export async function stampDriverBillTrailersFromLoads(
  client: Queryable,
  input: { operatingCompanyId: string; actorUserId: string; actorRole?: string | null; dryRun: boolean }
): Promise<BillTrailerStampResult> {
  const opco = input.operatingCompanyId;
  await refuseNonOwnerBillTrailerStamp(client, { userId: input.actorUserId, role: input.actorRole }, opco);

  const plan = planBillTrailerStamps(await loadCandidates(client, opco));
  const result: BillTrailerStampResult = {
    dry_run: input.dryRun,
    operating_company_id: opco,
    bills_considered: plan.length,
    bills_changed: 0,
    header_stamps: 0,
    company_trailer_headers: 0,
    non_owned_trailer_headers: 0,
    line_stamps: 0,
    no_trailer_bills: plan.filter((b) => b.header.action === "keep_null" && b.header.reason === "a_load_line_has_no_recorded_trailer").length,
    mixed_trailer_bills: plan.filter((b) => b.header.action === "keep_null" && b.header.reason === "lines_name_different_trailers").length,
    refused_bills: 0,
    bills: plan,
  };
  if (input.dryRun) {
    const stampHeaders = plan.filter((b) => b.header.action === "stamp");
    result.header_stamps = stampHeaders.length;
    result.company_trailer_headers = stampHeaders.filter((b) => b.header.kind === "company").length;
    result.non_owned_trailer_headers = stampHeaders.filter((b) => b.header.kind === "non_owned").length;
    result.line_stamps = plan.reduce((n, b) => n + b.lines.filter((l) => l.action === "stamp").length, 0);
    result.bills_changed = plan.filter((b) => b.header.action === "stamp" || b.lines.some((l) => l.action === "stamp")).length;
    return result;
  }

  for (const bill of plan) {
    const stampLines = bill.lines.filter((l) => l.action === "stamp");
    if (bill.header.action !== "stamp" && stampLines.length === 0) continue;
    await client.query("SAVEPOINT bill_trailer_stamp");
    try {
      let headerDone = 0;
      if (bill.header.action === "stamp") {
        const column = bill.header.kind === "company" ? "trailer_id" : "non_owned_trailer_id";
        const h = await client.query(
          `UPDATE accounting.bills SET ${column} = $3::uuid, updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $2::uuid AND trailer_id IS NULL AND non_owned_trailer_id IS NULL`,
          [bill.bill_id, opco, bill.header.trailer_id]
        );
        headerDone = h.rowCount ?? 0;
      }
      let linesDone = 0;
      for (const line of stampLines) {
        const u = await client.query(
          `UPDATE accounting.bill_lines SET equipment_id = $3::uuid
            WHERE id = $1::uuid AND operating_company_id = $2::uuid AND equipment_id IS NULL`,
          [line.line_id, opco, line.trailer_id]
        );
        linesDone += u.rowCount ?? 0;
      }
      await appendCrudAudit(
        client as never,
        input.actorUserId,
        AUDIT_EVENT,
        {
          resource_type: "accounting.bills",
          resource_id: bill.bill_id,
          bill_id: bill.bill_id,
          operating_company_id: opco,
          bill_number: bill.bill_number,
          display_id: bill.display_id,
          ruling: "LEAD 443.105 item 1 — metadata only (no amount / account / JE change)",
          before: { trailer_id: null, non_owned_trailer_id: null, lines: stampLines.map((l) => ({ line_id: l.line_id, load_id: l.load_id, equipment_id: null })) },
          after: {
            kind: bill.header.action === "stamp" ? bill.header.kind : null,
            trailer_id: bill.header.action === "stamp" && bill.header.kind === "company" ? bill.header.trailer_id : null,
            non_owned_trailer_id: bill.header.action === "stamp" && bill.header.kind === "non_owned" ? bill.header.trailer_id : null,
            trailer_number: bill.header.trailer_number,
            header_reason: bill.header.reason ?? null,
            lines: stampLines.map((l) => ({ line_id: l.line_id, load_id: l.load_id, equipment_id: l.trailer_id, trailer_number: l.trailer_number })),
          },
        },
        "info",
        "LEAD-443.105-TRAILER-STAMP"
      );
      await client.query("RELEASE SAVEPOINT bill_trailer_stamp");
      bill.outcome = "stamped";
      result.bills_changed += headerDone + linesDone > 0 ? 1 : 0;
      result.header_stamps += headerDone;
      if (headerDone && bill.header.kind === "company") result.company_trailer_headers += 1;
      if (headerDone && bill.header.kind === "non_owned") result.non_owned_trailer_headers += 1;
      result.line_stamps += linesDone;
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT bill_trailer_stamp");
      bill.outcome = "refused";
      bill.error = String((err as Error)?.message ?? err).slice(0, 300);
      result.refused_bills += 1;
    }
  }
  return result;
}

/**
 * Forward path (443.105 item 1): stamp ONE just-created per-load driver bill with its load's trailer, in the writer's own
 * transaction, from the same rule as the back-stamp. Company trailer -> bills.trailer_id + its load lines' equipment_id;
 * customer trailer -> bills.non_owned_trailer_id. Only where NULL; metadata only. Returns the kind stamped (or null when
 * the load has no recorded trailer).
 */
export async function stampNewDriverBillTrailerFromLoad(client: Queryable, input: { operatingCompanyId: string; billId: string; loadId: string }): Promise<TrailerKind | null> {
  const r = await client.query<{ company_trailer_id: string | null; non_owned_trailer_id: string | null }>(
    `SELECT ${sameEntityLoadCompanyTrailerSql("$2::uuid", "$1::uuid")}::text AS company_trailer_id,
            ${loadNonOwnedTrailerSql("$2::uuid", "$1::uuid")}::text AS non_owned_trailer_id`,
    [input.operatingCompanyId, input.loadId]
  );
  const row = r.rows[0];
  if (row?.company_trailer_id) {
    await client.query(
      `UPDATE accounting.bills SET trailer_id = $3::uuid
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND trailer_id IS NULL AND non_owned_trailer_id IS NULL`,
      [input.billId, input.operatingCompanyId, row.company_trailer_id]
    );
    await client.query(
      `UPDATE accounting.bill_lines SET equipment_id = $4::uuid
        WHERE bill_id = $1::uuid AND operating_company_id = $2::uuid AND load_id = $3::uuid AND equipment_id IS NULL`,
      [input.billId, input.operatingCompanyId, input.loadId, row.company_trailer_id]
    );
    return "company";
  }
  if (row?.non_owned_trailer_id) {
    await client.query(
      `UPDATE accounting.bills SET non_owned_trailer_id = $3::uuid
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND trailer_id IS NULL AND non_owned_trailer_id IS NULL`,
      [input.billId, input.operatingCompanyId, row.non_owned_trailer_id]
    );
    return "non_owned";
  }
  return null;
}
