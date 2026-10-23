
import { appendCrudAudit } from "../audit/crud-audit.js";

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
// COMP-01 (2026-07-26): THREE tables hold D&A results and ALL THREE are live-written today by a
// registered, authenticated route — the gate reads all three on purpose. Verified against the Neon
// PROD branch br-fancy-credit-akjnd07a this session (pg_class + information_schema + pg_policies):
//   • safety.drug_test                     (0270) — written by safety/drug-program.routes.ts, which is
//                              what the office UI posts to (POST /api/v1/safety/drug-program/tests).
//                              Result is the enum safety.drug_test_result_enum: negative | positive |
//                              refusal | adulterated | substituted | cancelled. Soft-deletable
//                              (voided_at).
//   • safety.da_test_records               (0327) — written by safety/drug-alcohol/program.service.ts
//                              (the newer D&A program module). Result is a text CHECK: pending |
//                              negative | positive | refused | cancelled. No voided_at column.
//   • compliance.drug_alcohol_test_results (0380) — written by compliance/drug-alcohol-results.ts via
//                              POST /api/v1/compliance/drug-alcohol/results (registered through
//                              compliance/form-425c.routes.ts → index.ts). On PROD its result column is
//                              the ENUM compliance.drug_alcohol_test_result_enum: negative | positive |
//                              refusal | dilute — note prod DRIFTED from migration 0380, which declared
//                              it a text CHECK; prod wins. It has NO voided_at column, so there is
//                              nothing to exclude. This was the COMP-01 hole: a Part 382 positive
//                              recorded through the compliance D&A module (which also auto-opens a
//                              compliance.return_to_duty_processes row, so the system KNEW the driver was
//                              prohibited) was invisible to every dispatch entry point.
// Reading a subset leaves a real hole: each of the three has its own live write path and its own UI,
// so a positive recorded through any one of them must ground the driver. Which is canonical is an OPEN
// owner/canonicalization decision (Linkage Law C2) — until it is settled, the safe reading is the
// UNION of all live-written sources, never a guess and never a favourite.
//
// Per FMCSA, `adulterated` and `substituted` are refusals-to-test, so they disqualify exactly like a
// refusal. `cancelled` is NOT a violation (a cancelled test never happened). `pending` is not a
// violation either — a result that has not come back is not evidence of one. `dilute` (compliance
// table only) is NOT a violation either: under 49 CFR §40.197 a dilute negative is a negative that may
// require a recollection; only the refusal that can follow it is a violation, and that is recorded as
// `refusal`.
export type DriverQualificationReason =
  | "driver_deactivated"
  | "driver_archived"
  // LV-INACTIVE-DRIVER-ASSIGNED-AND-DELIVERED-REVENUE-LOAD (2026-08-16) — `deactivated_at`/
  // `archived_at` are markers on the DEACTIVATE/ARCHIVE write paths, but `mdata.drivers.status`
  // can independently read 'Inactive' (or 'Terminated') with BOTH markers still NULL — confirmed
  // live on prod (driver 88c04cf5…, status='Inactive', deactivated_at/archived_at/termination_date
  // all NULL, still assigned + delivered a revenue load). The one-directional CHECK constraint
  // (202606161300) only enforces "deactivated_at set -> status is Inactive/Terminated", never the
  // reverse, so a driver can legitimately reach that state without either marker. Read `status`
  // directly here too — defense-in-depth on the read side rather than chasing every writer that
  // might set status without a marker.
  | "driver_status_inactive"
  | "cdl_missing"
  | "cdl_expired"
  | "medical_card_missing"
  | "medical_card_expired"
  | "hazmat_endorsement_missing"
  | "drug_alcohol_positive"
  | "drug_alcohol_refusal"
  // SAF-F07-CH: FMCSA Clearinghouse prohibition (49 CFR §382.701). This is the ONLY source for a
  // violation reported by a PREVIOUS employer — such a violation never appears in our own
  // safety.drug_test / safety.da_test_records at all, so without this the gate is blind to it.
  | "clearinghouse_prohibited"
  // HOS-1: hours-of-service violation (49 CFR §395). Added 2026-07-27 because HOS enforcement had
  // DRIFTED ACROSS PATHS — the exact failure G9-C1 created this gate to end, repeated for HOS:
  //   book-load        -> hard 422 + audit + logged override   (correct)
  //   quick-assign     -> throws, BUT its HOS query ended in `.catch(() => ({ rows: [] }))`, so a
  //                       failed query returned "no violation" and the driver was assigned — fail-OPEN
  //                       on a federal safety rule
  //   planner reschedule -> NO HOS check at all
  //   loads-bulk         -> NO HOS check at all
  // Live at the time of writing: 484,004 rows in hos.duty_status_events across 76 drivers, 165 rows in
  // views.drivers_with_hos_status, and 7 drivers flagged in violation. Two of four assignment paths
  // would have dispatched any of those 7 without objection.
  | "hos_violation"
  // LEAD 443.192: a merged-away driver record (merged_into_driver_id set). Thrown as DriverMergedError, never overridable.
  | "driver_merged";

