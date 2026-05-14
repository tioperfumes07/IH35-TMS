import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { createTtlCache } from "../lib/ttl-cache.js";

const querySchema = companyQuerySchema.extend({
  period_start: z.string().date(),
  period_end: z.string().date(),
  driver_id: z.string().uuid().optional(),
});

type DeductionBreakdown = {
  fuel_advance: number;
  tire_damage: number;
  escrow_contribution: number;
  abandonment_chargeback: number;
  other: number;
};

type ByDriverRow = {
  driver_id: string;
  driver_name: string;
  gross_pay_cents: number;
  deduction_cents: number;
  chargeback_cents: number;
  net_pay_cents: number;
  load_count: number;
  settlement_count: number;
  avg_per_load_cents: number;
  deductions_breakdown: DeductionBreakdown;
};

type SettlementSummaryPayload = {
  period: { start: string; end: string };
  totals: {
    gross_pay_cents: number;
    deduction_total_cents: number;
    chargeback_total_cents: number;
    net_pay_cents: number;
    settlement_count: number;
    driver_count: number;
  };
  by_driver: ByDriverRow[];
  by_deduction_type: Record<string, number>;
};

const cache = createTtlCache<SettlementSummaryPayload>();

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function categorizeDeduction(deductionType: string, reason: string): keyof DeductionBreakdown {
  const t = `${deductionType} ${reason}`.toLowerCase();
  if (t.includes("fuel") || t.includes("advance")) return "fuel_advance";
  if (t.includes("tire") || t.includes("damage")) return "tire_damage";
  if (t.includes("escrow")) return "escrow_contribution";
  if (t.includes("abandon") || t.includes("chargeback")) return "abandonment_chargeback";
  return "other";
}

