/**
 * LEAD 443.102 ruling 1 (P38 Wave-A, project law "every record links to its unit hub") — stamp the unit on POSTED
 * driver bills from their loads.
 *
 * WHY: until #26572 the per-load driver-bill writers never passed the load's unit, so every driver-pay bill floated off
 * its unit (prod 2026-10-12: 146 of 146 live USMCA driver bills, 392 lines, every load with a same-entity assigned unit,
 * 0 mixed). The forward writers are fixed; this is the Owner engine path for the bills already posted.
 *
 * METADATA ONLY: it writes accounting.bills.unit_id and accounting.bill_lines.unit_id where they are NULL — never an
 * amount, account, item, status, journal entry or posting. The unit comes from sameEntityLoadUnitSql (the SAME rule the
 * forward writers use): the load's assigned unit, only when the load's company owns or currently leases it. A bill's
 * header takes the unit only when every live load line resolves to one and the same unit; a bill whose lines name
 * different units keeps a NULL header (reported) while each line takes its own load's unit.
 *
 * Owner only (refusal audited). dryRun returns the whole plan and writes nothing. Each bill is stamped inside its own
 * SAVEPOINT: a bill the database refuses is rolled back alone and reported, never half-stamped. One audit row per
 * stamped bill (before / after). Idempotent: a second run plans 0 changes.
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { sameEntityLoadUnitSql } from "./load-unit.sql.js";

type Queryable = { query: <R = any>(sql: string, params?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }> };

export class BillUnitStampError extends Error {
  constructor(public readonly code: "owner_only", message: string, public readonly statusCode: number) {
    super(message);
    this.name = "BillUnitStampError";
  }
}

export type BillUnitStampLine = { line_id: string; load_id: string; load_number: string | null; unit_id: string | null; unit_number: string | null; action: "stamp" | "skip"; reason?: string };
export type BillUnitStampBill = {
  bill_id: string;
  bill_number: string | null;
  display_id: string | null;
  header: { action: "stamp" | "keep_null" | "already_set"; unit_id: string | null; unit_number: string | null; reason?: string };
  lines: BillUnitStampLine[];
  outcome: "planned" | "stamped" | "refused";
  error?: string;
};
export type BillUnitStampResult = {
  dry_run: boolean;
  operating_company_id: string;
  bills_considered: number;
  bills_changed: number;
  header_stamps: number;
  line_stamps: number;
  mixed_unit_bills: number;
  refused_bills: number;
  bills: BillUnitStampBill[];
};

const AUDIT_EVENT = "bill.unit_stamped_from_load";

/** Owner gate: anyone else is refused with 403 and the refusal is audited. */
export async function refuseNonOwnerBillUnitStamp(client: Queryable, actor: { userId: string; role?: string | null }, opco: string): Promise<void> {
  if (actor.role === "Owner") return;
  await appendCrudAudit(
    client as never,
    actor.userId,
    "bill.unit_stamp_refused_non_owner",
    { resource_type: "accounting.bills", operating_company_id: opco, role: actor.role ?? null },
    "warning",
    "LEAD-443.102-OWNER-ONLY"
  );
  throw new BillUnitStampError("owner_only", "Only the Owner can stamp units on posted bills.", 403);
}

type CandidateRow = {
  bill_id: string;
  bill_number: string | null;
  display_id: string | null;
  header_unit_id: string | null;
  line_id: string;
  load_id: string;
  load_number: string | null;
  line_unit_id: string | null;
  derived_unit_id: string | null;
  derived_unit_number: string | null;
};

/**
 * Live driver bills of the company that still miss a unit on the header or on a load line. Driver bills only
 * (driver_id set) — the ruling's scope; a vendor bill's unit is the operator's choice, never derived.
 */
async function loadCandidates(client: Queryable, opco: string): Promise<CandidateRow[]> {
  const r = await client.query<CandidateRow>(
    `SELECT b.id::text AS bill_id, b.bill_number, b.display_id, b.unit_id::text AS header_unit_id,
            bl.id::text AS line_id, bl.load_id::text AS load_id, l.load_number,
            bl.unit_id::text AS line_unit_id,
            d.unit_id::text AS derived_unit_id, u.unit_number AS derived_unit_number
       FROM accounting.bills b
       JOIN accounting.bill_lines bl ON bl.bill_id = b.id AND bl.operating_company_id = b.operating_company_id
                                    AND bl.voided_at IS NULL AND bl.load_id IS NOT NULL
       LEFT JOIN mdata.loads l ON l.id = bl.load_id AND l.operating_company_id = b.operating_company_id
       LEFT JOIN LATERAL (SELECT ${sameEntityLoadUnitSql("bl.load_id", "b.operating_company_id")} AS unit_id) d ON true
       LEFT JOIN mdata.units u ON u.id = d.unit_id
      WHERE b.operating_company_id = $1::uuid
        AND b.driver_id IS NOT NULL
        AND b.voided_at IS NULL AND b.revoked_at IS NULL AND COALESCE(b.status, '') <> 'void'
        AND (b.unit_id IS NULL OR bl.unit_id IS NULL)
      ORDER BY b.bill_date NULLS LAST, b.bill_number NULLS LAST, b.id, bl.line_sequence NULLS LAST, bl.id`,
    [opco]
  );
  return r.rows;
}

