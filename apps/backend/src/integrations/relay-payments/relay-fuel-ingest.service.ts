/**
 * Relay Payments fuel-transaction INGEST — storage only (no GL/expense posting; see design doc).
 *
 * Upserts each pulled/webhook transaction into integrations.relay_fuel_transactions (+ _lines) by
 * (operating_company_id, transaction_id) — idempotent, safe to re-run over the same window or receive
 * the same webhook twice. Resolves (read-only) the driver via mdata.drivers.integration_id (= Relay's
 * driver.integration_id, the fuel-card/driver number) and the unit via the "Truck #" prompt's value
 * matched against mdata.units.unit_number. Money fields are converted from Relay's string dollar
 * amounts to integer cents at this layer.
 *
 * ERROR POLICY: every DB/parse error is logged (via the caller-supplied logger) and RE-THROWN — this
 * ingest never silently swallows a failure. Callers (cron tick / webhook handler) decide whether to
 * isolate a single row's failure from the rest of a batch, but the failure itself is always surfaced.
 *
 * @packageDocumentation
 */
import type { RelayFuelTransaction } from "./relay-client.js";

export type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export type RelayIngestSource = "daily_pull" | "webhook";

export type RelayIngestResult = {
  relay_fuel_transaction_id: string;
  transaction_id: string;
  matched_driver_id: string | null;
  matched_unit_id: string | null;
  line_count: number;
};

/** Relay sends dollar amounts as strings (e.g. "182.44"). Converts to integer cents; never silently
 *  coerces a garbage value to 0 — an unparsable amount throws so the row is dead-lettered/surfaced,
 *  not stored as a wrong-but-plausible $0.00. */
function dollarsToCents(value: string | null | undefined, fieldName: string): number {
  if (value == null || value.trim() === "") {
    throw new Error(`relay_fuel_ingest: missing required money field ${fieldName}`);
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`relay_fuel_ingest: unparsable money field ${fieldName}=${JSON.stringify(value)}`);
  }
  return Math.round(n * 100);
}

/** Same conversion, but the field is OPTIONAL — absent/blank yields null rather than throwing. */
function optionalDollarsToCents(value: string | null | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** The "Truck #" prompt carries our unit number (per Jorge's confirmed matching rule). Label match is
 *  case-insensitive/trim-tolerant — Relay's own casing is not guaranteed stable. */
export function findTruckNumberPrompt(prompts: { label: string; value: string }[]): string | null {
  const hit = prompts.find((p) => p.label?.trim().toLowerCase() === "truck #");
  const value = hit?.value?.trim();
  return value && value.length > 0 ? value : null;
}

async function resolveMatchedDriverId(
  client: DbClient,
  operatingCompanyId: string,
  relayDriverIntegrationId: string | null
): Promise<string | null> {
  if (!relayDriverIntegrationId) return null;
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM mdata.drivers
      WHERE operating_company_id = $1::uuid
        AND integration_id = $2
        AND deactivated_at IS NULL
        AND archived_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId, relayDriverIntegrationId]
  );
  return res.rows[0]?.id ?? null;
}

async function resolveMatchedUnitId(client: DbClient, truckNumber: string | null): Promise<string | null> {
  if (!truckNumber) return null;
  const res = await client.query<{ id: string }>(
    `SELECT id::text AS id FROM mdata.units WHERE unit_number = $1 LIMIT 1`,
    [truckNumber]
  );
  return res.rows[0]?.id ?? null;
}

/**
 * Upsert one Relay fuel transaction (+ its fuel_items lines) for one operating company. Must run
 * inside a transaction that has already `SET LOCAL app.operating_company_id` (or under a lucia-bypass
 * connection that the caller then scopes via set_config) so RLS + the FK checks resolve correctly.
 */
