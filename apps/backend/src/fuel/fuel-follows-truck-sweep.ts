import { withLuciaBypass } from "../auth/db.js";
import { SYSTEM_ACTOR_USER_ID } from "../lib/system-actor.js";
import { evaluateFuelAssignment } from "./fuel-assignment-question.service.js";

/**
 * E9 (ENG-64) — the one fill engine runs on every fill that has not been through it.
 *
 * WHAT WAS WRONG (measured 11-03 on prod, USMCA): 598 of 856 live fuel rows had never been through the fill engine
 * (resolved_at NULL) — the engine (LEAD 443.214 resolveFillTruckAndLoad + 443.243 evaluateFuelAssignment) ran once, by hand,
 * on 10-22, and no writer (Settlement Creator Relay fill rows, statement import, card import, manual entry) ever called it.
 * Those rows kept whatever load their writer gave them; the engine's dry run put 5 of them on a different load and held 3.
 *
 * THE FIX: onFuelIngestComplete (the one "fuel rows arrived" hook — the daily card-import pass doubles as the sweep for every
 * other writer) runs this. Every live fill with resolved_at NULL and no owner ruling goes through evaluateFuelAssignment:
 * certain → applyFillTruckAndLoad (fuel rows + expense document + GL load dimension through the reclassify engine, audited,
 * amounts and accounts unchanged); not certain → an assignment question with the evidence (never a guess). Each fill runs in
 * its own transaction so one refusal (e.g. a closed period) never blocks the others; it is reported, not swallowed.
 * Owner rulings (truck_resolution 'owner_ruling: …') and loads a person confirmed (OWNER RULING 443.288, e.g. at settlement
 * close) are never touched.
 */
export type FuelFollowsTruckSweepSummary = {
  operating_company_id: string;
  evaluated: number;
  applied: Record<string, number>;
  questions: number;
  owner_ruled: number;
  load_confirmed: number;
  failed: number;
  failures: Array<{ fuel_id: string; error: string }>;
};

/**
 * Every live fill not yet through the engine, oldest first, read in keyset pages until exhausted (no cap — Codex batch74:
 * a LIMIT 2000 list whose first 2000 rows were person-confirmed and never stamped starved every fill after them).
 * Fills the engine never moves are excluded on the read side, exactly as the engine reads them (loadFillFacts):
 * a recorded owner ruling, or a person-confirmed load on the fill or a Relay sibling row (OWNER RULING 443.288).
 */
export async function listUnresolvedFills(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  companyId: string,
  pageSize = 500
): Promise<string[]> {
  const out: string[] = [];
  let after: { at: string; id: string } | null = null;
  for (;;) {
    const page: Array<{ id: string; at: string }> = (
      await client.query<{ id: string; at: string }>(
        `SELECT f.id::text, COALESCE(f.transaction_at, 'epoch'::timestamptz)::text AS at
           FROM fuel.fuel_transactions f
          WHERE f.operating_company_id = $1::uuid
            AND f.voided_at IS NULL AND f.archived_at IS NULL
            AND f.resolved_at IS NULL
            AND COALESCE(f.truck_resolution, '') NOT LIKE 'owner_ruling:%'
            AND NOT EXISTS (SELECT 1 FROM accounting.expenses e
                             WHERE e.operating_company_id = f.operating_company_id AND e.voided_at IS NULL
                               AND e.load_confirmation = 'confirmed'
                               AND (e.source_fuel_transaction_id = f.id
                                    OR (f.relay_fuel_transaction_id IS NOT NULL AND e.source_fuel_transaction_id IN (
                                          SELECT s.id FROM fuel.fuel_transactions s
                                           WHERE s.operating_company_id = f.operating_company_id
                                             AND s.relay_fuel_transaction_id = f.relay_fuel_transaction_id AND s.voided_at IS NULL))))
            AND ($3::timestamptz IS NULL OR (COALESCE(f.transaction_at, 'epoch'::timestamptz), f.id) > ($3::timestamptz, $4::uuid))
          ORDER BY COALESCE(f.transaction_at, 'epoch'::timestamptz), f.id
          LIMIT $2`,
        [companyId, pageSize, after?.at ?? null, after?.id ?? null]
      )
    ).rows;
    for (const r of page) out.push(r.id);
    if (page.length < pageSize) return out;
    const last = page[page.length - 1]!;
    after = { at: last.at, id: last.id };
  }
}

export async function runFuelFollowsTruckSweep(companyId: string, actorUserId: string = SYSTEM_ACTOR_USER_ID): Promise<FuelFollowsTruckSweepSummary> {
  const ids = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    return listUnresolvedFills(client as never, companyId);
  });
  const summary: FuelFollowsTruckSweepSummary = {
    operating_company_id: companyId, evaluated: 0, applied: {}, questions: 0, owner_ruled: 0, load_confirmed: 0, failed: 0, failures: [],
  };
  for (const fuelId of ids) {
    summary.evaluated += 1;
    try {
      const res = await withLuciaBypass(async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
        return evaluateFuelAssignment(client as never, { companyId, actorUserId, fuelId, applyIfCertain: true });
      });
      if ("error" in res && res.error) throw new Error(res.error);
      if ("owner_ruled" in res && res.owner_ruled) summary.owner_ruled += 1;
      else if ("load_confirmed" in res && res.load_confirmed) summary.load_confirmed += 1;
      else if (res.certain) {
        const k = res.outcome ?? "not_applied";
        summary.applied[k] = (summary.applied[k] ?? 0) + 1;
      } else summary.questions += 1;
    } catch (err) {
      summary.failed += 1;
      if (summary.failures.length < 50) summary.failures.push({ fuel_id: fuelId, error: String((err as Error)?.message ?? err).slice(0, 300) });
    }
  }
  return summary;
}
