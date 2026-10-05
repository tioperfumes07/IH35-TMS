/**
 * ROUND 312 B-3 — Batch Settlements grid (§23).
 * Per row: driver + period → SET-01 linked loads auto-pulled; optional deductions/advances;
 * Save all → postSettlementCreatorInClientTx only (never payroll or retired settlement schemas).
 */
import { FeedGateError } from "./feed-gate/feed-gate.service.js";
import { withCurrentUser } from "../auth/db.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import {
  previewSettlementCreator,
  postSettlementCreatorInClientTx,
  SettlementCreatorError,
} from "./settlement-creator.service.js";
import type {
  SettlementCreatorDraft,
  SettlementCreatorLoadBlock,
  SettlementCreatorMoneyLine,
  SettlementCreatorAdvanceLine,
  SettlementCreatorPostResult,
} from "./settlement-creator.types.js";

export const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const AUDIT_TAG = "BATCH-SETTLEMENTS-B3";

export class BatchSettlementError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "BatchSettlementError";
  }
}

export type Set01EligibleLoad = {
  load_id: string;
  load_number: string;
  customer_id: string | null;
  customer_name: string | null;
  unit_id: string | null;
  unit_number: string | null;
  trailer_id: string | null;
  trip_type: string | null;
  status: string;
  pickup_date: string | null;
  delivery_date: string | null;
  pickup_city: string | null;
  delivery_city: string | null;
  miles_practical: number | null;
  loaded_miles: number | null;
  empty_miles: number | null;
  rate_total_cents: number | null;
  driver_pay_rate_per_mile: number | null;
  /** ROUND 288.3 item 2: the load's live driver bill — the ONE pay computation (loaded + deadhead) the settlement uses. */
  bill_loaded_pay_cents: number | null;
  bill_rate_per_mile_cents: number | null;
  bill_miles_basis: number | null;
  bill_miles_deadhead: number | null;
  bill_rate_empty_per_mile_cents: number | null;
  presettlement_link_id: string | null;
  already_on_closed_settlement: boolean;
};

export type BatchSettlementRowInput = {
  driver_id: string;
  period_start: string;
  period_end: string;
  settlement_no?: string | null;
  unit_id?: string | null;
  load_ids?: string[] | null;
  deductions?: SettlementCreatorMoneyLine[];
  advances?: SettlementCreatorAdvanceLine[];
  admin_fee_cents?: number | null;
  confirmed_zero_fuel_purchases?: boolean;
};

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

