// 443.60 #2 — a load that carries miles but no mileage_source (booked before every writer named its source) gets the source
// the one rule gives (mileageSourceFor: typed miles = "Operator entered"). Only mileage_source is written; no miles value,
// no pay, no settlement changes. Audited per load.
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { mileageSourceFor } from "../book-load.service.js";

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export async function recordMissingMileageSource(
  client: Queryable,
  args: { operatingCompanyId: string; actorUserId: string; loadIds?: string[] }
): Promise<Array<{ load_id: string; load_number: string; source: string }>> {
  const rows = (
    await client.query<{ id: string; load_number: string; mp: string | null; ms: string | null; md: string | null }>(
      `SELECT id::text, load_number::text, miles_practical::text mp, miles_shortest::text ms, miles_deadhead::text md
         FROM mdata.loads
        WHERE operating_company_id = $1::uuid AND soft_deleted_at IS NULL AND mileage_source IS NULL
          AND (miles_practical IS NOT NULL OR miles_shortest IS NOT NULL OR miles_deadhead IS NOT NULL)
          AND ($2::uuid[] IS NULL OR id = ANY($2::uuid[]))
        ORDER BY load_number`,
      [args.operatingCompanyId, args.loadIds ?? null]
    )
  ).rows;
  const out: Array<{ load_id: string; load_number: string; source: string }> = [];
  for (const r of rows) {
    const source = mileageSourceFor(null, r.mp, r.ms, r.md);
    if (!source) continue;
    await client.query(
      `UPDATE mdata.loads SET mileage_source = $3, updated_at = now(), updated_by_user_id = $4::uuid
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND mileage_source IS NULL`,
      [r.id, args.operatingCompanyId, source, args.actorUserId]
    );
    await appendCrudAudit(client as never, args.actorUserId, "dispatch.load.mileage_source_recorded", {
      resource_type: "mdata.loads",
      resource_id: r.id,
      load_id: r.id,
      load_number: r.load_number,
      mileage_source: source,
      reason: "miles carried no source (booked before the writer named it)",
    });
    out.push({ load_id: r.id, load_number: r.load_number, source });
  }
  return out;
}
