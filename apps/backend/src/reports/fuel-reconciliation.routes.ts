import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import { z } from "zod";
import { createTtlCache } from "../lib/ttl-cache.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";

const periodQuerySchema = companyQuerySchema.extend({
  period_start: z.string().date(),
  period_end: z.string().date(),
});

const legacyMonthSchema = companyQuerySchema.extend({
  period: z.string().regex(/^\d{4}-\d{2}$/),
});

const cache = createTtlCache<unknown>();

export function isFuelDeltaSuspicious(cardCents: number, woCents: number, threshold = 0.1): boolean {
  const denom = Math.max(cardCents, woCents, 1);
  return Math.abs(cardCents - woCents) / denom > threshold;
}

/**
 * FUEL-RECON-MATCH-RATE-VS-ROW-MISMATCH: the aggregate "match rate" must use the SAME real-dollar
 * definition of "matched" as each row's own `matched_pct` (card_amount_cents > 0 AND
 * wo_amount_cents > 0) — never a looser one (e.g. "this unit appears in both source queries", which
 * can be true even when one side's dollar amount is 0, because the WO-side query has no
 * fuel_cost_cents > 0 filter). A looser aggregate definition can show a nonzero match rate while
 * every visible row honestly reports 0% matched, which is a self-contradicting report.
 */
