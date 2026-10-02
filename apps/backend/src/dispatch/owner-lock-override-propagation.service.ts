/**
 * D-H0 (ORDERS-2026-10-01 / ROUND 312) — Owner/Admin lock-override propagation.
 * After a locked-load override PATCH lands, re-derive draft invoices / open driver bills,
 * refuse paid/synced invoices and settled bills, re-geocode + re-rate miles + re-bind E-25 fences
 * on stop moves, and surface SET-01 presettlement re-link when trip_type changes.
 */
import { resyncProformaInvoiceFromLoadRate } from "../accounting/resync-proforma-from-load-rate.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { bindLoadToGeofences } from "./geofences/load-geofence-binding.service.js";
import { ensureDriverBillArtifactsForLoad, type DriverBillMintOutcome } from "./book-load.service.js";
import { geocodeStopsWithClient } from "../telematics/stops-geocode-backfill.service.js";
import { resolvePointMileage } from "./mileage/mileage.service.js";
import { OsrmProvider } from "./mileage/osrm.provider.js";

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

export type OwnerLockPropagationItem = {
  kind:
    | "invoice_rederived"
    | "invoice_refused_paid_or_synced"
    | "driver_bill_rederived"
    | "driver_bill_refused_settled"
    | "stops_geocoded"
    | "miles_rerated"
    | "fences_rebound"
    | "presettlement_relinked";
  detail: string;
  reference_id?: string | null;
  reference_display_id?: string | null;
};

export class OwnerLockPropagationRefuseError extends Error {
  readonly code: "invoice_paid_or_synced_void_and_reissue" | "driver_bill_settled_adjust_on_next_settlement";
  readonly propagation: OwnerLockPropagationItem[];
  readonly reference_id: string | null;
  readonly reference_display_id: string | null;
  constructor(
    code: OwnerLockPropagationRefuseError["code"],
    message: string,
    opts: {
      propagation: OwnerLockPropagationItem[];
      reference_id?: string | null;
      reference_display_id?: string | null;
    }
  ) {
    super(message);
    this.name = "OwnerLockPropagationRefuseError";
    this.code = code;
    this.propagation = opts.propagation;
    this.reference_id = opts.reference_id ?? null;
    this.reference_display_id = opts.reference_display_id ?? null;
  }
}

export type OwnerLockPropagationInput = {
  loadId: string;
  operatingCompanyId: string;
  requestingUserUuid: string;
  rateChanged: boolean;
  newRateTotalCents: number;
  payInputsChanged: boolean;
  stopsChanged: boolean;
  tripTypeChanged: boolean;
  /** When true, caller already ran geocode; we still re-bind fences. */
  alreadyGeocoded?: boolean;
};

export type OwnerLockPropagationResult = {
  items: OwnerLockPropagationItem[];
  driver_bill_mint: DriverBillMintOutcome | null;
};

/**
 * Pre-flight before mutating a locked load's charges/rate: refuse if any live invoice is
 * sent/paid/synced so we never silently diverge load vs invoice.
 */
export async function assertInvoiceAllowsRateOverride(
  client: DbClient,
  input: { loadId: string; operatingCompanyId: string }
): Promise<void> {
  const blocked = await client.query<{ id: string; display_id: string | null; status: string }>(
    `
      SELECT i.id::text AS id, i.display_id, i.status
      FROM accounting.invoices i
      WHERE i.operating_company_id = $1::uuid
        AND i.source_load_id = $2::uuid
        AND i.voided_at IS NULL
        AND (
          i.status IN ('sent', 'partial', 'paid', 'factored')
          OR i.qbo_invoice_id IS NOT NULL
          OR i.last_qbo_synced_at IS NOT NULL
        )
      LIMIT 1
    `,
    [input.operatingCompanyId, input.loadId]
  );
  if (blocked.rows[0]) {
    throw new OwnerLockPropagationRefuseError(
      "invoice_paid_or_synced_void_and_reissue",
      "Invoice is sent, paid, or synced — void and reissue before changing load charges/rate.",
      {
        propagation: [
          {
            kind: "invoice_refused_paid_or_synced",
            detail: `Invoice ${blocked.rows[0].display_id ?? blocked.rows[0].id} status=${blocked.rows[0].status} — void and reissue.`,
            reference_id: blocked.rows[0].id,
            reference_display_id: blocked.rows[0].display_id,
          },
        ],
        reference_id: blocked.rows[0].id,
        reference_display_id: blocked.rows[0].display_id,
      }
    );
  }
}

