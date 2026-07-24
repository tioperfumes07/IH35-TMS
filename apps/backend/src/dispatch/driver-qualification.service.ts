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
// driver must hold the H (HazMat) CDL endorsement — the real boolean is `mdata.drivers.endorsement_h`
// (migration 0301; the 0343 trigger syncs it into `mdata.driver_cdl_endorsements`). NOTE: there is NO
// `mdata.drivers.hazmat_endorsement` column — that boolean lives on `mdata.units` (0295); the driver
// side is `endorsement_h` + expiry `hazmat_endorsement_expires_at`. Blocks with reason
// `hazmat_endorsement_missing` when not held, no expiry on record, or expired. There
// is NO `mdata.loads.hazmat` column — load-level hazmat lives in the `quicksave_pending_fields`
// jsonb, so callers pass the resolved `isHazmat` boolean in.
//
// Fail-closed: a DIRECT client.query (mdata.drivers always exists); any DB error propagates and
// aborts the caller's transaction rather than being swallowed into "qualified".

// SAF-F07: the gate consulted CDL, DOT medical, hazmat endorsement and driver status — and NOTHING
// about drug & alcohol. A driver who tested POSITIVE or REFUSED a test could still be assigned and
// dispatched. Under 49 CFR §382.501 a driver is immediately removed from safety-sensitive functions
// after a positive/refusal and stays prohibited until the return-to-duty process completes; the data
// to enforce that was already being collected and was simply never read by the gate.
//
// TWO tables hold D&A results and BOTH are live-written today — the gate reads both on purpose:
//   • safety.drug_test        (0270) — written by drug-program.routes.ts, which is what the office UI
//                              posts to (POST /api/v1/safety/drug-program/tests). Result is the enum
//                              safety.drug_test_result_enum: negative | positive | refusal |
//                              adulterated | substituted | cancelled. Soft-deletable (voided_at).
//   • safety.da_test_records  (0327) — written by drug-alcohol/program.service.ts (the newer D&A
//                              program module). Result: pending | negative | positive | refused |
//                              cancelled. No voided_at column.
// Reading only one would leave a real hole: a positive recorded through the office UI lands in
// drug_test, so a gate that read only da_test_records would wave that driver straight through.
// Which of the two is canonical is an OPEN owner/canonicalization decision (Linkage Law C2) — until
// it is settled, the safe reading is the union, never a guess.
//
// Per FMCSA, `adulterated` and `substituted` are refusals-to-test, so they disqualify exactly like a
// refusal. `cancelled` is NOT a violation (a cancelled test never happened). `pending` is not a
// violation either — a result that has not come back is not evidence of one.
export type DriverQualificationReason =
  | "driver_deactivated"
  | "driver_archived"
  | "cdl_missing"
  | "cdl_expired"
  | "medical_card_missing"
  | "medical_card_expired"
  | "hazmat_endorsement_missing"
  | "drug_alcohol_positive"
  | "drug_alcohol_refusal";

export type DriverQualificationBlock = {
  driverId: string;
  driverName: string | null;
  reasons: DriverQualificationReason[];
  cdlExpiresAt: string | null;
  medicalExpiryDate: string | null;
  hazmatEndorsementExpiresAt: string | null;
  /** Date of the unresolved D&A violation that prohibits dispatch, when there is one. */
  drugAlcoholViolationAt: string | null;
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
        (d.endorsement_h IS NOT TRUE
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

  // SAF-F07 — unresolved D&A violation check (49 CFR §382.501 removal from safety-sensitive duty).
  //
  // A violation prohibits dispatch until the return-to-duty process clears it. "Cleared" means a
  // return_to_duty test with a NEGATIVE result collected AFTER the violation — not merely the
  // existence of an RTD row, and not a later negative random (a routine negative does not end a
  // prohibition). If the violation and its clearance share a timestamp the driver stays blocked:
  // an ambiguous clearance is not a clearance.
  //
  // Voided drug_test rows are excluded (void-not-delete: a voided test is not evidence).
  // da_test_records has no voided_at column, so nothing to exclude there.
  const daRows = await client.query<{ violation_at: string | null; violation_kind: string | null }>(
    `
      WITH violations AS (
        SELECT dt.test_date::timestamptz AS at,
               CASE WHEN dt.result::text = 'positive' THEN 'positive' ELSE 'refusal' END AS kind
        FROM safety.drug_test dt
        WHERE dt.driver_id = $1::uuid
          AND dt.operating_company_id = $2::uuid
          AND dt.voided_at IS NULL
          AND dt.result::text IN ('positive', 'refusal', 'adulterated', 'substituted')
        UNION ALL
        SELECT COALESCE(dr2.collected_at, dr2.scheduled_at, dr2.created_at) AS at,
               CASE WHEN dr2.result = 'positive' THEN 'positive' ELSE 'refusal' END AS kind
        FROM safety.da_test_records dr2
        WHERE dr2.driver_uuid = $1::uuid
          AND dr2.operating_company_id = $2::uuid
          AND dr2.result IN ('positive', 'refused')
      ),
      clearances AS (
        SELECT dt.test_date::timestamptz AS at
        FROM safety.drug_test dt
        WHERE dt.driver_id = $1::uuid
          AND dt.operating_company_id = $2::uuid
          AND dt.voided_at IS NULL
          AND dt.test_type = 'return_to_duty'
          AND dt.result::text = 'negative'
        UNION ALL
        SELECT COALESCE(dr3.collected_at, dr3.scheduled_at, dr3.created_at) AS at
        FROM safety.da_test_records dr3
        WHERE dr3.driver_uuid = $1::uuid
          AND dr3.operating_company_id = $2::uuid
          AND dr3.test_type = 'return_to_duty'
          AND dr3.result = 'negative'
      )
      SELECT v.at::text AS violation_at, v.kind AS violation_kind
      FROM violations v
      WHERE NOT EXISTS (SELECT 1 FROM clearances c WHERE c.at > v.at)
      ORDER BY v.at DESC NULLS LAST
      LIMIT 1
    `,
    [driverId, operatingCompanyId]
  );
  const daBlock = daRows.rows[0] ?? null;

  const reasons: DriverQualificationReason[] = [];
  if (dr.is_deactivated) reasons.push("driver_deactivated");
  if (dr.is_archived) reasons.push("driver_archived");
  if (dr.cdl_missing) reasons.push("cdl_missing");
  else if (dr.cdl_expired) reasons.push("cdl_expired");
  if (dr.med_missing) reasons.push("medical_card_missing");
  else if (dr.med_expired) reasons.push("medical_card_expired");
  if (isHazmat && dr.hazmat_blocked) reasons.push("hazmat_endorsement_missing");
  if (daBlock) {
    reasons.push(daBlock.violation_kind === "positive" ? "drug_alcohol_positive" : "drug_alcohol_refusal");
  }

  if (reasons.length === 0) return null;

  return {
    driverId: dr.id,
    driverName: dr.driver_name,
    reasons,
    cdlExpiresAt: dr.cdl_expires_at,
    medicalExpiryDate: dr.med_expiry_date,
    hazmatEndorsementExpiresAt: dr.hazmat_endorsement_expires_at,
    drugAlcoholViolationAt: daBlock?.violation_at ?? null,
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