async function listSet01LoadsInTx(
  client: DbClient,
  operatingCompanyId: string,
  driverId: string,
  periodStart: string,
  periodEnd: string,
): Promise<Set01EligibleLoad[]> {
  const res = await client.query<{
    load_id: string;
    load_number: string;
    customer_id: string | null;
    customer_name: string | null;
    unit_id: string | null;
    unit_number: string | null;
    trailer_id: string | null;
    trip_type: string | null;
    status: string;
    pickup_date: string | null;
    delivery_date: string | null;
    pickup_city: string | null;
    delivery_city: string | null;
    miles_practical: string | null;
    loaded_miles: string | null;
    empty_miles: string | null;
    rate_total_cents: string | null;
    driver_pay_rate_per_mile: string | null;
    bill_loaded_pay_cents: string | null;
    bill_rate_per_mile_cents: string | null;
    bill_miles_basis: string | null;
    bill_miles_deadhead: string | null;
    bill_rate_empty_per_mile_cents: string | null;
    presettlement_link_id: string | null;
    already_on_closed_settlement: boolean;
  }>(
    `
      SELECT
        l.id::text AS load_id,
        l.load_number::text AS load_number,
        l.customer_id::text AS customer_id,
        c.customer_name AS customer_name,
        l.assigned_unit_id::text AS unit_id,
        u.unit_number,
        l.load_trailer_equipment_id::text AS trailer_id,
        l.trip_type::text AS trip_type,
        l.status::text AS status,
        (
          SELECT (s.scheduled_arrival_at AT TIME ZONE 'America/Chicago')::date::text
          FROM mdata.load_stops s
          WHERE s.load_id = l.id AND s.stop_type = 'pickup'
          ORDER BY s.sequence_number NULLS LAST, s.created_at
          LIMIT 1
        ) AS pickup_date,
        (
          SELECT (s.scheduled_arrival_at AT TIME ZONE 'America/Chicago')::date::text
          FROM mdata.load_stops s
          WHERE s.load_id = l.id AND s.stop_type = 'delivery'
          ORDER BY s.sequence_number DESC NULLS LAST, s.created_at DESC
          LIMIT 1
        ) AS delivery_date,
        (
          SELECT s.city FROM mdata.load_stops s
          WHERE s.load_id = l.id AND s.stop_type = 'pickup'
          ORDER BY s.sequence_number NULLS LAST, s.created_at LIMIT 1
        ) AS pickup_city,
        (
          SELECT s.city FROM mdata.load_stops s
          WHERE s.load_id = l.id AND s.stop_type = 'delivery'
          ORDER BY s.sequence_number DESC NULLS LAST, s.created_at DESC LIMIT 1
        ) AS delivery_city,
        l.miles_practical::text AS miles_practical,
        l.loaded_miles::text AS loaded_miles,
        l.empty_miles::text AS empty_miles,
        l.rate_total_cents::text AS rate_total_cents,
        l.driver_pay_rate_per_mile::text AS driver_pay_rate_per_mile,
        db.loaded_pay_cents::text AS bill_loaded_pay_cents,
        db.rate_per_mile_cents::text AS bill_rate_per_mile_cents,
        db.miles_basis::text AS bill_miles_basis,
        db.miles_deadhead::text AS bill_miles_deadhead,
        db.rate_empty_per_mile_cents::text AS bill_rate_empty_per_mile_cents,
        l.presettlement_link_id::text AS presettlement_link_id,
        EXISTS (
          SELECT 1
          FROM driver_finance.settlement_lines sl
          JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
          WHERE sl.load_id = l.id
            AND sl.operating_company_id = l.operating_company_id
            AND sl.is_active IS DISTINCT FROM false
            AND sl.voided_at IS NULL
            AND ds.status IN ('closed', 'paid', 'approved', 'locked')
            AND ds.voided_at IS NULL
        ) AS already_on_closed_settlement
      FROM mdata.loads l
      LEFT JOIN mdata.customers c ON c.id = l.customer_id
      LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
      LEFT JOIN LATERAL (
        SELECT b.loaded_pay_cents, b.rate_per_mile_cents, b.miles_basis, b.miles_deadhead, b.rate_empty_per_mile_cents
          FROM driver_finance.driver_bills b
         WHERE b.load_id = l.id AND b.operating_company_id = l.operating_company_id
           AND b.driver_id = $2::uuid AND b.voided_at IS NULL
         ORDER BY b.created_at
         LIMIT 1
      ) db ON true
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND COALESCE(l.is_sample_data, false) IS NOT TRUE
        AND l.assigned_primary_driver_id = $2::uuid
        AND l.presettlement_link_id IS NOT NULL
        AND (
          EXISTS (
            SELECT 1 FROM mdata.load_stops s
            WHERE s.load_id = l.id
              AND s.stop_type = 'pickup'
              AND (s.scheduled_arrival_at AT TIME ZONE 'America/Chicago')::date
                  BETWEEN $3::date AND $4::date
          )
          OR EXISTS (
            SELECT 1 FROM mdata.load_stops s
            WHERE s.load_id = l.id
              AND s.stop_type = 'delivery'
              AND (s.scheduled_arrival_at AT TIME ZONE 'America/Chicago')::date
                  BETWEEN $3::date AND $4::date
          )
          OR (
            l.predicted_delivery_date IS NOT NULL
            AND l.predicted_delivery_date BETWEEN $3::date AND $4::date
          )
        )
      ORDER BY l.load_number
    `,
    [operatingCompanyId, driverId, periodStart, periodEnd],
  );

  return res.rows.map((r) => ({
    load_id: r.load_id,
    load_number: r.load_number,
    customer_id: r.customer_id,
    customer_name: r.customer_name,
    unit_id: r.unit_id,
    unit_number: r.unit_number,
    trailer_id: r.trailer_id,
    trip_type: r.trip_type,
    status: r.status,
    pickup_date: r.pickup_date,
    delivery_date: r.delivery_date,
    pickup_city: r.pickup_city,
    delivery_city: r.delivery_city,
    miles_practical: r.miles_practical != null ? Number(r.miles_practical) : null,
    loaded_miles: r.loaded_miles != null ? Number(r.loaded_miles) : null,
    empty_miles: r.empty_miles != null ? Number(r.empty_miles) : null,
    rate_total_cents: r.rate_total_cents != null ? Number(r.rate_total_cents) : null,
    driver_pay_rate_per_mile: r.driver_pay_rate_per_mile != null ? Number(r.driver_pay_rate_per_mile) : null,
    bill_loaded_pay_cents: r.bill_loaded_pay_cents != null ? Number(r.bill_loaded_pay_cents) : null,
    bill_rate_per_mile_cents: r.bill_rate_per_mile_cents != null ? Number(r.bill_rate_per_mile_cents) : null,
    bill_miles_basis: r.bill_miles_basis != null ? Number(r.bill_miles_basis) : null,
    bill_miles_deadhead: r.bill_miles_deadhead != null ? Number(r.bill_miles_deadhead) : null,
    bill_rate_empty_per_mile_cents: r.bill_rate_empty_per_mile_cents != null ? Number(r.bill_rate_empty_per_mile_cents) : null,
    presettlement_link_id: r.presettlement_link_id,
    already_on_closed_settlement: Boolean(r.already_on_closed_settlement),
  }));
}