/** Pure planner: groups candidate lines per bill and decides header + line stamps. Exported for the unit tests. */
export function planBillUnitStamps(rows: CandidateRow[]): BillUnitStampBill[] {
  const byBill = new Map<string, CandidateRow[]>();
  for (const r of rows) {
    const list = byBill.get(r.bill_id) ?? [];
    list.push(r);
    byBill.set(r.bill_id, list);
  }
  const out: BillUnitStampBill[] = [];
  for (const [billId, list] of byBill) {
    const first = list[0]!;
    const lines: BillUnitStampLine[] = list.map((r) => {
      if (r.line_unit_id) return { line_id: r.line_id, load_id: r.load_id, load_number: r.load_number, unit_id: r.line_unit_id, unit_number: null, action: "skip", reason: "line_already_has_unit" };
      if (!r.derived_unit_id) return { line_id: r.line_id, load_id: r.load_id, load_number: r.load_number, unit_id: null, unit_number: null, action: "skip", reason: "load_has_no_same_entity_unit" };
      return { line_id: r.line_id, load_id: r.load_id, load_number: r.load_number, unit_id: r.derived_unit_id, unit_number: r.derived_unit_number, action: "stamp" };
    });
    let header: BillUnitStampBill["header"];
    if (first.header_unit_id) {
      header = { action: "already_set", unit_id: first.header_unit_id, unit_number: null };
    } else {
      const derived = new Set(list.map((r) => r.derived_unit_id));
      const only = derived.size === 1 ? [...derived][0] : null;
      if (only) {
        header = { action: "stamp", unit_id: only, unit_number: first.derived_unit_number };
      } else {
        header = {
          action: "keep_null",
          unit_id: null,
          unit_number: null,
          reason: derived.has(null) ? "a_load_line_has_no_same_entity_unit" : "lines_name_different_units",
        };
      }
    }
    const changes = (header.action === "stamp" ? 1 : 0) + lines.filter((x) => x.action === "stamp").length;
    if (changes === 0 && header.action !== "keep_null") continue;
    out.push({ bill_id: billId, bill_number: first.bill_number, display_id: first.display_id, header, lines, outcome: "planned" });
  }
  return out;
}

export async function stampDriverBillUnitsFromLoads(
  client: Queryable,
  input: { operatingCompanyId: string; actorUserId: string; actorRole?: string | null; dryRun: boolean }
): Promise<BillUnitStampResult> {
  const opco = input.operatingCompanyId;
  await refuseNonOwnerBillUnitStamp(client, { userId: input.actorUserId, role: input.actorRole }, opco);

  const plan = planBillUnitStamps(await loadCandidates(client, opco));
  const result: BillUnitStampResult = {
    dry_run: input.dryRun,
    operating_company_id: opco,
    bills_considered: plan.length,
    bills_changed: 0,
    header_stamps: 0,
    line_stamps: 0,
    mixed_unit_bills: plan.filter((b) => b.header.action === "keep_null" && b.header.reason === "lines_name_different_units").length,
    refused_bills: 0,
    bills: plan,
  };
  if (input.dryRun) {
    result.header_stamps = plan.filter((b) => b.header.action === "stamp").length;
    result.line_stamps = plan.reduce((n, b) => n + b.lines.filter((l) => l.action === "stamp").length, 0);
    result.bills_changed = plan.filter((b) => b.header.action === "stamp" || b.lines.some((l) => l.action === "stamp")).length;
    return result;
  }

  for (const bill of plan) {
    const stampLines = bill.lines.filter((l) => l.action === "stamp");
    if (bill.header.action !== "stamp" && stampLines.length === 0) continue;
    await client.query("SAVEPOINT bill_unit_stamp");
    try {
      let headerDone = 0;
      if (bill.header.action === "stamp") {
        const h = await client.query(
          `UPDATE accounting.bills SET unit_id = $3::uuid, updated_at = now()
            WHERE id = $1::uuid AND operating_company_id = $2::uuid AND unit_id IS NULL`,
          [bill.bill_id, opco, bill.header.unit_id]
        );
        headerDone = h.rowCount ?? 0;
      }
      let linesDone = 0;
      for (const line of stampLines) {
        const u = await client.query(
          `UPDATE accounting.bill_lines SET unit_id = $3::uuid
            WHERE id = $1::uuid AND operating_company_id = $2::uuid AND unit_id IS NULL`,
          [line.line_id, opco, line.unit_id]
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
          operating_company_id: opco,
          bill_number: bill.bill_number,
          display_id: bill.display_id,
          ruling: "LEAD 443.102 ruling 1 — metadata only (no amount / account / JE change)",
          before: { unit_id: null, lines: stampLines.map((l) => ({ line_id: l.line_id, load_id: l.load_id, unit_id: null })) },
          after: {
            unit_id: bill.header.action === "stamp" ? bill.header.unit_id : null,
            header_reason: bill.header.reason ?? null,
            lines: stampLines.map((l) => ({ line_id: l.line_id, load_id: l.load_id, unit_id: l.unit_id, unit_number: l.unit_number })),
          },
        },
        "info",
        "LEAD-443.102-UNIT-STAMP"
      );
      await client.query("RELEASE SAVEPOINT bill_unit_stamp");
      bill.outcome = "stamped";
      result.bills_changed += headerDone + linesDone > 0 ? 1 : 0;
      result.header_stamps += headerDone;
      result.line_stamps += linesDone;
    } catch (err) {
      await client.query("ROLLBACK TO SAVEPOINT bill_unit_stamp");
      bill.outcome = "refused";
      bill.error = String((err as Error)?.message ?? err).slice(0, 300);
      result.refused_bills += 1;
    }
  }
  return result;
}