export function computeFuelMatchRatePct(
  byTruck: Array<{ card_amount_cents: number; wo_amount_cents: number }>
): number {
  const matchedUnits = byTruck.filter((t) => t.card_amount_cents > 0 && t.wo_amount_cents > 0).length;
  const activeUnitCount = byTruck.filter((t) => t.card_amount_cents > 0 || t.wo_amount_cents > 0).length;
  return activeUnitCount === 0 ? 100 : Math.round((matchedUnits / activeUnitCount) * 1000) / 10;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * RPT-S04 — Fuel Reconciliation card side reads canonical fuel.fuel_transactions
 * (NOT banking.bank_transactions + merchant heuristics). total_cost is dollars → cents.
 * Unit attribution prefers ft.unit_id, else load.assigned_unit_id.
 */
export async function registerFuelReconciliationRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/fuel-reconciliation", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;

    const raw = req.query ?? {};
    const parsedPeriod = periodQuerySchema.safeParse(raw);
    const parsedLegacy = legacyMonthSchema.safeParse(raw);

    let operatingCompanyId: string;
    let startDay: string;
    let endDay: string;

    if (parsedPeriod.success) {
      operatingCompanyId = parsedPeriod.data.operating_company_id;
      startDay = parsedPeriod.data.period_start;
      endDay = parsedPeriod.data.period_end;
    } else if (parsedLegacy.success) {
      operatingCompanyId = parsedLegacy.data.operating_company_id;
      const month = `${parsedLegacy.data.period}-01`;
      const start = new Date(`${month}T00:00:00.000Z`);
      const end = new Date(start);
      end.setUTCMonth(end.getUTCMonth() + 1);
      end.setUTCDate(end.getUTCDate() - 1);
      startDay = start.toISOString().slice(0, 10);
      endDay = end.toISOString().slice(0, 10);
    } else {
      return validationError(reply, new z.ZodError([...parsedPeriod.error.issues, ...parsedLegacy.error.issues]));
    }

    if (startDay > endDay) {
      return reply.code(400).send({ error: "validation_error", details: { period: ["period_start must be on or before period_end"] } });
    }

    const cacheKey = `${operatingCompanyId}:${startDay}:${endDay}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;

    const payload = await withCompanyScope(user.uuid, operatingCompanyId, async (client: PoolClient) => {
      const cardTotals = await client.query(
        `
          SELECT COALESCE(SUM(ROUND(ft.total_cost::numeric * 100)), 0)::text AS fuel_card_amount_cents
          FROM fuel.fuel_transactions ft
          WHERE ft.operating_company_id = $1::uuid
            AND ft.archived_at IS NULL
            AND ft.transaction_at::date BETWEEN $2::date AND $3::date
        `,
        [operatingCompanyId, startDay, endDay]
      );

      const cardByUnit = await client.query<{ unit_id: string; unit_number: string; cents: string }>(
        `
          SELECT
            u.id::text AS unit_id,
            u.unit_number::text AS unit_number,
            COALESCE(SUM(ROUND(ft.total_cost::numeric * 100)), 0)::text AS cents
          FROM fuel.fuel_transactions ft
          LEFT JOIN mdata.loads l
            ON l.id = ft.load_id
           AND l.operating_company_id = ft.operating_company_id
           AND l.soft_deleted_at IS NULL
          JOIN mdata.units u
            ON u.id = COALESCE(ft.unit_id, l.assigned_unit_id)
           AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = ft.operating_company_id
          WHERE ft.operating_company_id = $1::uuid
            AND ft.archived_at IS NULL
            AND ft.transaction_at::date BETWEEN $2::date AND $3::date
            AND COALESCE(ft.unit_id, l.assigned_unit_id) IS NOT NULL
            AND u.deactivated_at IS NULL
          GROUP BY u.id, u.unit_number
        `,
        [operatingCompanyId, startDay, endDay]
      );

      const woByUnit = await client.query<{ unit_id: string; unit_number: string; cents: string }>(
        `
          SELECT
            u.id::text AS unit_id,
            u.unit_number::text AS unit_number,
            COALESCE(SUM(wo.fuel_cost_cents), 0)::text AS cents
          FROM maintenance.work_orders wo
          JOIN mdata.units u ON u.id = wo.unit_id
                            AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = wo.operating_company_id
          WHERE wo.operating_company_id = $1::uuid
            AND wo.unit_id IS NOT NULL
            AND COALESCE(wo.updated_at, wo.opened_at)::date BETWEEN $2::date AND $3::date
            AND u.deactivated_at IS NULL
          GROUP BY u.id, u.unit_number
        `,
        [operatingCompanyId, startDay, endDay]
      );

      // GPS match table FKs banking.bank_transactions — not fuel.fuel_transactions.
      // Do not fake a join; gps_match_confidence stays null on the canonical fuel path.
      const unmatchedCards = await client.query(
        `
          SELECT
            ft.id::text AS transaction_id,
            ft.transaction_at::date::text AS transaction_date,
            ROUND(ft.total_cost::numeric * 100)::text AS amount_cents,
            NULLIF(
              trim(
                CONCAT_WS(
                  ' · ',
                  NULLIF(trim(CONCAT_WS(', ', ft.location_city, ft.location_state)), ''),
                  NULLIF(ft.source, '')
                )
              ),
              ''
            ) AS merchant_name,
            COALESCE(ft.notes, ft.transaction_reference) AS description,
            NULL::text AS gps_match_confidence
          FROM fuel.fuel_transactions ft
          LEFT JOIN mdata.loads l
            ON l.id = ft.load_id
           AND l.operating_company_id = ft.operating_company_id
           AND l.soft_deleted_at IS NULL
          WHERE ft.operating_company_id = $1::uuid
            AND ft.archived_at IS NULL
            AND ft.transaction_at::date BETWEEN $2::date AND $3::date
            AND COALESCE(ft.unit_id, l.assigned_unit_id) IS NULL
          ORDER BY ROUND(ft.total_cost::numeric * 100) DESC
          LIMIT 20
        `,
        [operatingCompanyId, startDay, endDay]
      );

      const unmatchedWo = await client.query(
        `
          SELECT
            wo.id::text AS work_order_id,
            COALESCE(wo.updated_at, wo.opened_at)::text AS work_order_at,
            wo.fuel_cost_cents::text AS fuel_cost_cents,
            u.unit_number::text AS unit_number
          FROM maintenance.work_orders wo
          JOIN mdata.units u ON u.id = wo.unit_id
                            AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = wo.operating_company_id
          WHERE wo.operating_company_id = $1::uuid
            AND wo.unit_id IS NOT NULL
            AND wo.fuel_cost_cents > 0
            AND COALESCE(wo.updated_at, wo.opened_at)::date BETWEEN $2::date AND $3::date
            AND NOT EXISTS (
              SELECT 1
              FROM fuel.fuel_transactions ft2
              LEFT JOIN mdata.loads l
                ON l.id = ft2.load_id
               AND l.operating_company_id = ft2.operating_company_id
               AND l.soft_deleted_at IS NULL
              WHERE ft2.operating_company_id = $1::uuid
                AND ft2.archived_at IS NULL
                AND ft2.transaction_at::date BETWEEN $2::date AND $3::date
                AND COALESCE(ft2.unit_id, l.assigned_unit_id) = wo.unit_id
            )
          ORDER BY wo.fuel_cost_cents DESC
          LIMIT 20
        `,
        [operatingCompanyId, startDay, endDay]
      );

      const cardTotalCents = num(cardTotals.rows[0]?.fuel_card_amount_cents);

      const woMap = new Map<string, { unit_number: string; cents: number }>();
      for (const row of woByUnit.rows) {
        woMap.set(row.unit_id, { unit_number: row.unit_number, cents: num(row.cents) });
      }
      const cardMap = new Map<string, { unit_number: string; cents: number }>();
      for (const row of cardByUnit.rows) {
        cardMap.set(row.unit_id, { unit_number: row.unit_number, cents: num(row.cents) });
      }

      const unitIds = new Set<string>([...woMap.keys(), ...cardMap.keys()]);
      let woFuelTotal = 0;
      for (const v of woMap.values()) woFuelTotal += v.cents;

      const byTruck = Array.from(unitIds).map((unitId) => {
        const card = cardMap.get(unitId)?.cents ?? 0;
        const wo = woMap.get(unitId)?.cents ?? 0;
        const unit_number = cardMap.get(unitId)?.unit_number ?? woMap.get(unitId)?.unit_number ?? "";
        const delta = card - wo;
        const matchedPct =
          card > 0 && wo > 0 ? Math.round((Math.min(card, wo) / Math.max(card, wo)) * 1000) / 10 : 0;
        const suspicious = isFuelDeltaSuspicious(card, wo);
        const flags: Array<"over_reported" | "under_reported" | "unmatched"> = [];
        if (card > 0 && wo === 0) flags.push("unmatched");
        if (card === 0 && wo > 0) flags.push("unmatched");
        if (card > 0 && wo > 0 && delta > 0) flags.push("under_reported");
        if (card > 0 && wo > 0 && delta < 0) flags.push("over_reported");

        return {
          unit_id: unitId,
          unit_number,
          card_amount_cents: card,
          wo_amount_cents: wo,
          delta_cents: delta,
          matched_pct: matchedPct,
          suspicious,
          flags,
        };
      });

      byTruck.sort((a, b) => Math.abs(b.delta_cents) - Math.abs(a.delta_cents));

      const match_rate_pct = computeFuelMatchRatePct(byTruck);

      const unmatched_full_card_res = await client.query<{ c: string }>(
        `
          SELECT COUNT(*)::text AS c
          FROM fuel.fuel_transactions ft
          LEFT JOIN mdata.loads l
            ON l.id = ft.load_id
           AND l.operating_company_id = ft.operating_company_id
           AND l.soft_deleted_at IS NULL
          WHERE ft.operating_company_id = $1::uuid
            AND ft.archived_at IS NULL
            AND ft.transaction_at::date BETWEEN $2::date AND $3::date
            AND COALESCE(ft.unit_id, l.assigned_unit_id) IS NULL
        `,
        [operatingCompanyId, startDay, endDay]
      );

      const unmatched_wo_full_res = await client.query<{ c: string }>(
        `
          SELECT COUNT(*)::text AS c
          FROM maintenance.work_orders wo
          WHERE wo.operating_company_id = $1::uuid
            AND wo.unit_id IS NOT NULL
            AND wo.fuel_cost_cents > 0
            AND COALESCE(wo.updated_at, wo.opened_at)::date BETWEEN $2::date AND $3::date
            AND NOT EXISTS (
              SELECT 1
              FROM fuel.fuel_transactions ft2
              LEFT JOIN mdata.loads l
                ON l.id = ft2.load_id
               AND l.operating_company_id = ft2.operating_company_id
               AND l.soft_deleted_at IS NULL
              WHERE ft2.operating_company_id = $1::uuid
                AND ft2.archived_at IS NULL
                AND ft2.transaction_at::date BETWEEN $2::date AND $3::date
                AND COALESCE(ft2.unit_id, l.assigned_unit_id) = wo.unit_id
            )
        `,
        [operatingCompanyId, startDay, endDay]
      );

      return {
        period: { start: startDay, end: endDay },
        // RPT-F02 — totals use the same money field names as by_truck rows.
        totals: {
          card_amount_cents: cardTotalCents,
          wo_amount_cents: woFuelTotal,
          delta_cents: cardTotalCents - woFuelTotal,
          unmatched_count:
            num(unmatched_full_card_res.rows[0]?.c) + num(unmatched_wo_full_res.rows[0]?.c),
          unmatched_card_count: num(unmatched_full_card_res.rows[0]?.c),
          unmatched_wo_count: num(unmatched_wo_full_res.rows[0]?.c),
          match_rate_pct,
          // Retained aliases (additive-only, §7): older/unknown clients keep reading these.
          fuel_card_amount_cents: cardTotalCents,
          wo_fuel_amount_cents: woFuelTotal,
        },
        by_truck: byTruck,
        unmatched_card_transactions: unmatchedCards.rows.map((row: Record<string, unknown>) => ({
          transaction_id: row.transaction_id,
          transaction_date: row.transaction_date,
          amount_cents: num(row.amount_cents),
          merchant_name: row.merchant_name,
          description: row.description,
          gps_match_confidence:
            row.gps_match_confidence === "high" || row.gps_match_confidence === "medium" || row.gps_match_confidence === "no_match"
              ? row.gps_match_confidence
              : null,
        })),
        unmatched_wo_entries: unmatchedWo.rows.map((row: Record<string, unknown>) => ({
          work_order_id: row.work_order_id,
          work_order_at: row.work_order_at,
          fuel_cost_cents: num(row.fuel_cost_cents),
          unit_number: row.unit_number,
        })),
      };
    });

    cache.set(cacheKey, payload, 60_000);
    return payload;
  });
}
