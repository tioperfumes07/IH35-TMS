/**
 * ROUND 306 (Lead NEXT 3) — the Fuel page's per-transaction read model. No new engine: it reads
 * what E-19/E-21/E-22 already decide, and writes nothing.
 *   card rows   (fuel.fuel_transactions) — is it a real purchase (fuel-purchase-eligibility.ts);
 *               if so, the fraud rules' classification computed ON READ (finding / suspicion /
 *               none), the rules that matched, the basis, and any date-only refusals. The fraud
 *               detector's own alert table is off by default, so the page never depends on it.
 *   relay fills — the E-22 two-signal GPS verdict (fuel-gps-verdict.service.ts) and why.
 */
import { fuelPurchaseIneligibleReason, type FuelPurchaseIneligibleReason } from "./fuel-purchase-eligibility.js";
import { evaluateTransactionRules } from "../integrations/fuel/fraud-detector/rules.service.js";
import { loadHighConfidenceDerivedTimes } from "./fuel-time-derivation.service.js";
import { classifyFraudMatches } from "../integrations/fuel/fraud-detector/signal-independence.js";
import { computeRelayFillGpsVerdicts, type RelayFillGpsVerdict } from "./fuel-gps-verdict.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type CardRowVerdict = {
  fuel_transaction_id: string;
  transaction_at: string;
  fuel_type: string | null;
  gallons: number | null;
  total_cost_cents: number | null;
  unit_number: string | null;
  is_purchase: boolean;
  not_purchase_reason: FuelPurchaseIneligibleReason | null;
  date_only: boolean;
  fraud_classification: "finding" | "suspicion" | "none" | "not_evaluated";
  suspicion_count: number;
  rules_matched: string[];
  rules_refused_date_only: string[];
  why: string;
};

export async function computeFuelIntegrityVerdicts(
  client: DbClient,
  operatingCompanyId: string,
  periodStart: string,
  periodEnd: string
): Promise<{ card_rows: CardRowVerdict[]; relay_fills: RelayFillGpsVerdict[]; summary: Record<string, number> }> {
  const rows = await client.query<Record<string, unknown>>(
    `SELECT ft.id::text AS id, ft.operating_company_id::text AS operating_company_id, ft.unit_id::text AS unit_id,
            ft.driver_id::text AS driver_id, ft.load_id::text AS load_id, ft.transaction_at::text AS transaction_at,
            ft.gallons::float8 AS gallons, ft.location_lat::float8 AS location_lat, ft.location_lng::float8 AS location_lng,
            ft.location_city, ft.location_state, ft.fuel_type, ft.total_cost::float8 AS total_cost, u.unit_number,
            (SELECT count(*) FROM fuel.fuel_transactions x
              WHERE x.operating_company_id = ft.operating_company_id AND x.transaction_at = ft.transaction_at
                AND x.voided_at IS NULL)::int AS same_stamp_count
       FROM fuel.fuel_transactions ft
       LEFT JOIN mdata.units u ON u.id = ft.unit_id
      WHERE ft.operating_company_id = $1::uuid AND ft.voided_at IS NULL
        AND ft.transaction_at >= $2::timestamptz AND ft.transaction_at < $3::timestamptz
      ORDER BY ft.transaction_at DESC`,
    [operatingCompanyId, periodStart, periodEnd]
  );

  const derivedTimes = await loadHighConfidenceDerivedTimes(client, operatingCompanyId);
  const card_rows: CardRowVerdict[] = [];
  for (const t of rows.rows) {
    const e = {
      fuel_type: (t.fuel_type as string | null) ?? null,
      gallons: (t.gallons as number | null) ?? null,
      transaction_at: String(t.transaction_at),
      voided_at: null,
      same_stamp_count: Number(t.same_stamp_count ?? 1),
    };
    const base = {
      fuel_transaction_id: String(t.id),
      transaction_at: String(t.transaction_at),
      fuel_type: e.fuel_type,
      gallons: e.gallons,
      total_cost_cents: t.total_cost == null ? null : Math.round(Number(t.total_cost) * 100),
      unit_number: (t.unit_number as string | null) ?? null,
    };
    const reason = fuelPurchaseIneligibleReason(e, { requirePumpTime: false });
    if (reason) {
      card_rows.push({
        ...base,
        is_purchase: false,
        not_purchase_reason: reason,
        date_only: false,
        fraud_classification: "not_evaluated",
        suspicion_count: 0,
        rules_matched: [],
        rules_refused_date_only: [],
        why: `not a fuel purchase (${reason}) — a charge, so no fuel or fraud rule applies`,
      });
      continue;
    }
    // A date-only row with a high-confidence derived pump time (one fill, one fuel stop) is
    // evaluated at that time instead of being refused; transaction_at itself is never changed.
    const derived = derivedTimes.get(String(t.id));
    const dateOnly = !derived && fuelPurchaseIneligibleReason(e, { requirePumpTime: true }) === "date_only_precision";
    const v = classifyFraudMatches(await evaluateTransactionRules(client, derived ? { ...t, transaction_at: derived } : t), { dateOnly });
    card_rows.push({
      ...base,
      is_purchase: true,
      not_purchase_reason: null,
      date_only: dateOnly,
      fraud_classification: v.classification,
      suspicion_count: v.classification === "suspicion" ? v.matches.length : 0,
      rules_matched: v.matches.map((m) => m.rule_id),
      rules_refused_date_only: v.skipped_rules,
      why: v.basis + (derived ? ` (pump time derived from the truck's fuel stop: ${derived})` : dateOnly ? " (date-only source: pump-time rules not asked)" : ""),
    });
  }

  const relay_fills = await computeRelayFillGpsVerdicts(client, operatingCompanyId, periodStart, periodEnd);
  const summary: Record<string, number> = {};
  const bump = (k: string) => (summary[k] = (summary[k] ?? 0) + 1);
  for (const r of card_rows) bump(r.is_purchase ? `card_${r.fraud_classification}` : `card_not_purchase_${r.not_purchase_reason}`);
  for (const f of relay_fills) bump(`relay_${f.verdict}`);
  return { card_rows, relay_fills, summary };
}