/**
 * Pre-flight before mutating pay inputs on a locked load: refuse when the driver bill sits on
 * a closed settlement (adjustment belongs on the next settlement — never rewrite closed money).
 */
export async function assertDriverBillAllowsPayOverride(
  client: DbClient,
  input: { loadId: string; operatingCompanyId: string; requestingUserUuid: string }
): Promise<void> {
  const settled = await client.query<{
    bill_id: string;
    settlement_id: string;
    settlement_display: string | null;
  }>(
    `
      SELECT b.id::text AS bill_id,
             s.id::text AS settlement_id,
             COALESCE(s.source_document_ref, s.display_id) AS settlement_display
      FROM driver_finance.driver_bills b
      JOIN driver_finance.settlement_lines sl
        ON sl.source_driver_bill_id = b.id
       AND sl.voided_at IS NULL
      JOIN driver_finance.driver_settlements s
        ON s.id = sl.settlement_id
       AND s.operating_company_id = b.operating_company_id
      WHERE b.operating_company_id = $1::uuid
        AND b.load_id = $2::uuid
        AND s.status = 'closed'
      LIMIT 1
    `,
    [input.operatingCompanyId, input.loadId]
  );
  if (!settled.rows[0]) return;

  await appendCrudAudit(
    client,
    input.requestingUserUuid,
    "dispatch.load_edit_lock_override_settlement_adjustment_needed",
    {
      load_id: input.loadId,
      operating_company_id: input.operatingCompanyId,
      driver_bill_id: settled.rows[0].bill_id,
      closed_settlement_id: settled.rows[0].settlement_id,
      closed_settlement_display: settled.rows[0].settlement_display,
      instruction: "Create adjustment on next open settlement — do not rewrite closed settlement lines.",
    },
    "warning",
    "D-H0-OWNER-LOCK-OVERRIDE"
  );

  throw new OwnerLockPropagationRefuseError(
    "driver_bill_settled_adjust_on_next_settlement",
    "Driver bill is on a closed settlement — adjust on the next settlement.",
    {
      propagation: [
        {
          kind: "driver_bill_refused_settled",
          detail: `Settlement ${settled.rows[0].settlement_display ?? settled.rows[0].settlement_id} is closed — adjustment on next settlement.`,
          reference_id: settled.rows[0].settlement_id,
          reference_display_id: settled.rows[0].settlement_display,
        },
      ],
      reference_id: settled.rows[0].settlement_id,
      reference_display_id: settled.rows[0].settlement_display,
    }
  );
}

/**
 * D-H0 — after stop addresses move, re-rate practical/short miles from first→last geocoded stop.
 * Honest NULL when coords missing or OSRM blank — never invent miles.
 */
