/**
 * ACCT-F11108 — book an AlwaysTrack LOAD HISTORY export through the SAME engine the Settlement Creator uses for loads that
 * already ran: bookLoadOnClient(source historical_backfill) -> stampStopsFromTracking -> deliverLoadThroughDispatch (the one
 * dispatch transition, which mints the driver bill, latches revenue and raises the invoice). No raw INSERT, no new GL math.
 *
 * DELTA ONLY: a load number already in the company (live or voided — never re-booked under the same number) is skipped and
 * reported with its own rate. Each load is its own transaction, booked in pickup order, so a delivered load frees its truck
 * before the next load on that truck is booked and one refused row never strands the rest.
 *
 * Nothing is guessed. A customer, driver, truck or trailer the export names but the company does not have is a refusal
 * naming it — never a default, never a created record.
 */
import { randomUUID } from "node:crypto";
import { bookLoadOnClient, type BookLoadInput } from "./book-load.service.js";
import { withCompanyScope } from "../accounting/db-scope.js";
import { findCreatorCustomer } from "../driver-finance/settlement-creator-seed-loads.js";
import { creatorLoadTrailerEquipmentId, printedTrailerChoice } from "../driver-finance/creator-trailer-choice.js";
import { deliverLoadThroughDispatch, localDayStartIso, stampStopsFromTracking } from "../driver-finance/settlement-creator-deliver.js";
import {
  type AlwaysTrackLoadHistoryRow,
  dispositionFor,
  driverKey,
  isLocalMove,
  parseAlwaysTrackLoadHistory,
  payMiles,
  practicalMiles,
  stopCountry,
} from "./alwaystrack-load-history-import.js";

type Q = { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number | null }> };

export const LOAD_HISTORY_QUAL_OVERRIDE_REASON = "entered from the AlwaysTrack LOAD HISTORY export (load already ran)";

export type LoadHistoryRowOutcome =
  | "booked_delivered"
  | "booked_dispatched"
  | "would_book_delivered"
  | "would_book_dispatched"
  | "skipped_existing"
  | "not_booked_status"
  | "refused";

export type LoadHistoryRowResult = {
  load_number: string;
  outcome: LoadHistoryRowOutcome;
  at_status: string;
  charges_cents: number;
  existing_rate_cents?: number | null;
  load_id?: string | null;
  customer_id?: string | null;
  driver_id?: string | null;
  unit_id?: string | null;
  refusal?: { code: string; message: string };
};

export type LoadHistoryImportResult = {
  commit: boolean;
  title: string | null;
  range_label: string | null;
  invoiced_by: string | null;
  row_count: number;
  totals: { charges_cents: number | null };
  booked: { count: number; charges_cents: number };
  skipped_existing: { count: number; charges_cents: number };
  refused: { count: number; charges_cents: number };
  not_booked_status: { count: number; charges_cents: number };
  rows: LoadHistoryRowResult[];
};

class RowRefusal extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function resolveDriver(client: Q, opco: string, name: string): Promise<string> {
  const key = driverKey(name);
  const r = await client.query<{ id: string; k: string; inactive: boolean }>(
    `SELECT id::text,
            lower(regexp_replace(coalesce(first_name, '') || coalesce(last_name, ''), '[^A-Za-z]', '', 'g')) AS k,
            (deactivated_at IS NOT NULL OR status::text = 'Inactive') AS inactive
       FROM mdata.drivers
      WHERE operating_company_id = $1::uuid AND COALESCE(is_sample_data, false) IS NOT TRUE`,
    [opco],
  );
  const live = r.rows.filter((d) => !d.inactive);
  let hits = live.filter((d) => d.k === key);
  // The export can print a second surname the driver profile does not carry ("HUGO GAYTAN SARABIA" / "Hugo Gaytan"):
  // the profile's whole name must be the export's leading name, at least 8 letters, and exactly one active driver.
  if (!hits.length) hits = live.filter((d) => d.k.length >= 8 && key.startsWith(d.k));
  if (hits.length === 1) return hits[0]!.id;
  if (!hits.length) throw new RowRefusal("driver_unmatched", `Driver "${name}" is not an active driver of this company.`);
  throw new RowRefusal("driver_ambiguous", `Driver "${name}" matches ${hits.length} active drivers — merge or deactivate the duplicates first.`);
}