export function toLoadBlock(load: Set01EligibleLoad): SettlementCreatorLoadBlock {
  const delivered = Boolean(load.delivery_date) && !["dispatched", "booked", "planned", "assigned", "in_transit", "at_pickup"].includes(load.status);
  const trip =
    load.trip_type === "NB" || load.trip_type === "TR" || load.trip_type === "SB" || load.trip_type === "LOCAL"
      ? load.trip_type
      : "NB";
  // ROUND 288.3 item 2: the settlement pays what the load's driver bill computed — loaded pay, loaded rate and miles,
  // deadhead miles and rate (book-load + the one deadhead rule). Batch pay used to send the load's CUSTOMER total as
  // the line-haul amount and never paid deadhead (empty rate null). No bill -> the load's own miles / rate, and the
  // creator applies the same deadhead rule.
  const hasBill = load.bill_loaded_pay_cents != null;
  const miles = hasBill && load.bill_miles_basis != null ? load.bill_miles_basis : load.loaded_miles ?? load.miles_practical;
  const ratePerMileCents = hasBill && load.bill_rate_per_mile_cents != null
    ? load.bill_rate_per_mile_cents
    : load.driver_pay_rate_per_mile != null ? Math.round(Number(load.driver_pay_rate_per_mile) * 100) : null;
  return {
    load_number: load.load_number,
    customer_name: load.customer_name,
    customer_id: load.customer_id,
    pickup_date: load.pickup_date,
    pickup_city: load.pickup_city,
    delivery_date: load.delivery_date,
    delivery_city: load.delivery_city,
    line_haul_miles: miles,
    line_haul_rate_cents: ratePerMileCents,
    line_haul_amount_cents: hasBill ? load.bill_loaded_pay_cents : null,
    factoring: "faro_usmca",
    loaded_miles: miles,
    empty_miles: hasBill ? load.bill_miles_deadhead ?? 0 : load.empty_miles ?? 0,
    empty_rate_cents: hasBill ? load.bill_rate_empty_per_mile_cents : null,
    trip_type: trip,
    not_yet_delivered: !delivered,
  };
}

async function buildDraftForRow(
  client: DbClient,
  operatingCompanyId: string,
  row: BatchSettlementRowInput,
): Promise<{ draft: SettlementCreatorDraft; loads: Set01EligibleLoad[] }> {
  const all = await listSet01LoadsInTx(
    client,
    operatingCompanyId,
    row.driver_id,
    row.period_start,
    row.period_end,
  );
  const eligible = all.filter((l) => !l.already_on_closed_settlement);
  const selected =
    row.load_ids && row.load_ids.length > 0
      ? eligible.filter((l) => row.load_ids!.includes(l.load_id))
      : eligible;
  if (selected.length === 0) {
    throw new BatchSettlementError(
      "NO_SET01_LOADS",
      "No SET-01 linked loads in this period (or all already on a closed settlement).",
    );
  }
  const unitId = row.unit_id ?? selected.find((l) => l.unit_id)?.unit_id ?? null;
  const draft: SettlementCreatorDraft = {
    operating_company_id: operatingCompanyId,
    settlement_no: (row.settlement_no ?? "").trim(),
    driver_id: row.driver_id,
    unit_id: unitId,
    period_start: row.period_start,
    period_end: row.period_end,
    loads: selected.map(toLoadBlock),
    fuel_purchases: [],
    confirmed_zero_fuel_purchases: row.confirmed_zero_fuel_purchases !== false,
    expenses: [],
    deductions: row.deductions ?? [],
    reimbursements: [],
    advances: row.advances ?? [],
    escrow: [],
    admin_fee_cents: row.admin_fee_cents ?? null,
    pdf_driver_net_cents: 0,
    pdf_company_expenses_cents: 0,
    seed_dispatched_loads: false,
  };

  // Match PDF gates to the live preview so Save posts through the same Creator engine.
  const preview = await previewSettlementCreator(client, draft);
  draft.pdf_driver_net_cents = preview.driver_net_cents;
  draft.pdf_company_expenses_cents = preview.company_expenses_cents;
  if (!preview.can_post && preview.blockers.length) {
    // Re-preview after aligning control totals — blockers that remain are real.
    const aligned = await previewSettlementCreator(client, draft);
    if (!aligned.can_post) {
      throw new BatchSettlementError("PREVIEW_BLOCKED", aligned.blockers.join(" · ") || "Preview blocked");
    }
  }
  return { draft, loads: selected };
}