export async function rerateLoadMilesFromStops(
  client: DbClient,
  input: { loadId: string; operatingCompanyId: string }
): Promise<{ practical_miles: number | null; shortest_miles: number | null; detail: string }> {
  const stops = await client.query<{
    sequence_number: number;
    latitude: string | null;
    longitude: string | null;
  }>(
    `
      SELECT sequence_number,
             latitude::text AS latitude,
             longitude::text AS longitude
      FROM mdata.load_stops s
      WHERE s.load_id = $1::uuid
        AND EXISTS (SELECT 1 FROM mdata.loads l WHERE l.id = s.load_id AND l.operating_company_id = $2::uuid)
        AND COALESCE(s.status, 'active') <> 'cancelled'
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
      ORDER BY sequence_number ASC
    `,
    [input.loadId, input.operatingCompanyId]
  );
  if (stops.rows.length < 2) {
    return {
      practical_miles: null,
      shortest_miles: null,
      detail: "Miles not re-rated — fewer than two geocoded stops.",
    };
  }
  const origin = stops.rows[0]!;
  const dest = stops.rows[stops.rows.length - 1]!;
  const originLat = Number(origin.latitude);
  const originLng = Number(origin.longitude);
  const destLat = Number(dest.latitude);
  const destLng = Number(dest.longitude);
  if (![originLat, originLng, destLat, destLng].every((n) => Number.isFinite(n))) {
    return {
      practical_miles: null,
      shortest_miles: null,
      detail: "Miles not re-rated — stop coordinates are not finite.",
    };
  }
  const resolution = await resolvePointMileage(
    client,
    new OsrmProvider(),
    { lat: originLat, lng: originLng },
    { lat: destLat, lng: destLng }
  );
  if (resolution.source === "blank" || resolution.practical_miles == null) {
    return {
      practical_miles: null,
      shortest_miles: null,
      detail: `Miles not re-rated — ${resolution.reason ?? "blank route"}.`,
    };
  }
  await client.query(
    `
      UPDATE mdata.loads
         SET miles_practical = $3::numeric,
             miles_shortest = $4::numeric,
             -- CC-3 2g: loaded_miles is derived — same rule as loadedMilesFor (shortest > 0, else practical).
             loaded_miles = CASE WHEN coalesce($4::numeric, 0) > 0 THEN $4::numeric ELSE $3::numeric END,
             updated_at = now()
       WHERE id = $1::uuid
         AND operating_company_id = $2::uuid
         AND soft_deleted_at IS NULL
    `,
    [input.loadId, input.operatingCompanyId, resolution.practical_miles, resolution.shortest_miles]
  );
  return {
    practical_miles: resolution.practical_miles,
    shortest_miles: resolution.shortest_miles,
    detail: `Re-rated miles practical=${resolution.practical_miles} short=${resolution.shortest_miles ?? "null"} (${resolution.source}/${resolution.engine}).`,
  };
}

export async function runOwnerLockOverridePropagation(
  client: DbClient,
  input: OwnerLockPropagationInput
): Promise<OwnerLockPropagationResult> {
  const items: OwnerLockPropagationItem[] = [];
  let driverBillMint: DriverBillMintOutcome | null = null;

  if (input.rateChanged) {
    const ids = await resyncProformaInvoiceFromLoadRate(client, {
      loadId: input.loadId,
      operatingCompanyId: input.operatingCompanyId,
      newRateTotalCents: input.newRateTotalCents,
      userId: input.requestingUserUuid,
    });
    if (ids.length > 0) {
      items.push({
        kind: "invoice_rederived",
        detail: `Re-derived ${ids.length} draft/proforma invoice linehaul(s) from load rate.`,
        reference_id: ids[0] ?? null,
      });
    } else {
      items.push({
        kind: "invoice_rederived",
        detail: "No draft/proforma invoice to re-derive (none yet or already matching).",
      });
    }
  }

  if (input.payInputsChanged) {
    driverBillMint = await ensureDriverBillArtifactsForLoad(client, {
      loadId: input.loadId,
      operatingCompanyId: input.operatingCompanyId,
      actorUserId: input.requestingUserUuid,
    });
    items.push({
      kind: "driver_bill_rederived",
      detail: `Driver bill path: ${driverBillMint?.outcome ?? "n/a"}`,
      reference_id: (driverBillMint as { bill_id?: string } | null)?.bill_id ?? null,
    });
  }

  if (input.stopsChanged) {
    if (!input.alreadyGeocoded) {
      await geocodeStopsWithClient(client, input.requestingUserUuid, input.operatingCompanyId, input.loadId);
      items.push({ kind: "stops_geocoded", detail: "Stops re-geocoded after address change." });
    }
    const miles = await rerateLoadMilesFromStops(client, {
      loadId: input.loadId,
      operatingCompanyId: input.operatingCompanyId,
    });
    items.push({ kind: "miles_rerated", detail: miles.detail });
    const fences = await bindLoadToGeofences(client, input.operatingCompanyId, input.loadId);
    items.push({
      kind: "fences_rebound",
      detail: `E-25 fences: created=${fences.created} refreshed=${fences.refreshed} unchanged=${fences.unchanged} skipped=${fences.skipped_low_precision.length}`,
    });
  }

  if (input.tripTypeChanged) {
    items.push({
      kind: "presettlement_relinked",
      detail: "trip_type changed — SET-01 linker re-entered by updateDispatchLoad.",
    });
  }

  return { items, driver_bill_mint: driverBillMint };
}