async function resolveUnit(client: Q, opco: string, truck: string): Promise<string> {
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.units
      WHERE upper(trim(unit_number)) = upper(trim($2))
        AND COALESCE(currently_leased_to_company_id, owner_company_id) = $1::uuid
        AND deactivated_at IS NULL
      LIMIT 2`,
    [opco, truck],
  );
  if (r.rows.length === 1) return r.rows[0]!.id;
  if (!r.rows.length) throw new RowRefusal("unit_unmatched", `Truck "${truck}" is not an active unit of this company.`);
  throw new RowRefusal("unit_ambiguous", `Truck "${truck}" matches ${r.rows.length} units.`);
}

async function activeCardRateCents(client: Q, opco: string, driverId: string): Promise<number | null> {
  const r = await client.query<{ basis_type: string; c: number | null }>(
    `SELECT basis_type, rate_per_mile_cents::float8 AS c FROM driver_finance.driver_pay_rates
      WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid AND is_active AND effective_to IS NULL
      ORDER BY effective_from DESC LIMIT 1`,
    [opco, driverId],
  );
  const row = r.rows[0];
  return row && row.basis_type === "per_mile_pay" && row.c != null ? Number(row.c) : null;
}

/**
 * The GO-21 B5 reason-carrying override bookLoad already honors (the rate card is never edited): when AlwaysTrack paid a
 * per-mile rate the card would not, or paid nothing on a completed load, the load is booked at what was paid.
 */
export function loadHistoryPayOverride(
  row: Pick<AlwaysTrackLoadHistoryRow, "load_number" | "driver_pay" | "driver_rpm">,
  disposition: "deliver" | "dispatch",
  cardCents: number | null,
): { driver_pay_rate_per_mile: number; driver_pay_rate_override_reason: string } | null {
  const pay = Number(row.driver_pay ?? 0);
  const rpm = Number(row.driver_rpm ?? 0);
  if (pay > 0 && rpm > 0) {
    const rpmCents = Math.round(rpm * 100);
    if (cardCents === rpmCents) return null;
    return {
      driver_pay_rate_per_mile: rpmCents / 100,
      driver_pay_rate_override_reason: `AlwaysTrack load history load ${row.load_number}: driver paid $${(rpmCents / 100).toFixed(2)}/mi`,
    };
  }
  if (disposition === "deliver" && pay === 0) {
    return {
      driver_pay_rate_per_mile: 0,
      driver_pay_rate_override_reason: `AlwaysTrack load history load ${row.load_number}: Driver Pay $0.00 on this completed load`,
    };
  }
  return null;
}

function rowNote(row: AlwaysTrackLoadHistoryRow): string {
  return (
    `AlwaysTrack LOAD HISTORY import (ACCT-F11108). AT status ${row.at_status}; Settl.# ${row.settlement_no ?? "none"}; ` +
    `Picks/Drops ${row.picks_drops ?? "?"} (the export prints origin and destination only); AT St.Mi ${row.st_miles ?? "-"} ` +
    `L.Mi ${row.l_miles ?? "-"} E.Mi ${row.e_miles ?? "-"}; Driver Pay ${row.driver_pay ?? "-"} @ ${row.driver_rpm ?? "-"}/mi; ` +
    `Charges ${(row.charges_cents / 100).toFixed(2)} QP ${(row.qp_cents / 100).toFixed(2)} Total ${(row.total_cents / 100).toFixed(2)}.`
  );
}