export type DriverQualificationBlock = {
  driverId: string;
  driverName: string | null;
  reasons: DriverQualificationReason[];
  cdlExpiresAt: string | null;
  medicalExpiryDate: string | null;
  hazmatEndorsementExpiresAt: string | null;
  /** Date of the unresolved D&A violation that prohibits dispatch, when there is one. */
  drugAlcoholViolationAt: string | null;
  /**
   * COMP-01: which of the three live D&A result tables the unresolved violation came from. Audit
   * trail only — the gate blocks identically whichever source it is. A DOT reviewer asking "where is
   * the record that grounded this driver?" gets a straight answer instead of a table hunt.
   */
  drugAlcoholViolationSource: string | null;
  /** Date of the unresolved Clearinghouse "information found" result, when there is one. */
  clearinghouseProhibitedSince: string | null;
  /**
   * HOS-1: minutes until the driver's next HOS violation, from views.drivers_with_hos_status. NULL
   * when the driver has no duty data at all — which is "unknown", not "clear". Audit/UI detail only;
   * the block itself is driven by is_in_violation.
   */
  hosMinutesUntilViolation: string | null;
};

/** One unresolved D&A violation, from whichever of the three live sources recorded it. */
export type DrugAlcoholViolation = {
  violation_at: string | null;
  violation_kind: "positive" | "refusal";
  violation_source: string;
};

/**
 * COMP-01 — the ONE unified read of driver drug & alcohol prohibition status.
 *
 * Every surface that answers "is this driver prohibited?" MUST call this, so the answer cannot differ
 * between the dispatch gate and the screens that display it. Before COMP-01 there were four separate
 * readers over overlapping subsets of the same data: this gate (2 of 3 tables), the dispatch
 * driver-eligibility endpoint (1 table + Clearinghouse), and the safety drug-status endpoint (1 table,
 * latest row only). A driver could read "eligible" on the screen a dispatcher was looking at while a
 * positive sat in a table that screen did not consult.
 *
 * Returns the NEWEST violation that no later return-to-duty negative has cleared, or null.
 *
 * `app.operating_company_id` must already be set by the caller (RLS scoping); the predicate is also
 * written explicitly so the query is correct even if the GUC is ever lost.
 */
