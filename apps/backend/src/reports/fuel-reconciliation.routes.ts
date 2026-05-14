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

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fuelTxnSql(alias: string) {
  return `
    ${alias}.pending = false
    AND ${alias}.transaction_date BETWEEN $2::date AND $3::date
    AND (
      EXISTS (
        SELECT 1
        FROM unnest(${alias}.plaid_category) AS c(cat)
        WHERE lower(cat::text) LIKE '%fuel%'
      )
      OR lower(coalesce(${alias}.merchant_name, '')) ~ '(fuel|diesel|def|loves|pilot|flying\\s*j|ta\\s+travel)'
      OR lower(coalesce(${alias}.description, '')) ~ '(fuel|diesel|def)'
    )
  `;
}

export async function registerFuelReconciliationRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/fuel-reconciliation", async (req, reply) => {
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
      const btFuel = fuelTxnSql("bt");

      const cardTotals = await client.query(
        `
          SELECT COALESCE(SUM(ABS(bt.amount_cents)), 0)::text AS fuel_card_amount_cents
          FROM banking.bank_transactions bt
          WHERE bt.operating_company_id = $1
            AND ${btFuel}
        `,
        [operatingCompanyId, startDay, endDay]
      );

      const cardByUnit = await client.query<{ unit_id: string; unit_number: string; cents: string }>(
        `
          SELECT
            u.id::text AS unit_id,
            u.unit_number::text AS unit_number,
            COALESCE(SUM(ABS(bt.amount_cents)), 0)::text AS cents
          FROM banking.bank_transactions bt
          JOIN mdata.loads l ON l.id = bt.matched_load_id
          JOIN mdata.units u ON u.id = l.assigned_unit_id
          WHERE bt.operating_company_id = $1
            AND l.soft_deleted_at IS NULL
            AND l.assigned_unit_id IS NOT NULL
            AND ${btFuel}
            AND u.operating_company_id = $1
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
          WHERE wo.operating_company_id = $1
            AND wo.unit_id IS NOT NULL
            AND COALESCE(wo.updated_at, wo.opened_at)::date BETWEEN $2::date AND $3::date
            AND u.deactivated_at IS NULL
          GROUP BY u.id, u.unit_number
        `,
        [operatingCompanyId, startDay, endDay]
      );

      const unmatchedCards = await client.query(
        `
          SELECT
            bt.id::text AS transaction_id,
            bt.transaction_date::text AS transaction_date,
            ABS(bt.amount_cents)::text AS amount_cents,
            bt.merchant_name,
            bt.description
          FROM banking.bank_transactions bt
          WHERE bt.operating_company_id = $1
            AND ${btFuel}
            AND (
              bt.matched_load_id IS NULL
              OR NOT EXISTS (
                SELECT 1
                FROM mdata.loads l
                WHERE l.id = bt.matched_load_id
                  AND l.soft_deleted_at IS NULL
                  AND l.assigned_unit_id IS NOT NULL
              )
            )
          ORDER BY ABS(bt.amount_cents) DESC
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
          WHERE wo.operating_company_id = $1
            AND wo.unit_id IS NOT NULL
            AND wo.fuel_cost_cents > 0
            AND COALESCE(wo.updated_at, wo.opened_at)::date BETWEEN $2::date AND $3::date
            AND NOT EXISTS (
              SELECT 1
              FROM banking.bank_transactions bt2
              JOIN mdata.loads l ON l.id = bt2.matched_load_id
              WHERE bt2.operating_company_id = $1
                AND l.soft_deleted_at IS NULL
                AND l.assigned_unit_id = wo.unit_id
                AND ${fuelTxnSql("bt2")}
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

      const unitsWithCard = new Set(cardMap.keys());
      const unitsWithWo = new Set(woMap.keys());
      let matchedUnits = 0;
      for (const id of unitsWithCard) {
        if (unitsWithWo.has(id)) matchedUnits += 1;
      }
      const activeUnits = new Set<string>([...unitsWithCard, ...unitsWithWo]);
      const match_rate_pct = activeUnits.size === 0 ? 100 : Math.round((matchedUnits / activeUnits.size) * 1000) / 10;

      const unmatched_full_card_res = await client.query<{ c: string }>(
        `
          SELECT COUNT(*)::text AS c
          FROM banking.bank_transactions bt
          WHERE bt.operating_company_id = $1
            AND ${btFuel}
            AND (
              bt.matched_load_id IS NULL
              OR NOT EXISTS (
                SELECT 1
                FROM mdata.loads l
                WHERE l.id = bt.matched_load_id
                  AND l.soft_deleted_at IS NULL
                  AND l.assigned_unit_id IS NOT NULL
              )
            )
        `,
        [operatingCompanyId, startDay, endDay]
      );

      const unmatched_wo_full_res = await client.query<{ c: string }>(
        `
          SELECT COUNT(*)::text AS c
          FROM maintenance.work_orders wo
          WHERE wo.operating_company_id = $1
            AND wo.unit_id IS NOT NULL
            AND wo.fuel_cost_cents > 0
            AND COALESCE(wo.updated_at, wo.opened_at)::date BETWEEN $2::date AND $3::date
            AND NOT EXISTS (
              SELECT 1
              FROM banking.bank_transactions bt2
              JOIN mdata.loads l ON l.id = bt2.matched_load_id
              WHERE bt2.operating_company_id = $1
                AND l.soft_deleted_at IS NULL
                AND l.assigned_unit_id = wo.unit_id
                AND ${fuelTxnSql("bt2")}
            )
        `,
        [operatingCompanyId, startDay, endDay]
      );

      return {
        period: { start: startDay, end: endDay },
        totals: {
          fuel_card_amount_cents: cardTotalCents,
          wo_fuel_amount_cents: woFuelTotal,
          delta_cents: cardTotalCents - woFuelTotal,
          unmatched_card_count: num(unmatched_full_card_res.rows[0]?.c),
          unmatched_wo_count: num(unmatched_wo_full_res.rows[0]?.c),
          match_rate_pct,
        },
        by_truck: byTruck,
        unmatched_card_transactions: unmatchedCards.rows.map((row: Record<string, unknown>) => ({
          transaction_id: row.transaction_id,
          transaction_date: row.transaction_date,
          amount_cents: num(row.amount_cents),
          merchant_name: row.merchant_name,
          description: row.description,
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
