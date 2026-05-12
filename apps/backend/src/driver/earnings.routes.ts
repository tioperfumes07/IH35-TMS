import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireDriverSession } from "./auth.js";
import path from "node:path";
import { readFile } from "node:fs/promises";

type SettlementStatus = "draft" | "presettle" | "acked" | "locked" | "paid" | "held" | "cancelled";
type EarningsLoad = {
  id: string;
  load_display_id: string;
  miles: number;
  gross_cents: number;
  status: SettlementStatus;
};
type CycleEarnings = {
  cycle_id: string;
  period_start: string;
  period_end: string;
  preferred_language: "en" | "es";
  loads_completed: number;
  miles_driven: number;
  gross_cents: number;
  advances_cents: number;
  deductions_cents: number;
  escrow_cents: number;
  net_preview_cents: number;
  final_settlement_cents: number | null;
  settlement_terms: Record<string, { primary: string; secondary: string }>;
  loads: EarningsLoad[];
};

type SettlementTerms = Record<string, { en: string; es: string }>;
let cachedTerms: SettlementTerms | null = null;

async function loadSettlementTerms() {
  if (cachedTerms) return cachedTerms;
  const termsPath = path.resolve(process.cwd(), "apps/backend/src/i18n/legal_terms.json");
  const source = await readFile(termsPath, "utf8");
  const parsed = JSON.parse(source) as { settlement?: SettlementTerms };
  cachedTerms = parsed.settlement ?? {};
  return cachedTerms;
}

function toPrimarySecondary(
  terms: SettlementTerms,
  preferredLanguage: "en" | "es"
): Record<string, { primary: string; secondary: string }> {
  const out: Record<string, { primary: string; secondary: string }> = {};
  for (const [key, pair] of Object.entries(terms)) {
    out[key] =
      preferredLanguage === "es"
        ? { primary: pair.es, secondary: pair.en }
        : { primary: pair.en, secondary: pair.es };
  }
  return out;
}

const cyclesQuerySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(12).default(4),
});

function startOfWeekSunday(date: Date): Date {
  const copy = new Date(date);
  const diff = copy.getDate() - copy.getDay();
  copy.setDate(diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfWeekSaturday(start: Date): Date {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function settlementFromLoadStatus(status: string): SettlementStatus {
  if (status === "paid" || status === "closed") return "paid";
  if (status === "invoiced") return "locked";
  if (status === "delivered_pending_docs" || status === "delivered") return "acked";
  return "presettle";
}

function dollarsToCents(value: unknown): number {
  return Math.round(Number(value ?? 0) * 100);
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function buildCycle(
  client: { query: <R>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  driverId: string,
  preferredLanguage: "en" | "es",
  terms: SettlementTerms,
  start: Date,
  end: Date
): Promise<CycleEarnings> {
  const settlementRows = await client.query<{
    id: string;
    period_start: string;
    period_end: string;
    gross_pay: number | string | null;
    deductions_total: number | string | null;
    net_pay: number | string | null;
    status: string;
  }>(
    `
      SELECT id, period_start, period_end, gross_pay, deductions_total, net_pay, status::text
      FROM views.driver_settlement_with_debt
      WHERE driver_id = $1
        AND period_start <= $3::date
        AND period_end >= $2::date
      ORDER BY period_end DESC
    `,
    [driverId, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)]
  );

  const loadsRows = await client.query<{
    id: string;
    load_number: string | null;
    status: string;
    rate_total_cents: number | string | null;
  }>(
    `
      SELECT id, load_number, status::text, rate_total_cents
      FROM mdata.loads
      WHERE (assigned_primary_driver_id = $1 OR assigned_secondary_driver_id = $1)
        AND created_at >= $2::timestamptz
        AND created_at <= $3::timestamptz
        AND soft_deleted_at IS NULL
      ORDER BY created_at DESC
    `,
    [driverId, start.toISOString(), end.toISOString()]
  );

  const loads: EarningsLoad[] = loadsRows.rows.map((row) => ({
    id: row.id,
    load_display_id: row.load_number ?? row.id,
    miles: 0,
    gross_cents: Number(row.rate_total_cents ?? 0),
    status: settlementFromLoadStatus(row.status),
  }));

  const grossCents = settlementRows.rows.reduce((sum, row) => sum + dollarsToCents(row.gross_pay), 0);
  const deductionsCents = settlementRows.rows.reduce((sum, row) => sum + dollarsToCents(row.deductions_total), 0);
  const netPreviewCents = settlementRows.rows.reduce((sum, row) => sum + dollarsToCents(row.net_pay), 0);
  const latestSettlement = settlementRows.rows[0] ?? null;

  return {
    cycle_id: `cycle-${start.toISOString().slice(0, 10)}`,
    period_start: start.toISOString(),
    period_end: end.toISOString(),
    preferred_language: preferredLanguage,
    loads_completed: loads.length,
    miles_driven: 0,
    gross_cents: grossCents,
    advances_cents: 0,
    deductions_cents: deductionsCents,
    escrow_cents: 0,
    net_preview_cents: netPreviewCents,
    final_settlement_cents: latestSettlement?.status === "paid" ? netPreviewCents : null,
    settlement_terms: toPrimarySecondary(terms, preferredLanguage),
    loads,
  };
}

export async function registerDriverEarningsRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver/earnings/cycle", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    if (!driver || !req.user) return reply.code(403).send({ error: "forbidden" });

    const now = new Date();
    const start = startOfWeekSunday(now);
    const end = endOfWeekSaturday(start);
    const terms = await loadSettlementTerms();

    const cycle = await withCurrentUser(req.user.uuid, async (client) =>
      buildCycle(client, driver.id, driver.preferred_language, terms, start, end)
    );
    return cycle;
  });

  app.get("/api/v1/driver/earnings/cycles", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const query = cyclesQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const driver = req.driver;
    if (!driver || !req.user) return reply.code(403).send({ error: "forbidden" });

    const terms = await loadSettlementTerms();
    const cycles = await withCurrentUser(req.user.uuid, async (client) => {
      const out: CycleEarnings[] = [];
      const now = new Date();
      const currentStart = startOfWeekSunday(now);
      for (let idx = 0; idx < query.data.weeks; idx += 1) {
        const start = new Date(currentStart);
        start.setDate(start.getDate() - idx * 7);
        const end = endOfWeekSaturday(start);
        out.push(await buildCycle(client, driver.id, driver.preferred_language, terms, start, end));
      }
      return out;
    });
    return cycles;
  });
}