export async function registerSettlementSummaryRoutes(app: FastifyInstance) {
  app.get("/api/v1/reports/settlement-summary", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id: companyId, period_start: pStart, period_end: pEnd, driver_id: driverFilter } =
      parsed.data;
    const cacheKey = `${companyId}:${pStart}:${pEnd}:${driverFilter ?? "all"}`;
    const hit = cache.get(cacheKey);
    if (hit) return hit;

    const payload = await withCompanyScope(user.uuid, companyId, async (client) => {
      const settlementsRes = await client.query(
        `
          SELECT
            s.id,
            s.driver_id,
            COALESCE(NULLIF(trim(CONCAT_WS(' ', d.first_name, d.last_name)), ''), d.id::text) AS driver_name,
            COALESCE(ROUND(s.gross_pay::numeric * 100), 0)::bigint AS gross_cents,
            COALESCE(ROUND(s.deductions_total::numeric * 100), 0)::bigint AS deduction_cents,
            COALESCE(ROUND(s.net_pay::numeric * 100), 0)::bigint AS net_cents
          FROM driver_finance.driver_settlements s
          JOIN mdata.drivers d ON d.id = s.driver_id
          WHERE s.operating_company_id = $1
            AND s.period_start <= $3::date
            AND s.period_end >= $2::date
            AND ($4::uuid IS NULL OR s.driver_id = $4::uuid)
        `,
        [companyId, pStart, pEnd, driverFilter ?? null]
      );

      const settlementIds = settlementsRes.rows.map((r: { id: string }) => r.id);
      const deductionsRes =
        settlementIds.length === 0
          ? { rows: [] as Record<string, unknown>[] }
          : await client.query(
              `
                SELECT deduction_type, reason, amount_cents::text AS amount_cents, applied_to_settlement_id
                FROM driver_finance.driver_settlement_deductions
                WHERE operating_company_id = $1
                  AND (
                    applied_to_settlement_id = ANY($2::uuid[])
                    OR (
                      applied_to_settlement_id IS NULL
                      AND created_at::date BETWEEN $3::date AND $4::date
                    )
                  )
              `,
              [companyId, settlementIds, pStart, pEnd]
            );

      const chargebackRows = deductionsRes.rows.filter((row: Record<string, unknown>) => {
        const dt = String(row.deduction_type ?? "").toLowerCase();
        const rs = String(row.reason ?? "").toLowerCase();
        return dt.includes("chargeback") || dt.includes("abandon") || rs.includes("chargeback") || rs.includes("abandon");
      });

      const chargebackBySettlement = new Map<string, number>();
      for (const row of chargebackRows) {
        const sid = row.applied_to_settlement_id ? String(row.applied_to_settlement_id) : "";
        if (!sid) continue;
        chargebackBySettlement.set(sid, (chargebackBySettlement.get(sid) ?? 0) + num(row.amount_cents));
      }

      const totalsChargebacks = chargebackRows.reduce((acc: number, row: Record<string, unknown>) => acc + num(row.amount_cents), 0);

      const deductionAggByDriver = new Map<
        string,
        { breakdown: DeductionBreakdown; typed: Map<string, number> }
      >();

      function ensureDriver(driverId: string) {
        let row = deductionAggByDriver.get(driverId);
        if (!row) {
          row = {
            breakdown: {
              fuel_advance: 0,
              tire_damage: 0,
              escrow_contribution: 0,
              abandonment_chargeback: 0,
              other: 0,
            },
            typed: new Map(),
          };
          deductionAggByDriver.set(driverId, row);
        }
        return row;
      }

      const settlementDriverById = new Map<string, string>(
        settlementsRes.rows.map((r: { id: string; driver_id: string }) => [r.id, r.driver_id])
      );

      for (const row of deductionsRes.rows) {
        const amount = num(row.amount_cents);
        const sid = row.applied_to_settlement_id ? String(row.applied_to_settlement_id) : "";
        const driverId = sid ? settlementDriverById.get(sid) : null;
        if (!driverId) continue;
        const bucket = categorizeDeduction(String(row.deduction_type ?? ""), String(row.reason ?? ""));
        const agg = ensureDriver(driverId);
        agg.breakdown[bucket] += amount;
        const key = String(row.deduction_type ?? "unknown").trim() || "unknown";
        agg.typed.set(key, (agg.typed.get(key) ?? 0) + amount);
      }

      const globalDeductionTypes = new Map<string, number>();
      for (const [, agg] of deductionAggByDriver) {
        for (const [k, v] of agg.typed) globalDeductionTypes.set(k, (globalDeductionTypes.get(k) ?? 0) + v);
      }

      const loadsRes = await client.query(
        `
          SELECT assigned_primary_driver_id::text AS driver_id, COUNT(*)::text AS load_count
          FROM mdata.loads l
          WHERE l.operating_company_id = $1
            AND l.soft_deleted_at IS NULL
            AND l.assigned_primary_driver_id IS NOT NULL
            AND l.created_at::date BETWEEN $2::date AND $3::date
            AND ($4::uuid IS NULL OR l.assigned_primary_driver_id = $4::uuid)
          GROUP BY l.assigned_primary_driver_id
        `,
        [companyId, pStart, pEnd, driverFilter ?? null]
      );
      const loadsRows = loadsRes.rows as Array<{ driver_id: string; load_count: string }>;
      const loadCountByDriver = new Map<string, number>(loadsRows.map((r) => [String(r.driver_id), num(r.load_count)]));

      const byDriverMap = new Map<string, ByDriverRow>();

      for (const row of settlementsRes.rows as Array<{
        id: string;
        driver_id: string;
        driver_name: string;
        gross_cents: bigint;
        deduction_cents: bigint;
        net_cents: bigint;
      }>) {
        const driverId = row.driver_id;
        const gross = num(row.gross_cents);
        const deductions = num(row.deduction_cents);
        const net = num(row.net_cents);
        const cb = chargebackBySettlement.get(row.id) ?? 0;

        const existing = byDriverMap.get(driverId);
        const breakdown =
          deductionAggByDriver.get(driverId)?.breakdown ?? {
            fuel_advance: 0,
            tire_damage: 0,
            escrow_contribution: 0,
            abandonment_chargeback: 0,
            other: 0,
          };

        if (!existing) {
          byDriverMap.set(driverId, {
            driver_id: driverId,
            driver_name: String(row.driver_name),
            gross_pay_cents: gross,
            deduction_cents: deductions,
            chargeback_cents: cb,
            net_pay_cents: net,
            load_count: loadCountByDriver.get(driverId) ?? 0,
            settlement_count: 1,
            avg_per_load_cents: 0,
            deductions_breakdown: { ...breakdown },
          });
        } else {
          existing.gross_pay_cents += gross;
          existing.deduction_cents += deductions;
          existing.chargeback_cents += cb;
          existing.net_pay_cents += net;
          existing.settlement_count += 1;
          existing.driver_name = String(row.driver_name);
          existing.deductions_breakdown = {
            fuel_advance: existing.deductions_breakdown.fuel_advance + breakdown.fuel_advance,
            tire_damage: existing.deductions_breakdown.tire_damage + breakdown.tire_damage,
            escrow_contribution: existing.deductions_breakdown.escrow_contribution + breakdown.escrow_contribution,
            abandonment_chargeback:
              existing.deductions_breakdown.abandonment_chargeback + breakdown.abandonment_chargeback,
            other: existing.deductions_breakdown.other + breakdown.other,
          };
        }
      }

      const by_driver = [...byDriverMap.values()].map((d) => ({
        ...d,
        load_count: loadCountByDriver.get(d.driver_id) ?? d.load_count,
        avg_per_load_cents: Math.round(d.gross_pay_cents / Math.max(d.load_count || d.settlement_count, 1)),
      }));

      by_driver.sort((a, b) => b.gross_pay_cents - a.gross_pay_cents);

      const grossTotal = by_driver.reduce((a, r) => a + r.gross_pay_cents, 0);
      const deductionTotal = by_driver.reduce((a, r) => a + r.deduction_cents, 0);
      const netTotal = by_driver.reduce((a, r) => a + r.net_pay_cents, 0);

      const body: SettlementSummaryPayload = {
        period: { start: pStart, end: pEnd },
        totals: {
          gross_pay_cents: grossTotal,
          deduction_total_cents: deductionTotal,
          chargeback_total_cents: totalsChargebacks,
          net_pay_cents: netTotal,
          settlement_count: settlementsRes.rows.length,
          driver_count: by_driver.length,
        },
        by_driver,
        by_deduction_type: Object.fromEntries(globalDeductionTypes.entries()),
      };

      return body;
    });

    cache.set(cacheKey, payload, 30_000);
    return payload;
  });
}