export async function fetchUnresolvedDrugAlcoholViolation(
  client: QueryableClient,
  args: { driverId: string; operatingCompanyId: string }
): Promise<DrugAlcoholViolation | null> {
  const res = await client.query<{
    violation_at: string | null;
    violation_kind: string | null;
    violation_source: string | null;
  }>(
    `
      WITH violations AS (
        SELECT dt.test_date::timestamptz AS at,
               CASE WHEN dt.result::text = 'positive' THEN 'positive' ELSE 'refusal' END AS kind,
               'safety.drug_test' AS source
        FROM safety.drug_test dt
        WHERE dt.driver_id = $1::uuid
          AND dt.operating_company_id = $2::uuid
          AND dt.voided_at IS NULL
          AND dt.result::text IN ('positive', 'refusal', 'adulterated', 'substituted')
        UNION ALL
        SELECT COALESCE(dr2.collected_at, dr2.scheduled_at, dr2.created_at) AS at,
               CASE WHEN dr2.result = 'positive' THEN 'positive' ELSE 'refusal' END AS kind,
               'safety.da_test_records' AS source
        FROM safety.da_test_records dr2
        WHERE dr2.driver_uuid = $1::uuid
          -- COMP-01-B: ::text, NOT ::uuid. On PROD safety.da_test_records.operating_company_id is
          -- TEXT (pg_attribute, verified 2026-07-26) while every sibling table's is uuid. Postgres
          -- has no text = uuid operator, so a ::uuid cast here threw
          -- "operator does not exist: text = uuid" AT PLAN TIME — on every driver, with or without
          -- rows. Because this gate is deliberately fail-loud, that error aborted the caller's
          -- transaction, so the ENTIRE D&A + Clearinghouse gate never returned a verdict at all.
          AND dr2.operating_company_id::text = $2::uuid::text
          AND dr2.result IN ('positive', 'refused')
        UNION ALL
        -- COMP-01: the third live source. A dilute result is deliberately absent here (49 CFR
        -- §40.197 - a dilute negative is a negative), on the same principle as the non-violation
        -- results excluded from the two arms above. See the file header for the full reasoning.
        SELECT ctr.test_date::timestamptz AS at,
               CASE WHEN ctr.result::text = 'positive' THEN 'positive' ELSE 'refusal' END AS kind,
               'compliance.drug_alcohol_test_results' AS source
        FROM compliance.drug_alcohol_test_results ctr
        WHERE ctr.driver_id = $1::uuid
          AND ctr.operating_company_id = $2::uuid
          AND ctr.result::text IN ('positive', 'refusal')
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
          -- COMP-01-B: ::text — see the violations arm above. Same PROD column-type reality.
          AND dr3.operating_company_id::text = $2::uuid::text
          AND dr3.test_type = 'return_to_duty'
          AND dr3.result = 'negative'
        UNION ALL
        -- COMP-01: the compliance table marks the RTD test on test_reason, NOT on test_type
        -- (its test_type is drug|alcohol|combined). Using the wrong column would make this arm
        -- match nothing and quietly strand a driver who HAS completed return-to-duty.
        SELECT ctr2.test_date::timestamptz AS at
        FROM compliance.drug_alcohol_test_results ctr2
        WHERE ctr2.driver_id = $1::uuid
          AND ctr2.operating_company_id = $2::uuid
          AND ctr2.test_reason::text = 'return_to_duty'
          AND ctr2.result::text = 'negative'
      )
      SELECT v.at::text AS violation_at, v.kind AS violation_kind, v.source AS violation_source
      FROM violations v
      WHERE NOT EXISTS (SELECT 1 FROM clearances c WHERE c.at > v.at)
      ORDER BY v.at DESC NULLS LAST
      LIMIT 1
    `,
    [args.driverId, args.operatingCompanyId]
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    violation_at: row.violation_at,
    violation_kind: row.violation_kind === "positive" ? "positive" : "refusal",
    violation_source: row.violation_source ?? "unknown",
  };
}

/**
 * COMP-01 — the ONE unified read of FMCSA Clearinghouse prohibition (49 CFR §382.701).
 *
 * Returns the `queried_at` of the unresolved `record_found` result, or null when not prohibited.
 */
export async function fetchClearinghouseProhibition(
  client: QueryableClient,
  args: { driverId: string; operatingCompanyId: string }
): Promise<{ prohibited_since: string | null } | null> {
  const res = await client.query<{ prohibited_since: string | null }>(
    `
      WITH found AS (
        SELECT queried_at
        FROM safety.clearinghouse_query
        WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid
          AND voided_at IS NULL AND query_status = 'record_found'
        ORDER BY queried_at DESC
        LIMIT 1
      ),
      cleared AS (
        SELECT queried_at
        FROM safety.clearinghouse_query
        WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid
          AND voided_at IS NULL AND query_status = 'clear'
        ORDER BY queried_at DESC
        LIMIT 1
      )
      SELECT (SELECT queried_at FROM found)::text AS prohibited_since
      WHERE (SELECT queried_at FROM found) IS NOT NULL
        AND ((SELECT queried_at FROM cleared) IS NULL
             OR (SELECT queried_at FROM cleared) <= (SELECT queried_at FROM found))
    `,
    [args.driverId, args.operatingCompanyId]
  );
  return res.rows[0] ?? null;
}

/** The unified prohibition verdict shared by the dispatch gate and every status screen. */
export type DriverDrugAlcoholStatus = {
  is_blocked: boolean;
  block_reason: string | null;
  violation: DrugAlcoholViolation | null;
  clearinghouse_prohibited_since: string | null;
};

