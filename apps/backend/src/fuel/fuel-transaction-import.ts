import crypto from "node:crypto";
import type { FuelTxnGlPostCandidate } from "../accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js";

/**
 * FUEL-1 — Fuel-card TRANSACTION import writer.
 *
 * Root cause of the empty fuel module: `fuel.fuel_transactions` had 7+ READERS
 * (transaction-register, IFTA gallons, load-profitability, per-truck CPM, driver
 * fuel-history, fraud-detector, unit-aggregate …) but ZERO writers. The only
 * "loves-card-import" that existed is a station *price* feed
 * (`fuel.loves_prices_daily`: station_name/address/price_per_gallon) — it carries
 * no gallons/unit/driver/amount, so it structurally cannot populate a transaction.
 *
 * This module ingests a real fleet-card TRANSACTION export (Love's / WEX / EFS /
 * Comdata all share the same transaction schema) and persists each purchase into
 * `fuel.fuel_transactions`, resolving:
 *   - unit_id   by unit_number
 *   - driver_id by driver name
 *   - vendor_id by merchant name (best-effort)
 *   - load_id   (G18) by the load assigned to that unit/driver whose stop window
 *               brackets the transaction date — every diesel expense MUST FK to a
 *               load. When no load resolves we set a >=20 char load_exemption_reason
 *               that satisfies the accounting.enforce_load_fk_invariant() trigger
 *               AND flags the gap for manual linkage (never silently dropped).
 *
 * Idempotent: each row carries a deterministic source_row_hash; a unique index
 * (operating_company_id, source_row_hash) + ON CONFLICT DO NOTHING makes re-runs
 * a no-op. Nothing is invented — every persisted field maps from a real import cell.
 */

export type DbClient = {
  query: <T = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: T[]; rowCount?: number }>;
};

export type FuelCardImportRow = {
  transaction_at: string; // ISO
  transaction_reference: string | null;
  card_number: string | null;
  unit_number: string | null;
  driver_name: string | null;
  merchant: string | null;
  location_city: string | null;
  location_state: string | null;
  fuel_type: "diesel" | "def" | "gas" | "reefer_diesel" | "other";
  gallons: number | null;
  price_per_gallon: number | null;
  total_cost: number;
  source_row_hash: string;
};

export type FuelCardDeadLetter = {
  line_number: number;
  reason: string;
};

export type FuelCardParseResult = {
  rows: FuelCardImportRow[];
  dead_letters: FuelCardDeadLetter[];
};

export type FuelImportCounts = {
  rows_inserted: number;
  rows_duplicate: number;
  rows_skipped: number;
  rows_unlinked_to_load: number; // G18 gap: persisted with exemption reason, needs manual load link
  dead_letters: number;
  /** Callers flush these AFTER the import transaction commits (EXPENSE_GL_POSTING_ENABLED). */
  gl_post_candidates: FuelTxnGlPostCandidate[];
};

function pick(row: Record<string, unknown>, candidates: string[]): unknown {
  const keys = Object.keys(row);
  const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_-]+/g, "");
  for (const candidate of candidates) {
    const target = norm(candidate);
    const match = keys.find((k) => norm(k) === target);
    if (match !== undefined) {
      const v = row[match];
      if (v !== null && v !== undefined && String(v).trim() !== "") return v;
    }
  }
  return undefined;
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  // strip currency symbols, thousands separators
  const cleaned = String(v).replace(/[$,]/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toIso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  const raw = String(v).trim();
  if (raw === "") return null;
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.toISOString();
  return null;
}

export function normalizeFuelType(
  v: unknown
): FuelCardImportRow["fuel_type"] {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "") return "diesel";
  if (s.includes("def") || s.includes("urea")) return "def";
  if (s.includes("reefer") || s.includes("refer")) return "reefer_diesel";
  if (s.includes("diesel") || s.includes("dsl") || s.includes("ulsd")) return "diesel";
  if (s.includes("gas") || s.includes("unleaded") || s.includes("reg")) return "gas";
  return "other";
}