export async function listSet01EligibleLoads(opts: {
  operatingCompanyId: string;
  userId: string;
  driverId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<Set01EligibleLoad[]> {
  if (opts.operatingCompanyId !== USMCA) {
    throw new BatchSettlementError("USMCA_ONLY", "Batch Settlements is USMCA-only.");
  }
  return withCurrentUser(opts.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opts.operatingCompanyId]);
    return listSet01LoadsInTx(client, opts.operatingCompanyId, opts.driverId, opts.periodStart, opts.periodEnd);
  });
}

export type BatchSettlementRowResult =
  | {
      ok: true;
      index: number;
      settlement: SettlementCreatorPostResult;
      load_numbers: string[];
    }
  | {
      ok: false;
      index: number;
      error: string;
      message: string;
      /** FEED GATE red rows when error = feed_gate_blocked (intake id + every red check with its fix link). */
      feed_gate?: { intake_id?: string; reds?: unknown[] } | null;
    };

/**
 * Save all — each row posts through postSettlementCreatorInClientTx (canonical).
 * Per-row errors keep other rows saved (§23). One JE per successful settlement (Creator path).
 */
export async function postBatchSettlements(opts: {
  operatingCompanyId: string;
  userId: string;
  rows: BatchSettlementRowInput[];
}): Promise<{ results: BatchSettlementRowResult[]; saved: number; failed: number }> {
  if (opts.operatingCompanyId !== USMCA) {
    throw new BatchSettlementError("USMCA_ONLY", "Batch Settlements is USMCA-only.");
  }
  if (!opts.rows.length) {
    throw new BatchSettlementError("EMPTY_BATCH", "At least one settlement row is required.");
  }
  if (opts.rows.length > 50) {
    throw new BatchSettlementError("BATCH_TOO_LARGE", "Max 50 settlements per Save.");
  }

  const results: BatchSettlementRowResult[] = [];
  for (let i = 0; i < opts.rows.length; i++) {
    const row = opts.rows[i]!;
    try {
      const settlement = await withCurrentUser(opts.userId, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
          opts.operatingCompanyId,
        ]);
        const { draft, loads } = await buildDraftForRow(client, opts.operatingCompanyId, row);
        const posted = await postSettlementCreatorInClientTx(client, opts.userId, draft);
        await appendCrudAudit(
          client as never,
          opts.userId,
          "driver_finance.batch_settlement.posted",
          {
            settlement_id: posted.settlement_id,
            source_document_ref: posted.source_document_ref,
            driver_id: row.driver_id,
            period_start: row.period_start,
            period_end: row.period_end,
            load_numbers: loads.map((l) => l.load_number),
            batch_index: i,
          },
          "info",
          AUDIT_TAG,
        );
        return { posted, load_numbers: loads.map((l) => l.load_number) };
      });
      results.push({
        ok: true,
        index: i,
        settlement: settlement.posted,
        load_numbers: settlement.load_numbers,
      });
    } catch (err) {
      if (err instanceof FeedGateError) {
        results.push({ ok: false, index: i, error: err.code, message: err.message, feed_gate: (err.details as { intake_id?: string; reds?: unknown[] } | undefined) ?? null } as BatchSettlementRowResult);
      } else if (err instanceof BatchSettlementError || err instanceof SettlementCreatorError) {
        results.push({
          ok: false,
          index: i,
          error: err.code,
          message: err.message,
        });
      } else {
        results.push({
          ok: false,
          index: i,
          error: "UNEXPECTED",
          message: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }
  }
  const saved = results.filter((r) => r.ok).length;
  return { results, saved, failed: results.length - saved };
}