/**
 * COMP-01 — evaluate a driver's full D&A + Clearinghouse prohibition in ONE call.
 *
 * This is what the display endpoints call so that what a dispatcher SEES and what the gate ENFORCES
 * are computed from the same rows by the same code.
 */
export async function evaluateDriverDrugAlcoholStatus(
  client: QueryableClient,
  args: { driverId: string; operatingCompanyId: string }
): Promise<DriverDrugAlcoholStatus> {
  const violation = await fetchUnresolvedDrugAlcoholViolation(client, args);
  const clearinghouse = await fetchClearinghouseProhibition(client, args);
  const blockReason = violation
    ? `drug_alcohol_${violation.violation_kind}`
    : clearinghouse
      ? "clearinghouse_record_found"
      : null;
  return {
    is_blocked: violation !== null || clearinghouse !== null,
    block_reason: blockReason,
    violation,
    clearinghouse_prohibited_since: clearinghouse?.prohibited_since ?? null,
  };
}

/**
 * Evaluate one driver's DOT dispatch qualification for a load.
 *
 * Returns `null` when the driver is fully qualified (or is not found in this operating company —
 * callers own their own not-found handling). Returns a `DriverQualificationBlock` describing the
 * `E_DRIVER_NOT_QUALIFIED` reasons when the driver must be blocked.
 *
 * `app.operating_company_id` must already be set by the caller (RLS scoping).
 */
type QueryableClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

/**
 * LEAD 443.204 (owner 2026-10-21 15:27 CT: "for the current drivers, it cannot block, we do have the files in person"):
 * the reasons a paper DQ file answers. For a driver with mdata.drivers.dq_file_on_paper_since (stamped by migration
 * 202616040700 on every driver that existed then) these are RECORDED (dispatch.driver_dq_file_on_paper), never blocking.
 * A recorded violation — deactivated / archived / inactive, drug & alcohol, Clearinghouse — is not a paper-file gap and
 * still blocks. A driver created after the migration has no stamp: the full gate applies.
 */
export const DQ_PAPER_FILE_WAIVABLE: ReadonlySet<DriverQualificationReason> = new Set<DriverQualificationReason>([
  "cdl_missing",
  "cdl_expired",
  "medical_card_missing",
  "medical_card_expired",
  "hazmat_endorsement_missing",
  "hos_violation",
]);

/** Pure: split a gate's reasons for a driver whose DQ file is held on paper. */
export function splitPaperFileReasons(
  reasons: DriverQualificationReason[],
  dqFileOnPaperSince: string | null
): { blocking: DriverQualificationReason[]; waived: DriverQualificationReason[] } {
  if (!dqFileOnPaperSince) return { blocking: reasons, waived: [] };
  return {
    blocking: reasons.filter((r) => !DQ_PAPER_FILE_WAIVABLE.has(r)),
    waived: reasons.filter((r) => DQ_PAPER_FILE_WAIVABLE.has(r)),
  };
}

/** LEAD 443.204 — the driver's paper-DQ-file stamp (NULL = full gate). Fail-closed: a direct query. */
export async function driverDqFileOnPaperSince(client: QueryableClient, driverId: string): Promise<string | null> {
  const r = await client.query<{ since: string | null }>(
    `SELECT dq_file_on_paper_since::text AS since FROM mdata.drivers WHERE id = $1::uuid`,
    [driverId]
  );
  return r.rows[0]?.since ?? null;
}

/** LEAD 443.204 — the record a waived paper-file reason leaves (never silent). */
export async function recordDqFileOnPaper(
  client: QueryableClient,
  args: { actorUserId: string; operatingCompanyId: string; driverId: string; driverName: string | null; waived: DriverQualificationReason[]; dqFileOnPaperSince: string; loadId?: string | null; loadNumber?: string | null; via: string }
): Promise<void> {
  await appendCrudAudit(
    client as never,
    args.actorUserId,
    "dispatch.driver_dq_file_on_paper",
    {
      operating_company_id: args.operatingCompanyId,
      load_id: args.loadId ?? null,
      load_number: args.loadNumber ?? null,
      via: args.via,
      driver_id: args.driverId,
      driver_name: args.driverName,
      waived_reasons: args.waived,
      dq_file_on_paper_since: args.dqFileOnPaperSince,
      note: "DQ file held on paper (owner 10-21)",
    },
    "warning",
    "LEAD-443.204"
  );
}