export function computeFuelRowHash(fields: {
  transaction_at: string | null;
  transaction_reference: string | null;
  card_number: string | null;
  unit_number: string | null;
  total_cost: number;
  gallons: number | null;
}): string {
  // Prefer the card provider's own reference when present; otherwise fall back
  // to a stable composite so re-uploads of the same file dedupe deterministically.
  const basis =
    fields.transaction_reference && fields.transaction_reference.trim() !== ""
      ? `ref:${fields.transaction_reference.trim().toLowerCase()}`
      : [
          fields.transaction_at ?? "",
          (fields.card_number ?? "").toLowerCase(),
          (fields.unit_number ?? "").toLowerCase(),
          fields.total_cost.toFixed(2),
          fields.gallons == null ? "" : fields.gallons.toFixed(3),
        ].join("|");
  return crypto.createHash("sha256").update(basis).digest("hex");
}

/**
 * Pure mapper: fleet-card export rows (already parsed to objects by the
 * central untrusted spreadsheet reader) → typed import rows. No I/O, fully unit-testable.
 */
export function mapFuelCardRows(rawRows: Record<string, unknown>[]): FuelCardParseResult {
  const rows: FuelCardImportRow[] = [];
  const dead_letters: FuelCardDeadLetter[] = [];

  rawRows.forEach((raw, idx) => {
    const lineNumber = idx + 2; // +1 header, +1 to 1-index

    const transaction_at = toIso(
      pick(raw, [
        "transaction_date",
        "trans_date",
        "date",
        "posting_date",
        "transaction_datetime",
        "datetime",
      ])
    );
    const total_cost = toNumber(
      pick(raw, [
        "total_amount",
        "total",
        "amount",
        "net_amount",
        "net_cost",
        "purchase_amount",
      ])
    );

    if (!transaction_at || total_cost === null) {
      dead_letters.push({
        line_number: lineNumber,
        reason: "missing transaction_date or total amount",
      });
      return;
    }

    const transaction_reference =
      (pick(raw, [
        "transaction_id",
        "trans_id",
        "invoice",
        "invoice_number",
        "reference",
        "reference_number",
        "auth_code",
      ]) as string | undefined) ?? null;
    const card_number =
      (pick(raw, ["card_number", "card", "fuel_card", "card_no", "account_number"]) as
        | string
        | undefined) ?? null;
    const unit_number =
      (pick(raw, ["unit", "unit_number", "vehicle", "vehicle_number", "truck", "truck_number", "unit_no"]) as
        | string
        | undefined) ?? null;
    const driver_name =
      (pick(raw, ["driver", "driver_name", "employee", "employee_name"]) as
        | string
        | undefined) ?? null;
    const merchant =
      (pick(raw, ["merchant", "merchant_name", "location_name", "site", "site_name", "station", "station_name"]) as
        | string
        | undefined) ?? null;
    const location_city =
      (pick(raw, ["city", "location_city", "merchant_city"]) as string | undefined) ?? null;
    const location_state =
      (pick(raw, ["state", "location_state", "merchant_state", "st"]) as string | undefined) ?? null;
    const gallons = toNumber(
      pick(raw, ["gallons", "quantity", "qty", "units", "fuel_qty", "volume"])
    );
    const price_per_gallon = toNumber(
      pick(raw, ["price_per_gallon", "ppg", "unit_price", "price", "unit_cost"])
    );
    const fuel_type = normalizeFuelType(
      pick(raw, ["fuel_type", "product", "product_type", "item", "item_description", "category"])
    );

    const source_row_hash = computeFuelRowHash({
      transaction_at,
      transaction_reference: transaction_reference ? String(transaction_reference) : null,
      card_number: card_number ? String(card_number) : null,
      unit_number: unit_number ? String(unit_number) : null,
      total_cost,
      gallons,
    });

    rows.push({
      transaction_at,
      transaction_reference: transaction_reference ? String(transaction_reference).trim() : null,
      card_number: card_number ? String(card_number).trim() : null,
      unit_number: unit_number ? String(unit_number).trim() : null,
      driver_name: driver_name ? String(driver_name).trim() : null,
      merchant: merchant ? String(merchant).trim() : null,
      location_city: location_city ? String(location_city).trim() : null,
      location_state: location_state ? String(location_state).trim().slice(0, 2).toUpperCase() : null,
      fuel_type,
      gallons,
      price_per_gallon,
      total_cost,
      source_row_hash,
    });
  });

  return { rows, dead_letters };
}

