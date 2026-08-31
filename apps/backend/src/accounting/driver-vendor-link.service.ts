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

import { appendCrudAudit } from "../audit/crud-audit.js";
import { looksLikeSampleDataName } from "../mdata/sample-data-name-detection.js";

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

/**
 * ACCT-F164 — resolve the driver's A/P vendor, CREATING it when absent.
 *
 * WHY THIS EXISTS. ACCT-F159 made the settlement posters fail loud when a driver has no A/P vendor,
 * which is correct — you cannot book A/P to a payee that does not exist. But nothing in the system
 * ever CREATES a driver's vendor. Verified by sweeping every `INSERT INTO mdata.vendors` in the
 * backend at the time: the writers were the CSV seed importer, the manual vendors route, and the QBO
 * vendors puller/reconciler — this function itself is a fourth (corrected 2026-08-31, G1 fix below;
 * the claim of only three writers had gone stale the moment this function started creating vendors).
 *
 * That is survivable for TRANSP, whose vendors arrive from QuickBooks. It is NOT survivable for
 * USMCA, which by locked decision §8.5 has NO QuickBooks — so the automatic path can never run for
 * it, and every driver's vendor would have to be hand-created or that driver silently cannot be paid.
 * Measured on prod 2026-08-07, with USMCA going live 2026-08-10: USMCA has 86 drivers, 3 active, and
 * exactly ONE with an A/P vendor.
 *
 * A driver is financially complete when it has three primitives: an escrow sub-account, a cash-advance
 * sub-account, and an A/P VENDOR to be paid through. The first two are already provisioned by
 * driver-subaccount-provision.service.ts. This is the missing third.
 *
 * SAFE TO CREATE, and deliberately narrow about it:
 *   • entity-scoped — the row is written with the DRIVER'S OWN operating_company_id, so it can never
 *     land in another entity (the exact leak class being drained);
 *   • `qbo_vendor_id` is left NULL — this is a TMS-native vendor, and for USMCA there is no QBO to
 *     map to. Owner directive 2026-08-07: "Account missing? CREATE it — additive, entity-scoped,
 *     sensible default, QBO-map null. Owner edits later. Never block a wire or test on naming."
 *   • `vendor_type` = 'Other' — the CHECK constraint allows Fuel/Repair/Tires/Towing/Insurance/
 *     Permit/Toll/Other, and a driver is none of the specific ones;
 *   • idempotent — a NOT EXISTS guard, backstopped by the partial unique index
 *     `uq_vendors_driver_active_per_company (operating_company_id, driver_id)
 *      WHERE driver_id IS NOT NULL AND deactivated_at IS NULL`.
 *
 * It does NOT auto-create from inside a posting path. The settlement poster keeps calling
 * resolveDriverVendorLink and keeps failing loud: minting a vendor as a side effect of posting money
 * would hide a provisioning gap inside a financial transaction. Provisioning is its own step.
 *
 * AUDITED, and `actorUserId` is REQUIRED rather than optional. This mints the payee that A/P is
 * booked against, so an unaudited create means a driver can be paid through a vendor with no record
 * of who brought it into existence — in a repo where `LV-AUDIT-TRAIL-HAS-NO-ACTOR` is already an open
 * P0 about exactly that gap. `verify-audit-emit-coverage` caught this file on the first CI run and it
 * was right to; the fix is the emit, never the allowlist. The event class is `mdata.vendors.created`,
 * identical to the manual vendors route, so both writers land in one queryable stream instead of two
 * shapes a reader has to know about. An OPTIONAL actor would leave the same hole open for the next
 * caller, silently, which is how this arrived.
 */
export async function ensureDriverApVendor(
  client: QueryClient,
  operatingCompanyId: string,
  driverId: string,
  driverName: string,
  actorUserId: string
): Promise<{ action: "created" | "exists"; vendorId: string }> {
  const existing = await client.query<{ id: string }>(
    `SELECT v.id::text AS id
       FROM mdata.vendors v
      WHERE v.operating_company_id = $1::uuid
        AND v.driver_id = $2::uuid
        AND v.deactivated_at IS NULL
      LIMIT 1`,
    [operatingCompanyId, driverId]
  );
  if (existing.rows[0]) return { action: "exists", vendorId: existing.rows[0].id };

  const name = driverName.trim();
  if (!name) {
    // A vendor with no name is not a payee. Refuse rather than create "  " and call it provisioned.
    throw new Error(`driver_vendor_name_missing: driver ${driverId} has no name to create an A/P vendor from`);
  }

  // G1 (GO-CLOSE-188 owner reply, 2026-08-30): "the TEST label must actually set is_sample_data."
  // vendors.routes.ts's CREATE path derives it from the name; this fourth writer (found live —
  // this file's own docblock above claimed only three writers exist, and was wrong) did not. A
  // TEST-named driver auto-provisioned through this path minted an untagged vendor, feeding the
  // same real-trial-balance sample-debit leak INV-7 already tracks. Same shared word-boundary
  // helper as the other writers, so this can never drift from their pattern independently.
  const isSampleData = looksLikeSampleDataName(name) || null;

  const created = await client.query<{ id: string }>(
    `INSERT INTO mdata.vendors (operating_company_id, vendor_name, vendor_type, driver_id, qbo_vendor_id, is_sample_data)
     VALUES ($1::uuid, $2::text, 'Other', $3::uuid, NULL, $4)
     RETURNING id::text AS id`,
    [operatingCompanyId, name, driverId, isSampleData]
  );
  const vendorId = created.rows[0]!.id;
  // Same client, same transaction as the INSERT — the vendor and the record of who created it commit
  // or roll back together. A separate connection could leave a vendor with no audit row.
  await appendCrudAudit(client, actorUserId, "mdata.vendors.created", {
    resource_id: vendorId,
    resource_type: "mdata.vendors",
    id: vendorId,
    name,
    vendor_type: "Other",
    operating_company_id: operatingCompanyId,
    // The provenance that distinguishes this from a hand-created vendor: it exists because a driver
    // needed a payee, and it is TMS-native (no QBO counterpart to map to).
    driver_id: driverId,
    created_by: "ensureDriverApVendor",
    qbo_vendor_id: null,
  });
  return { action: "created", vendorId };
}