export async function assertDriverQualifiedForLoad(
  client: QueryableClient,
  args: {
    driverId: string;
    operatingCompanyId: string;
    isHazmat: boolean;
    /** LEAD 443.204: who is assigning — the paper-file record is written with this actor. */
    actorUserId?: string | null;
    loadId?: string | null;
    loadNumber?: string | null;
    via?: string;
  }
): Promise<DriverQualificationBlock | null> {
  const { driverId, operatingCompanyId, isHazmat } = args;

  const credRows = await client.query<{
    id: string;
    driver_name: string | null;
    is_deactivated: boolean;
    is_archived: boolean;
    is_status_inactive: boolean;
    cdl_missing: boolean;
    cdl_expired: boolean;
    cdl_expires_at: string | null;
    med_missing: boolean;
    med_expired: boolean;
    med_expiry_date: string | null;
    hazmat_blocked: boolean;
    hazmat_endorsement_expires_at: string | null;
    merged_into: string | null;
    merged_into_name: string | null;
    dq_file_on_paper_since: string | null;
  }>(
    `
      SELECT
        d.id::text AS id,
        CONCAT_WS(' ', d.first_name, d.last_name) AS driver_name,
        -- 443.192: a merged-away record (driver-merge engine / Samsara "Same person") is not a person — see below.
        d.merged_into_driver_id::text AS merged_into,
        (SELECT CONCAT_WS(' ', s.first_name, s.last_name) FROM mdata.drivers s WHERE s.id = d.merged_into_driver_id AND s.operating_company_id = d.operating_company_id) AS merged_into_name,
        (d.deactivated_at IS NOT NULL) AS is_deactivated,
        (d.archived_at IS NOT NULL) AS is_archived,
        -- LV-INACTIVE-DRIVER-ASSIGNED-AND-DELIVERED-REVENUE-LOAD: status can independently say
        -- Inactive/Terminated with both markers NULL; block on status directly too.
        (d.status IN ('Inactive', 'Terminated')) AS is_status_inactive,
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
        d.hazmat_endorsement_expires_at::text AS hazmat_endorsement_expires_at,
        d.dq_file_on_paper_since::text AS dq_file_on_paper_since
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
        AND (
          d.operating_company_id = $2::uuid
          OR EXISTS (
            SELECT 1
            FROM mdata.driver_company_authorizations qualification_gate_driver_dca
            WHERE qualification_gate_driver_dca.driver_id = d.id
              AND qualification_gate_driver_dca.company_id = $2::uuid
              AND qualification_gate_driver_dca.is_authorized = true
              AND qualification_gate_driver_dca.deactivated_at IS NULL
          )
        )
    `,
    [driverId, operatingCompanyId]
  );

  const dr = credRows.rows[0];
  if (!dr) return null;

  // LEAD 443.192 — a driver record merged into another (mdata.drivers.merged_into_driver_id) is the SAME person under a
  // superseded identity; the merge engine's contract is that zero references to it remain. Measured on prod: loads 13656
  // and 13680 were booked 2026-10-16 on merged record 5363ee51 (merged into 61727a46) through an Owner credential override
  // ("driver_status_inactive, cdl_missing, medical_card_missing"); the pay writer then looked up the merged record's
  // rate card (it has none — the survivor's 45c card governs both pickup dates) and minted two $0.00, rate-NULL driver
  // bills. This is identity, not a credential: no Owner override and no historical_backfill exception can make a
  // merged record the driver of a load. THROWN (never a returned block), so no caller's override path can pass it.
  if (dr.merged_into) throw new DriverMergedError(dr.id, dr.driver_name, dr.merged_into, dr.merged_into_name);

  // SAF-F07 — unresolved D&A violation check (49 CFR §382.501 removal from safety-sensitive duty).
  //
  // A violation prohibits dispatch until the return-to-duty process clears it. "Cleared" means a
  // return_to_duty test with a NEGATIVE result collected AFTER the violation — not merely the
  // existence of an RTD row, and not a later negative random (a routine negative does not end a
  // prohibition). If the violation and its clearance share a timestamp the driver stays blocked:
  // an ambiguous clearance is not a clearance.
  //
  // Voided drug_test rows are excluded (void-not-delete: a voided test is not evidence).
  // da_test_records and compliance.drug_alcohol_test_results have no voided_at column (verified on
  // prod), so there is nothing to exclude there.
  //
  // COMP-01: the union over all three live sources now lives in fetchUnresolvedDrugAlcoholViolation
  // so the gate and the status screens cannot drift apart again.
  const daBlock = await fetchUnresolvedDrugAlcoholViolation(client, { driverId, operatingCompanyId });

  // SAF-F07-CH — FMCSA Clearinghouse prohibition (49 CFR §382.701).
  //
  // The Clearinghouse is the ONLY source for a violation reported by a PREVIOUS employer — such a
  // violation never appears in safety.drug_test or safety.da_test_records at all, so without this
  // the gate stays blind to it no matter how complete our own testing record is.
  //
  // Reads the EXISTING safety.clearinghouse_query (migration 0270, live on prod, RLS-scoped) — NOT a
  // new table. dispatch/loads.routes.ts already returns `latest_clearinghouse_query` on its
  // driver-eligibility payload and then computes `is_blocked` from the drug test ALONE, so the
  // Clearinghouse answer was already being fetched and ignored. Status enum
  // safety.clearinghouse_query_status_enum: clear | record_found | pending | error.
  //
  // Same unresolved-event shape as the D&A check above, deliberately: `record_found` prohibits until
  // a STRICTLY LATER `clear` resolves it. An equal timestamp does not clear — an ambiguous clearance
  // is not a clearance.
  //
  // `pending` and `error` are NOT prohibitions: a query that has not returned, or that failed, is not
  // evidence of a violation. Voided rows are excluded (void-not-delete: a voided query is not
  // evidence). Fail-closed: a direct query, no to_regclass fallback — the table has existed since
  // 0270, and a guarded fallback would silently skip a federal prohibition check.
  const chBlock = await fetchClearinghouseProhibition(client, { driverId, operatingCompanyId });

  // HOS-1 (49 CFR §395). FAIL-CLOSED by the same contract as the D&A and Clearinghouse checks above:
  // a DIRECT query with no .catch() swallow and no to_regclass fallback. views.drivers_with_hos_status
  // is the same source book-load already trusts. If this query fails the error PROPAGATES and aborts
  // the caller's transaction — it is never downgraded to "no violation". A safety gate that fails open
  // is worse than no gate, because it produces a record showing the check was performed.
  const hosRows = await client.query<{ is_in_violation: boolean | null; minutes_until_violation: string | null }>(
    `
      SELECT is_in_violation, minutes_until_violation
      FROM views.drivers_with_hos_status
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [driverId, operatingCompanyId]
  );
  // A driver with NO row in the view has no duty data — that is "unknown", not "clear". It is not a
  // violation on its own, so it does not block; the HOS module owns surfacing unknown-duty drivers.
  const hosInViolation = hosRows.rows[0]?.is_in_violation === true;

  const reasons: DriverQualificationReason[] = [];
  if (dr.is_deactivated) reasons.push("driver_deactivated");
  if (dr.is_archived) reasons.push("driver_archived");
  if (dr.is_status_inactive) reasons.push("driver_status_inactive");
  // ROUND 443.257 — missing CDL / medical dates are pre-dispatch reminders only (never book blockers).
  // Expired credentials still block.
  if (!dr.cdl_missing && dr.cdl_expired) reasons.push("cdl_expired");
  if (!dr.med_missing && dr.med_expired) reasons.push("medical_card_expired");
  if (isHazmat && dr.hazmat_blocked) reasons.push("hazmat_endorsement_missing");
  if (daBlock) {
    reasons.push(daBlock.violation_kind === "positive" ? "drug_alcohol_positive" : "drug_alcohol_refusal");
  }
  if (chBlock) reasons.push("clearinghouse_prohibited");
  if (hosInViolation) reasons.push("hos_violation");

  // LEAD 443.204 — a current driver's paper DQ file answers the paperwork reasons: recorded, never blocking.
  const { blocking, waived } = splitPaperFileReasons(reasons, dr.dq_file_on_paper_since);
  if (waived.length > 0 && dr.dq_file_on_paper_since) {
    // the assigning user: the caller's actor, else the request's session user (every route sets app.current_user_id)
    const actor = args.actorUserId ?? (await client.query<{ u: string | null }>(
      `SELECT NULLIF(current_setting('app.current_user_id', true), '') AS u`
    )).rows[0]?.u ?? null;
    if (actor) await recordDqFileOnPaper(client, {
      actorUserId: actor, operatingCompanyId, driverId: dr.id, driverName: dr.driver_name, waived,
      dqFileOnPaperSince: dr.dq_file_on_paper_since, loadId: args.loadId, loadNumber: args.loadNumber, via: args.via ?? "assign",
    });
  }

  if (blocking.length === 0) return null;

  return {
    driverId: dr.id,
    driverName: dr.driver_name,
    reasons: blocking,
    cdlExpiresAt: dr.cdl_expires_at,
    medicalExpiryDate: dr.med_expiry_date,
    hazmatEndorsementExpiresAt: dr.hazmat_endorsement_expires_at,
    drugAlcoholViolationAt: daBlock?.violation_at ?? null,
    drugAlcoholViolationSource: daBlock?.violation_source ?? null,
    clearinghouseProhibitedSince: chBlock?.prohibited_since ?? null,
    hosMinutesUntilViolation: hosRows.rows[0]?.minutes_until_violation ?? null,
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

/**
 * LEAD 443.192 — the driver is a merged-away record. A DriverNotQualifiedError subclass so every route that already renders
 * E_DRIVER_NOT_QUALIFIED as a 422 renders this one too (reason "driver_merged", naming the driver it was merged into).
 */
export class DriverMergedError extends DriverNotQualifiedError {
  readonly survivorDriverId: string;
  readonly survivorDriverName: string | null;
  constructor(driverId: string, driverName: string | null, survivorDriverId: string, survivorDriverName: string | null) {
    super({
      driverId,
      driverName,
      reasons: ["driver_merged"],
      cdlExpiresAt: null,
      medicalExpiryDate: null,
      hazmatEndorsementExpiresAt: null,
      drugAlcoholViolationAt: null,
      drugAlcoholViolationSource: null,
      clearinghouseProhibitedSince: null,
      hosMinutesUntilViolation: null,
    });
    this.message =
      `Driver ${driverName ?? driverId} is a merged record — it was merged into ${survivorDriverName ?? survivorDriverId}. ` +
      `Assign ${survivorDriverName ?? survivorDriverId} instead; a merged record can never be a load's driver.`;
    this.name = "DriverMergedError";
    this.survivorDriverId = survivorDriverId;
    this.survivorDriverName = survivorDriverName;
  }
}