async function processRow(
  client: Q,
  ctx: { actor: { uuid: string; role: string }; opco: string; companyCode: string; commit: boolean; tours: Map<string, string> },
  row: AlwaysTrackLoadHistoryRow,
): Promise<{ result: LoadHistoryRowResult; afterCommit: () => void }> {
  const base: LoadHistoryRowResult = { load_number: row.load_number, outcome: "refused", at_status: row.at_status, charges_cents: row.charges_cents };
  const existing = await client.query<{ id: string; rate_total_cents: string | null }>(
    `SELECT id::text, rate_total_cents::text FROM mdata.loads
      WHERE operating_company_id = $1::uuid AND load_number = $2 AND soft_deleted_at IS NULL
      ORDER BY created_at LIMIT 1`,
    [ctx.opco, row.load_number],
  );
  if (existing.rows[0]) {
    return {
      result: { ...base, outcome: "skipped_existing", load_id: existing.rows[0].id, existing_rate_cents: existing.rows[0].rate_total_cents == null ? null : Number(existing.rows[0].rate_total_cents) },
      afterCommit: () => {},
    };
  }
  const disposition = dispositionFor(row.at_status);
  if (disposition === "not_booked") return { result: { ...base, outcome: "not_booked_status" }, afterCommit: () => {} };

  const cust = await findCreatorCustomer(client as never, ctx.opco, { load_number: row.load_number, customer_id: null, customer_name: row.customer_name });
  if (!("id" in cust)) throw new RowRefusal(cust.code, cust.message);
  const driverId = await resolveDriver(client, ctx.opco, row.driver_name);
  const unitId = await resolveUnit(client, ctx.opco, row.truck_number);
  const trailerChoice = await printedTrailerChoice(client as never, ctx.opco, row.trailer_number, false);
  if (!trailerChoice) throw new RowRefusal("trailer_required", `Load ${row.load_number}: the export names no trailer.`);
  const trailerTypeId = await creatorLoadTrailerEquipmentId(client as never, ctx.opco, trailerChoice);
  if (!row.wo_number?.trim()) throw new RowRefusal("customer_po_or_wo_number_required", `Load ${row.load_number}: the export has no W.O. number.`);

  const practical = practicalMiles(row);
  const short = payMiles(row) ?? practical;
  if (disposition === "deliver" && (short == null || practical == null)) {
    throw new RowRefusal("miles_required", `Load ${row.load_number}: the export has no L.Miles / pay miles for a completed load.`);
  }
  const payOverride = loadHistoryPayOverride(row, disposition, await activeCardRateCents(client, ctx.opco, driverId));

  const local = isLocalMove(row);
  let tripType: BookLoadInput["trip_type"];
  let tourId: string | undefined;
  const settlement = row.settlement_no?.trim() || null;
  if (local) tripType = "LOCAL";
  else if (settlement && ctx.tours.has(settlement)) {
    tripType = "TR";
    tourId = ctx.tours.get(settlement);
  } else {
    tripType = "NB";
    tourId = randomUUID();
  }

  const planned: LoadHistoryRowResult = {
    ...base,
    outcome: disposition === "deliver" ? "would_book_delivered" : "would_book_dispatched",
    customer_id: cust.id,
    driver_id: driverId,
    unit_id: unitId,
  };
  if (!ctx.commit) {
    if (!local && settlement && tourId && !ctx.tours.has(settlement)) ctx.tours.set(settlement, tourId);
    return { result: planned, afterCommit: () => {} };
  }

  const input: BookLoadInput = {
    ...(payOverride ?? {}),
    requestingUserUuid: ctx.actor.uuid,
    requestingUserRole: ctx.actor.role,
    operating_company_id: ctx.opco,
    customer_id: cust.id,
    status: "dispatched",
    trip_type: tripType,
    tour_id: tourId,
    customer_wo_number: row.wo_number.trim(),
    requested_load_number: row.load_number,
    assigned_primary_driver_id: driverId,
    assigned_unit_id: unitId,
    assigned_trailer_unit_id: trailerChoice.kind === "company" ? trailerChoice.equipment_id : undefined,
    trailer_choice: trailerChoice,
    load_trailer_equipment_id: trailerTypeId ?? undefined,
    miles_practical: practical ?? undefined,
    miles_shortest: short ?? undefined,
    mileage_source: "Operator entered",
    save_mode: "book_dispatch",
    addToOpenPresettlement: true,
    is_sample_data: false,
    inbound_source: { system: "alwaystrack", company_code: ctx.companyCode as "USMCA", reference: `AlwaysTrack load history load ${row.load_number}` },
    override_reason: LOAD_HISTORY_QUAL_OVERRIDE_REASON,
    override_rules: [{ rule_code: "DOT_QUALIFICATION", reason: LOAD_HISTORY_QUAL_OVERRIDE_REASON }],
    charges: [{ code: "linehaul", description: "Line haul", amount_cents: row.charges_cents }],
    stops: [
      { sequence_number: 1, stop_type: "pickup", city: row.origin.city, state: row.origin.state, country: stopCountry(row.origin.state), scheduled_arrival_at: localDayStartIso(row.pickup_date) },
      { sequence_number: 2, stop_type: "delivery", city: row.destination.city, state: row.destination.state, country: stopCountry(row.destination.state), scheduled_arrival_at: localDayStartIso(row.delivery_date) },
    ],
    notes: rowNote(row),
  } as BookLoadInput;

  const booked = await bookLoadOnClient(client as never, input, { source: "historical_backfill" });
  if (booked.result.kind !== "ok") {
    const payload = (booked.result as { payload?: { error?: string; message?: string } }).payload ?? {};
    throw new RowRefusal(String(payload.error ?? "book_load_failed"), `Load ${row.load_number}: ${payload.message ?? JSON.stringify(payload)}`);
  }
  const loadId = String((booked.result as { row?: { id?: unknown } }).row?.id ?? "");
  if (disposition === "deliver" && loadId) {
    await stampStopsFromTracking(client as never, loadId, ctx.opco, { pickupDate: row.pickup_date, deliveryDate: row.delivery_date });
    await deliverLoadThroughDispatch(client as never, ctx.actor.uuid, ctx.opco, loadId, row.delivery_date);
  }
  if (!local && settlement && tourId && !ctx.tours.has(settlement)) ctx.tours.set(settlement, tourId);
  return {
    result: { ...planned, outcome: disposition === "deliver" ? "booked_delivered" : "booked_dispatched", load_id: loadId },
    afterCommit: booked.afterCommit,
  };
}

