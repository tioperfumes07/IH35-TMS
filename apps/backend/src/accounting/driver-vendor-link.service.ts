// CLS-DRIVER-VENDOR-UUID-FALLBACK — the single, canonical driver -> A/P vendor resolution.
//
// FOUND BY: ACCT-F158 (#4691) failing its own db test. Making `resolveBillVendorWriteColumns` fail
// closed turned a silent bad write into a loud one, and what it caught was the settlement posters
// handing `createBill` a DRIVER uuid in the `vendorId` slot:
//
//     const driverVendorId = String(driverRes.rows[0]?.qbo_vendor_id ?? settlement.driver_id).trim();
//     if (!driverVendorId) throw ... DRIVER_VENDOR_MISSING
//
// The `??` fallback makes the guard beneath it unreachable — `settlement.driver_id` is always a
// non-empty uuid, so `driverVendorId` is never falsy and DRIVER_VENDOR_MISSING can never fire. A
// driver with no vendor linkage does not stop; it posts a bill whose vendor is the driver's own id.
//
// MEASURED ON PROD br-fancy-credit-akjnd07a, 2026-08-07 (completeness discriminator on the same
// table: mdata.drivers total = 181, so the zero below is a real zero, not an RLS mask):
//     mdata.drivers ................................................. 181
//     ... with qbo_vendor_id set ...................................... 0
//     ... whose qbo_vendor_id resolves to a same-entity mdata.vendors .. 0
//     mdata.vendors with driver_id set ............................... 37
//     drivers with a same-entity vendor via mdata.vendors.driver_id ... 37
//
// So on prod the `??` fallback is not an edge case — it is the ONLY branch that can be taken, for
// 100% of drivers. driver_finance.driver_settlement_gl_runs is 0 rows, i.e. this poster has never
// run in production, so there is nothing to remediate: this is a pre-operational fix, and the first
// settlement ever posted is the one it protects.
//
// THE CANONICAL LINK IS `mdata.vendors.driver_id`, NOT `mdata.drivers.qbo_vendor_id`. Verified on
// prod: `uq_vendors_driver_active_per_company UNIQUE (operating_company_id, driver_id) WHERE
// driver_id IS NOT NULL AND deactivated_at IS NULL` — a driver has at most ONE active vendor per
// entity, so the resolution below is deterministic and cannot shadow another driver's vendor.
// `mdata.drivers.qbo_vendor_id` is a QBO mirror key (0 populated), retained here only as a secondary
// probe so a QBO-linked-but-not-driver_id-linked vendor still resolves — and it is matched INSIDE
// mdata.vendors, entity-scoped, so it can never reach another entity's vendor either.
//
// FAILS LOUD, NEVER FALLS BACK. A driver with no vendor cannot be paid through A/P: there is no
// payee to age, no 1099/W-8BEN subject, and no vendor for the bill to belong to. Stopping is the
// correct accounting outcome; inventing a vendor id is not.

/** Raised when a driver has no A/P vendor in the driver's own entity. Callers map it to their own
 *  domain error (SettlementBillPaymentError DRIVER_VENDOR_MISSING) — the message is stable so it can
 *  be asserted in tests and matched by the guard. */
export class DriverVendorMissingError extends Error {
  readonly code = "driver_vendor_missing";
  constructor(driverId: string, operatingCompanyId: string) {
    super(
      `driver_vendor_missing: driver ${driverId} has no active A/P vendor in company ${operatingCompanyId} ` +
        `(link one via mdata.vendors.driver_id before posting driver pay)`
    );
    this.name = "DriverVendorMissingError";
  }
}

type QueryClient = {
  query: <R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ) => Promise<{ rows: R[] }>;
};

export type DriverVendorLink = {
  /** mdata.vendors.id — the value to hand `createBill({ vendorId })`. */
  vendorId: string;
  /** mdata.vendors.qbo_vendor_id, for the QBO A/P mirror. Null when the vendor is TMS-native. */
  qboVendorId: string | null;
  vendorName: string | null;
};

/**
 * Resolve the ACTIVE A/P vendor for a driver, scoped to the driver's own entity.
 * Throws {@link DriverVendorMissingError} when there is none. Never returns a driver id.
 */
export async function resolveDriverVendorLink(
  client: QueryClient,
  operatingCompanyId: string,
  driverId: string
): Promise<DriverVendorLink> {
  const res = await client.query<{ id: string; qbo_vendor_id: string | null; vendor_name: string | null }>(
    `SELECT v.id::text AS id, v.qbo_vendor_id, v.vendor_name
       FROM mdata.vendors v
      WHERE v.operating_company_id = $1::uuid
        AND v.deactivated_at IS NULL
        AND (
          -- primary: the driver<->vendor bridge (uq_vendors_driver_active_per_company)
          v.driver_id = $2::uuid
          -- secondary: a QBO-mirrored vendor carrying the driver's qbo_vendor_id, still entity-scoped
          OR (
            v.qbo_vendor_id IS NOT NULL
            AND v.qbo_vendor_id = (
              SELECT d.qbo_vendor_id FROM mdata.drivers d
               WHERE d.id = $2::uuid AND d.operating_company_id = $1::uuid
            )
          )
        )
      -- driver_id link wins over the QBO probe when both somehow match.
      ORDER BY (v.driver_id = $2::uuid) DESC, v.id
      LIMIT 1`,
    [operatingCompanyId, driverId]
  );
  const row = res.rows[0];
  if (!row) throw new DriverVendorMissingError(driverId, operatingCompanyId);
  return { vendorId: row.id, qboVendorId: row.qbo_vendor_id ?? null, vendorName: row.vendor_name ?? null };
}