/**
 * FAIL-D1 (443.187, CC-2) — a driver (re)assigned to a load that ALREADY exists, on a historical backfill (the Settlement
 * Creator and the settlement-document seed book the past load, then set its driver), runs the SAME gate. Owner ruling for
 * historical_backfill (book-load.service.ts, gateOutcome): "the gate is still EVALUATED, its outcome is RECORDED, and
 * creation proceeds. Never skipped, never silently passed." So a block is written as the same
 * dispatch.historical_backfill_gate_exception audit Book Load writes, and the reassignment proceeds. Live (non-backfill)
 * reassignment paths keep calling assertDriverQualifiedForLoad and block.
 */
export async function recordHistoricalReassignQualification(
  client: QueryableClient,
  args: { driverId: string; operatingCompanyId: string; loadId: string; actorUserId: string; isHazmat?: boolean; via: string }
): Promise<DriverQualificationBlock | null> {
  const block = await assertDriverQualifiedForLoad(client, {
    driverId: args.driverId,
    operatingCompanyId: args.operatingCompanyId,
    isHazmat: Boolean(args.isHazmat),
  });
  if (block) {
    await appendCrudAudit(
      client as never,
      args.actorUserId,
      "dispatch.historical_backfill_gate_exception",
      {
        operating_company_id: args.operatingCompanyId,
        load_id: args.loadId,
        gate: "driver_qualification",
        on: "driver_reassign",
        via: args.via,
        driver_id: block.driverId,
        driver_name: block.driverName,
        reasons: block.reasons,
        cdl_expires_at: block.cdlExpiresAt,
        medical_expiry_date: block.medicalExpiryDate,
        hazmat_endorsement_expires_at: block.hazmatEndorsementExpiresAt,
        historical_backfill_gate_exception: true,
      },
      "warning",
      "FAIL-D1-REASSIGN"
    );
  }
  return block;
}