export async function importAlwaysTrackLoadHistory(input: {
  actor: { uuid: string; role: string };
  operatingCompanyId: string;
  sourceCompanyCode: string;
  buffer: Buffer;
  commit: boolean;
  /** Test seam: the scope runner (defaults to withCompanyScope — one transaction per load). */
  scope?: <T>(fn: (client: Q) => Promise<T>) => Promise<T>;
}): Promise<LoadHistoryImportResult> {
  const parsed = await parseAlwaysTrackLoadHistory(input.buffer);
  const scope = input.scope ?? (<T>(fn: (client: Q) => Promise<T>) => withCompanyScope(input.actor.uuid, input.operatingCompanyId, fn));
  const companyCode = await scope(async (client) =>
    (await client.query<{ code: string | null }>(`SELECT code FROM org.companies WHERE id = $1::uuid`, [input.operatingCompanyId])).rows[0]?.code ?? null,
  );
  if (!companyCode || companyCode !== input.sourceCompanyCode) {
    throw new RowRefusal(
      "inbound_load_entity_mismatch",
      `The export is named as ${input.sourceCompanyCode}'s load history; it cannot be booked under ${companyCode ?? "an unknown company"}.`,
    );
  }
  const ordered = [...parsed.rows].sort((a, b) => (a.pickup_date === b.pickup_date ? a.load_number.localeCompare(b.load_number) : a.pickup_date.localeCompare(b.pickup_date)));
  const tours = new Map<string, string>();
  const results: LoadHistoryRowResult[] = [];
  for (const row of ordered) {
    try {
      const { result, afterCommit } = await scope((client) =>
        processRow(client, { actor: input.actor, opco: input.operatingCompanyId, companyCode, commit: input.commit, tours }, row),
      );
      results.push(result);
      afterCommit();
    } catch (err) {
      const code = err instanceof RowRefusal || (err as { code?: unknown })?.code ? String((err as { code: unknown }).code) : "error";
      results.push({
        load_number: row.load_number,
        outcome: "refused",
        at_status: row.at_status,
        charges_cents: row.charges_cents,
        refusal: { code, message: err instanceof Error ? err.message : String(err) },
      });
    }
  }
  const tally = (pred: (r: LoadHistoryRowResult) => boolean) => {
    const rs = results.filter(pred);
    return { count: rs.length, charges_cents: rs.reduce((a, r) => a + r.charges_cents, 0) };
  };
  return {
    commit: input.commit,
    title: parsed.title,
    range_label: parsed.range_label,
    invoiced_by: parsed.invoiced_by,
    row_count: parsed.rows.length,
    totals: { charges_cents: parsed.totals.charges_cents },
    booked: tally((r) => r.outcome.startsWith("booked_") || r.outcome.startsWith("would_book_")),
    skipped_existing: tally((r) => r.outcome === "skipped_existing"),
    refused: tally((r) => r.outcome === "refused"),
    not_booked_status: tally((r) => r.outcome === "not_booked_status"),
    rows: results,
  };
}

export { RowRefusal as LoadHistoryRowRefusal };
