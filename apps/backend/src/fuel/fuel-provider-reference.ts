import crypto from "node:crypto";

// ROUND 367.2 / 367.8 (CC-2) — a fuel purchase is unique per PROVIDER TRANSACTION ID.
//
// The card provider (AlwaysTrack, Relay, the fleet-card export) prints one transaction number per purchase. On USMCA the
// reference column holds 255 such numbers (digits only) and 65 values that are NOT a provider key: synthetic
// "DEF-<load>-n" / "nofuelinv-<n>-n" placeholders and parse fragments ("ustFluid", "101 PINNACLE ROAD", "62.410"). Only
// the digits are a key; anything else is named "no provider key" and is not deduplicated on.
//
// Before this file, the settlement seed hashed (company, LOAD, date, vendor, invoice): the same AlwaysTrack invoice
// printed on two drivers' settlements for two loads got two hashes, so fuel_tx_source_row_hash_uk never fired and three
// purchases (99530579, 1848853, 99794138) were recorded and posted twice. The database refusal is migration
// 202615370600; this helper is the writers' side of it, so a duplicate is refused with its name before the INSERT.

/** The provider's transaction ID, or null when the reference is not one (blank, placeholder, parse fragment). */
export function providerTransactionId(reference: string | null | undefined): string | null {
  const ref = (reference ?? "").trim();
  return /^[0-9]+$/.test(ref) ? ref : null;
}

/**
 * source_row_hash for a row entered by hand (Settlement Creator, the fuel form). The column is NOT NULL since
 * 202614220000; both writers omitted it, so every hand-entered fuel line failed with 23502. Keyed on the provider ID when
 * there is one (the unique index then refuses a second copy too); a line with no provider key gets its own hash.
 */
export function enteredFuelRowHash(operatingCompanyId: string, vendorId: string | null, reference: string | null | undefined): string {
  const providerId = providerTransactionId(reference);
  return providerId
    ? `provider:${operatingCompanyId}:${vendorId ?? "no-vendor"}:${providerId}`
    : `entered:${crypto.randomUUID()}`;
}

export class FuelProviderTransactionDuplicateError extends Error {
  readonly code = "fuel_provider_transaction_already_recorded";
  constructor(
    readonly providerId: string,
    readonly existingFuelTransactionId: string,
    readonly existingLoadNumber: string | null
  ) {
    super(
      `Fuel purchase ${providerId} is already recorded (fuel transaction ${existingFuelTransactionId}` +
        `${existingLoadNumber ? `, load ${existingLoadNumber}` : ", no load"}). One provider transaction is one purchase — ` +
        `open the existing one instead of entering it again.`
    );
  }
}

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

/**
 * The live fuel row already carrying this provider transaction ID for this company, vendor and PRODUCT LINE, if any.
 * One Love's ticket prints diesel, DEF and reefer fuel as separate lines under one receipt (202615410930) — the product is
 * part of the key, so a DEF line is never mistaken for (and merged into) the diesel line on the same ticket.
 */
export async function findLiveFuelByProviderTransactionId(
  client: Queryable,
  input: { operatingCompanyId: string; vendorId: string | null; reference: string | null | undefined; fuelType: string | null }
): Promise<{ id: string; load_id: string | null; load_number: string | null } | null> {
  const providerId = providerTransactionId(input.reference);
  if (!providerId) return null;
  const res = await client.query(
    `SELECT f.id::text AS id, f.load_id::text AS load_id, l.load_number::text AS load_number
       FROM fuel.fuel_transactions f
       LEFT JOIN mdata.loads l ON l.id = f.load_id
      WHERE f.operating_company_id = $1::uuid
        AND f.vendor_id IS NOT DISTINCT FROM $2::uuid
        AND btrim(f.transaction_reference) = $3
        AND f.fuel_type::text IS NOT DISTINCT FROM $4::text
        AND f.voided_at IS NULL
      ORDER BY f.created_at
      LIMIT 1`,
    [input.operatingCompanyId, input.vendorId, providerId, input.fuelType]
  );
  const row = res.rows[0] as { id: string; load_id: string | null; load_number: string | null } | undefined;
  return row ?? null;
}

/** Throws FuelProviderTransactionDuplicateError when the provider transaction is already recorded. */
export async function refuseDuplicateProviderTransaction(
  client: Queryable,
  input: { operatingCompanyId: string; vendorId: string | null; reference: string | null | undefined; fuelType: string | null }
): Promise<void> {
  const existing = await findLiveFuelByProviderTransactionId(client, input);
  if (existing) throw new FuelProviderTransactionDuplicateError(providerTransactionId(input.reference)!, existing.id, existing.load_number);
}