const NO_LOAD_EXEMPTION =
  "AUTO-IMPORT: no load matched the assigned unit/driver for this fuel-card transaction date; flagged for manual load linkage (G18)";

async function resolveUnitId(
  client: DbClient,
  companyId: string,
  unitNumber: string | null
): Promise<string | null> {
  if (!unitNumber) return null;
  // mdata.units has NO operating_company_id — it is scoped by
  // COALESCE(currently_leased_to_company_id, owner_company_id) (§4).
  const res = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.units
      WHERE COALESCE(currently_leased_to_company_id, owner_company_id) = $1
        AND lower(unit_number) = lower($2)
      LIMIT 1`,
    [companyId, unitNumber]
  );
  return res.rows[0]?.id ?? null;
}

async function resolveDriverId(
  client: DbClient,
  companyId: string,
  driverName: string | null
): Promise<string | null> {
  if (!driverName) return null;
  const res = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.drivers
      WHERE operating_company_id = $1::uuid
        AND deactivated_at IS NULL
        AND lower(concat_ws(' ', first_name, last_name)) = lower($2)
      LIMIT 1`,
    [companyId, driverName]
  );
  return res.rows[0]?.id ?? null;
}

/** Exported for Relay→canonical bridge (WAVE-H2 — stop hardcoding vendor_id NULL). */
export async function resolveVendorId(
  client: DbClient,
  companyId: string,
  merchant: string | null
): Promise<string | null> {
  if (!merchant) return null;
  const res = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.vendors
      WHERE operating_company_id = $1::uuid AND lower(vendor_name) = lower($2)
      LIMIT 1`,
    [companyId, merchant]
  );
  return res.rows[0]?.id ?? null;
}

/**
 * G18 load resolution: the load assigned to the resolved unit (fallback driver)
 * whose stop window brackets the transaction timestamp. Best-available linkage —
 * returns null when nothing matches so the caller records an exemption reason.
 * Exported for Relay→canonical bridge (WAVE-H2 — stop hardcoding load_id NULL).
 */
export async function resolveLoadId(
  client: DbClient,
  companyId: string,
  unitId: string | null,
  driverId: string | null,
  transactionAt: string
): Promise<string | null> {
  if (!unitId && !driverId) return null;
  const res = await client.query<{ id: string }>(
    `
      SELECT l.id::text
      FROM mdata.loads l
      JOIN mdata.load_stops s ON s.load_id = l.id
      WHERE l.operating_company_id = $1::uuid
        AND l.soft_deleted_at IS NULL
        AND (
          ($2::uuid IS NOT NULL AND l.assigned_unit_id = $2::uuid)
          OR ($3::uuid IS NOT NULL AND (
                l.assigned_primary_driver_id = $3::uuid
             OR l.assigned_secondary_driver_id = $3::uuid))
        )
      GROUP BY l.id
      HAVING MIN(COALESCE(s.scheduled_arrival_at, s.appointment_start_at)) <= $4::timestamptz + interval '1 day'
         AND MAX(COALESCE(s.scheduled_arrival_at, s.appointment_start_at)) >= $4::timestamptz - interval '1 day'
      ORDER BY MIN(COALESCE(s.scheduled_arrival_at, s.appointment_start_at)) DESC
      LIMIT 1
    `,
    [companyId, unitId, driverId, transactionAt]
  );
  return res.rows[0]?.id ?? null;
}

export async function importFuelCardTransactionsForCompany(
  client: DbClient,
  companyId: string,
  parsed: FuelCardParseResult,
  opts?: { userId?: string | null; sourceFileName?: string | null }
): Promise<FuelImportCounts> {
  const counts: FuelImportCounts = {
    rows_inserted: 0,
    rows_duplicate: 0,
    rows_skipped: 0,
    rows_unlinked_to_load: 0,
    dead_letters: parsed.dead_letters.length,
    gl_post_candidates: [],
  };

  for (const row of parsed.rows) {
    const unitId = await resolveUnitId(client, companyId, row.unit_number);
    const driverId = await resolveDriverId(client, companyId, row.driver_name);
    const vendorId = await resolveVendorId(client, companyId, row.merchant);
    const loadId = await resolveLoadId(client, companyId, unitId, driverId, row.transaction_at);
    const loadExemptionReason = loadId ? null : NO_LOAD_EXEMPTION;

    const notes = [
      row.card_number ? `card=${row.card_number}` : null,
      row.merchant && !vendorId ? `merchant=${row.merchant}` : null,
      row.driver_name && !driverId ? `driver_unmatched=${row.driver_name}` : null,
      row.unit_number && !unitId ? `unit_unmatched=${row.unit_number}` : null,
      opts?.sourceFileName ? `file=${opts.sourceFileName}` : null,
    ]
      .filter(Boolean)
      .join("; ");

    const insertRes = await client
      .query<{ id: string }>(
        `
          INSERT INTO fuel.fuel_transactions (
            operating_company_id,
            transaction_at,
            purchased_at,
            load_id,
            driver_id,
            unit_id,
            vendor_id,
            fuel_type,
            gallons,
            price_per_gallon,
            total_cost,
            location_city,
            location_state,
            transaction_reference,
            source,
            source_row_hash,
            notes,
            imported_at,
            load_required,
            load_exemption_reason,
            created_by_user_id
          )
          VALUES (
            $1, $2::timestamptz, $2::timestamptz, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13, 'import', $14, NULLIF($15, ''), now(),
            $18, $16, $17
          )
          ON CONFLICT (operating_company_id, source_row_hash) DO NOTHING
          RETURNING id::text
        `,
        [
          companyId,
          row.transaction_at,
          loadId,
          driverId,
          unitId,
          vendorId,
          row.fuel_type,
          row.gallons,
          row.price_per_gallon,
          row.total_cost,
          row.location_city,
          row.location_state,
          row.transaction_reference,
          row.source_row_hash,
          notes,
          loadExemptionReason,
          opts?.userId ?? null,
          // load_required mirrors whether resolveLoadId() actually found a load — previously this
          // was hardcoded `true` for every imported row, so a legitimately unattributed row (real
          // loadExemptionReason set above) still claimed it needed a load it will never get
          // (CLS-LINKAGE-ONEWAY / verify-disp-wire-06-load-expense-link).
          Boolean(loadId),
        ]
      )
      .catch((err) => {
        // Surface — never swallow silently; caller counts as skipped after logging.
        throw err;
      });

    if ((insertRes.rowCount ?? 0) > 0) {
      counts.rows_inserted += 1;
      if (!loadId) counts.rows_unlinked_to_load += 1;
      const fuelTxnId = insertRes.rows[0]?.id;
      const amountCents = Math.round(Number(row.total_cost ?? 0) * 100);
      if (fuelTxnId && amountCents > 0) {
        counts.gl_post_candidates.push({
          operating_company_id: companyId,
          actor_user_id: opts?.userId ?? null,
          fuel_transaction_id: fuelTxnId,
          fuel_type: row.fuel_type,
          transaction_at: row.transaction_at,
          amount_cents: amountCents,
          driver_id: driverId,
          location_state: row.location_state,
          gallons: row.gallons,
          cash_advance: false,
          // FUEL-08: CSV/fleet import with a card number is AP, not cash.
          has_fuel_card: Boolean(row.card_number),
        });
      }
    } else {
      counts.rows_duplicate += 1;
    }
  }

  return counts;
}