export async function upsertRelayFuelTransaction(
  client: DbClient,
  operatingCompanyId: string,
  tx: RelayFuelTransaction,
  ingestSource: RelayIngestSource
): Promise<RelayIngestResult> {
  const truckNumber = findTruckNumberPrompt(tx.prompts ?? []);
  const relayDriverIntegrationId = tx.driver?.integration_id ?? null;

  const matchedDriverId = await resolveMatchedDriverId(client, operatingCompanyId, relayDriverIntegrationId);
  const matchedUnitId = await resolveMatchedUnitId(client, truckNumber);

  const totalAmountPaidCents = dollarsToCents(tx.total_amount_paid, "total_amount_paid");
  const totalRetailPriceCents = dollarsToCents(tx.total_retail_price, "total_retail_price");
  const totalAmountSavedCents = optionalDollarsToCents(tx.total_amount_saved);

  const columns = [
    "operating_company_id",
    "transaction_id",
    "relay_created_at",
    "relay_fuel_code",
    "total_amount_paid_cents",
    "total_retail_price_cents",
    "total_amount_saved_cents",
    "is_direct_bill",
    "currency_code",
    "cash_advance",
    "fuel_code_type",
    "linked_org_id",
    "linked_org_name",
    "linked_org_number",
    "relay_driver_id",
    "relay_driver_first_name",
    "relay_driver_last_name",
    "relay_driver_phone",
    "relay_driver_email",
    "relay_driver_integration_id",
    "merchant_id",
    "merchant_name",
    "merchant_number",
    "location_id",
    "location_name",
    "location_fuel_merchant_location_id",
    "location_address",
    "location_city",
    "location_state",
    "location_zip_code",
    "location_latitude",
    "location_longitude",
    "location_opis_id",
    "location_timezone",
    "prompts",
    "fees",
    "products",
    "matched_driver_id",
    "matched_unit_id",
    "matched_unit_number",
    "raw_payload",
    "ingest_source",
  ] as const;

  const values: unknown[] = [
    operatingCompanyId,
    tx.transaction_id,
    tx.created_at,
    tx.relay_fuel_code,
    totalAmountPaidCents,
    totalRetailPriceCents,
    totalAmountSavedCents,
    tx.is_direct_bill,
    tx.currency_code ?? "USD",
    tx.cash_advance,
    tx.fuel_code_type,
    tx.linked_org?.id ?? null,
    tx.linked_org?.name ?? null,
    tx.linked_org?.number ?? null,
    tx.driver?.id ?? null,
    tx.driver?.first_name ?? null,
    tx.driver?.last_name ?? null,
    tx.driver?.phone ?? null,
    tx.driver?.email ?? null,
    relayDriverIntegrationId,
    tx.merchant?.id ?? null,
    tx.merchant?.name ?? null,
    tx.merchant?.number ?? null,
    tx.location?.id ?? null,
    tx.location?.name ?? null,
    tx.location?.fuel_merchant_location_id ?? null,
    tx.location?.address ?? null,
    tx.location?.city ?? null,
    tx.location?.state ?? null,
    tx.location?.zip_code ?? null,
    tx.location?.latitude ?? null,
    tx.location?.longitude ?? null,
    tx.location?.opis_id ?? null,
    tx.location?.timezone ?? null,
    JSON.stringify(tx.prompts ?? []),
    JSON.stringify(tx.fees ?? []),
    JSON.stringify(tx.products ?? []),
    matchedDriverId,
    matchedUnitId,
    truckNumber,
    JSON.stringify(tx),
    ingestSource,
  ];

  const placeholders = columns.map((_, i) => `$${i + 1}`);
  const updateSet = columns
    .filter((c) => c !== "operating_company_id" && c !== "transaction_id")
    .map((c) => `${c} = EXCLUDED.${c}`)
    .concat(["updated_at = now()"])
    .join(", ");

  const res = await client.query<{ id: string }>(
    `
      INSERT INTO integrations.relay_fuel_transactions (${columns.join(", ")})
      VALUES (${placeholders.join(", ")})
      ON CONFLICT (operating_company_id, transaction_id)
      DO UPDATE SET ${updateSet}
      RETURNING id::text AS id
    `,
    values
  );
  const relayFuelTransactionId = res.rows[0]?.id;
  if (!relayFuelTransactionId) {
    throw new Error(`relay_fuel_ingest: upsert did not return an id for transaction_id=${tx.transaction_id}`);
  }

  // Line items: replace-in-place under the SAME transaction id (delete-then-insert keeps line_index
  // contiguous even if Relay's fuel_items array shrinks/reorders on a webhook re-delivery).
  await client.query(`DELETE FROM integrations.relay_fuel_transaction_lines WHERE relay_fuel_transaction_id = $1`, [
    relayFuelTransactionId,
  ]);

  const fuelItems = tx.fuel_items ?? [];
  for (let i = 0; i < fuelItems.length; i += 1) {
    const item = fuelItems[i];
    await client.query(
      `
        INSERT INTO integrations.relay_fuel_transaction_lines (
          operating_company_id, relay_fuel_transaction_id, line_index,
          fuel_type, fuel_type_description, fuel_product_code,
          retail_price_per_unit_cents, discounted_price_per_unit_cents,
          volume, volume_uom,
          total_retail_price_cents, total_discounted_price_cents,
          fee_type, fee_amount_cents
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `,
      [
        operatingCompanyId,
        relayFuelTransactionId,
        i,
        item.fuel_type,
        item.fuel_type_description,
        item.fuel_product_code,
        optionalDollarsToCents(item.retail_price_per_unit),
        optionalDollarsToCents(item.discounted_price_per_unit),
        item.volume != null && item.volume !== "" ? Number(item.volume) : null,
        item.volume_uom,
        optionalDollarsToCents(item.total_retail_price),
        optionalDollarsToCents(item.total_discounted_price),
        item.fee?.type ?? null,
        optionalDollarsToCents(item.fee?.amount ?? null),
      ]
    );
  }

  return {
    relay_fuel_transaction_id: relayFuelTransactionId,
    transaction_id: tx.transaction_id,
    matched_driver_id: matchedDriverId,
    matched_unit_id: matchedUnitId,
    line_count: fuelItems.length,
  };
}
