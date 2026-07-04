import type { PoolClient } from "pg";

// SHARED DRIVER-QUALIFICATION GATE (G9-C1 + D3-1).
//
// G9-C1: the Book Load path already enforced a DOT hard-stop gate (deactivated / archived
// driver, missing-or-expired CDL, missing-or-expired DOT medical card). Its sibling assignment
// paths — quick-assign, quicksave, and the planner reschedule — checked only unit-block / HOS /
// drug, so a terminated or expired-CDL driver could still be assigned to a load. This module
// extracts Book Load's exact per-driver credential logic into ONE function every path calls, so
// the qualification rules can never drift between entry points again.
//
// D3-1: the same gate now also enforces the hazmat H-endorsement. When the load is hazmat, the
// driver must hold a live `mdata.drivers.hazmat_endorsement = true` with a non-expired
// `hazmat_endorsement_expires_at`, else it blocks with reason `hazmat_endorsement_missing`. There
// is NO `mdata.loads.hazmat` column — load-level hazmat lives in the `quicksave_pending_fields`
// jsonb, so callers pass the resolved `isHazmat` boolean in.
//
// Fail-closed: a DIRECT client.query (mdata.drivers always exists); any DB error propagates and
// aborts the caller's transaction rather than being swallowed into "qualified".

export type DriverQualificationReason =
  | "driver_deactivated"
  | "driver_archived"
  | "cdl_missing"
  | "cdl_expired"
  | "medical_card_missing"
  | "medical_card_expired"
  | "hazmat_endorsement_missing";

export type DriverQualificationBlock = {
  driverId: string;
  driverName: string | null;
  reasons: DriverQualificationReason[];
  cdlExpiresAt: string | null;
  medicalExpiryDate: string | null;
  hazmatEndorsementExpiresAt: string | null;
};

/**
 * Evaluate one driver's DOT dispatch qualification for a load.
 *
 * Returns `null` when the driver is fully qualified (or is not found in this operating company —
 * callers own their own not-found handling). Returns a `DriverQualificationBlock` describing the
 * `E_DRIVER_NOT_QUALIFIED` reasons when the driver must be blocked.
 *
 * `app.operating_company_id` must already be set by the caller (RLS scoping).
 */
export async function assertDriverQualifiedForLoad(
  client: PoolClient,
  args: { driverId: string; operatingCompanyId: string; isHazmat: boolean }
): Promise<DriverQualificationBlock | null> {
  const { driverId, operatingCompanyId, isHazmat } = args;

  const credRows = await client.query<{
    id: string;
    driver_name: string | null;
    is_deactivated: boolean;
    is_archived: boolean;
    cdl_missing: boolean;
    cdl_expired: boolean;
    cdl_expires_at: string | null;
    med_missing: boolean;
    med_expired: boolean;
    med_expiry_date: string | null;
    hazmat_blocked: boolean;
    hazmat_endorsement_expires_at: string | null;
  }>(
    `
      SELECT
        d.id::text AS id,
        CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
        (d.deactivated_at IS NOT NULL) AS is_deactivated,
        (d.archived_at IS NOT NULL) AS is_archived,
        (d.cdl_expires_at IS NULL) AS cdl_missing,
        (d.cdl_expires_at IS NOT NULL AND d.cdl_expires_at < CURRENT_DATE) AS cdl_expired,
        d.cdl_expires_at::text AS cdl_expires_at,
        (COALESCE(mc.expiry_date, d.dot_medical_expires_at) IS NULL) AS med_missing,
        (COALESCE(mc.expiry_date, d.dot_medical_expires_at) IS NOT NULL
          AND COALESCE(mc.expiry_date, d.dot_medical_expires_at) < CURRENT_DATE) AS med_expired,
        COALESCE(mc.expiry_date, d.dot_medical_expires_at)::text AS med_expiry_date,
        -- D3-1 hazmat H-endorsement: blocked when not held, no expiry on record, or expired.
        (d.hazmat_endorsement IS NOT TRUE
          OR d.hazmat_endorsement_expires_at IS NULL
          OR d.hazmat_endorsement_expires_at < CURRENT_DATE) AS hazmat_blocked,
        d.hazmat_endorsement_expires_at::text AS hazmat_endorsement_expires_at
      FROM mdata.drivers d
      LEFT JOIN LATERAL (
        SELECT expiry_date
        FROM safety.medical_cards
        WHERE driver_id = d.id
          AND operating_company_id = $2::uuid
          AND voided_at IS NULL
        ORDER BY expiry_date DESC
        LIMIT 1
      ) mc ON true
      WHERE d.id = $1::uuid
        AND d.operating_company_id = $2::uuid
    `,
    [driverId, operatingCompanyId]
  );

  const dr = credRows.rows[0];
  if (!dr) return null;

  const reasons: DriverQualificationReason[] = [];
  if (dr.is_deactivated) reasons.push("driver_deactivated");
  if (dr.is_archived) reasons.push("driver_archived");
  if (dr.cdl_missing) reasons.push("cdl_missing");
  else if (dr.cdl_expired) reasons.push("cdl_expired");
  if (dr.med_missing) reasons.push("medical_card_missing");
  else if (dr.med_expired) reasons.push("medical_card_expired");
  if (isHazmat && dr.hazmat_blocked) reasons.push("hazmat_endorsement_missing");

  if (reasons.length === 0) return null;

  return {
    driverId: dr.id,
    driverName: dr.driver_name,
    reasons,
    cdlExpiresAt: dr.cdl_expires_at,
    medicalExpiryDate: dr.med_expiry_date,
    hazmatEndorsementExpiresAt: dr.hazmat_endorsement_expires_at,
  };
}

/**
 * Error thrown by paths whose contract is throw-based (quick-assign / quicksave). Carries the full
 * qualification block so the route layer can render the `E_DRIVER_NOT_QUALIFIED` 422 payload.
 */
export class DriverNotQualifiedError extends Error {
  readonly code = "E_DRIVER_NOT_QUALIFIED";
  readonly block: DriverQualificationBlock;
  constructor(block: DriverQualificationBlock) {
    super(
      `Driver ${block.driverName ?? block.driverId} cannot be dispatched: ${block.reasons.join(", ")}.`
    );
    this.name = "DriverNotQualifiedError";
    this.block = block;
  }
}
