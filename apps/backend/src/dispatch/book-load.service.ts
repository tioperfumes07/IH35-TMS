import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { driverBillNumberFromLoadNumber } from "../driver-finance/driver-bill-number.js";
import { effectiveTeamPercentsFromRow, splitTotalCents } from "../driver-finance/settlement-engine.js";
import { detectAssetCoverageGap } from "../insurance/coverage-gap.service.js";
import {
  claimReservation,
  consumeLoadNumberReservation,
  reserveNextLoadId,
} from "./load-id-reservation.service.js";

type DispatchStatus =
  | "unassigned"
  | "assigned_not_dispatched"
  | "dispatched"
  | "in_transit"
  | "delivered_pending_docs"
  | "completed_docs_received"
  | "cancelled"
  | "abandoned"
  | "driver_walkoff"
  | "driver_no_show";

type BookLoadStop = {
  stop_type: "pickup" | "delivery";
  sequence_number: number;
  location_id?: string;
  company_name?: string;
  city?: string;
  state?: string;
  country?: string;
  address_line1?: string;
  scheduled_arrival_at?: string;
  time_window_type?: "appointment" | "open_window" | "select_hours" | "refused" | "first_come_first_serve" | "drop_window";
  appointment_start_at?: string;
  appointment_end_at?: string;
  lumper_required?: boolean;
  lumper_paid_by?: "carrier" | "shipper" | "broker" | "receiver" | "unknown";
  lumper_amount_cents?: number;
  is_tarp_stop?: boolean;
  tarp_count?: number;
  stop_notes?: string;
  site_contact_name?: string;
  site_contact_phone?: string;
  gate_dock_text?: string;
};

type BookLoadCharge = {
  code: string;
  amount_cents: number;
};

export type BookLoadInput = {
  requestingUserUuid: string;
  requestingUserRole: string;
  operating_company_id: string;
  customer_id: string;
  status: DispatchStatus;
  customer_wo_number?: string;
  customer_po_number?: string;
  commodity?: string;
  weight_lbs?: number;
  hazmat?: boolean;
  driver_instructions_text?: string;
  notes?: string;
  booking_mode?: "single_popup" | "legacy_form";
  requires_tarps?: boolean;
  tarp_type?: string;
  lumper_amount_cents?: number;
  customer_chargeback_requested?: boolean;
  customer_chargeback_reason?: string;
  live_load_number?: string;
  addToOpenPresettlement?: boolean;
  reservation_uuid?: string;
  anticipated_chargeback_cents?: number;
  anticipated_chargeback_reason?: string;
  detention_expected_y_n?: boolean;
  detention_expected_hours?: number;
  detention_bill_customer_per_hour_cents?: number;
  detention_driver_pay_per_hour_cents?: number;
  late_delivery_risk_y_n?: boolean;
  late_delivery_est_deduction_cents?: number;
  late_delivery_reason?: string;
  ocr_source_pdf_r2_key?: string;
  miles_practical?: number;
  miles_shortest?: number;
  miles_deadhead?: number;
  pickup_number?: string;
  border_routing?: string;
  trailer_type?: "refrigerated_van" | "dry_van" | "flatbed" | "power_only_no_trailer" | "power_only_customer_trailer";
  assigned_unit_id?: string;
  assigned_primary_driver_id?: string;
  assigned_secondary_driver_id?: string;
  team_id?: string;
  temp_fahrenheit?: number;
  charges: BookLoadCharge[];
  stops: BookLoadStop[];
  save_mode: "draft" | "book_dispatch";
  override_token?: string;
  override_reason?: string;
};

export type BookLoadResult =
  | { kind: "ok"; row: Record<string, unknown> }
  | { kind: "error"; status: number; payload: Record<string, unknown> };

function normalizeStopTimeWindow(raw?: string): "appointment" | "open_window" | "select_hours" | "refused" {
  if (raw === "first_come_first_serve") return "open_window";
  if (raw === "drop_window") return "select_hours";
  if (raw === "open_window" || raw === "select_hours" || raw === "refused" || raw === "appointment") return raw;
  return "appointment";
}

function canOverrideUnitBlock(role: string) {
  return role === "Owner";
}

function canOverrideHos(role: string) {
  return ["Owner", "Administrator", "Manager"].includes(role);
}

function isInsuranceDispatchGateEnabled() {
  const raw = String(process.env.DISPATCH_INSURANCE_GATE ?? "on").trim().toLowerCase();
  return !["0", "off", "false", "disabled"].includes(raw);
}

function isDrugDispatchBlocked(result: string | null | undefined) {
  return ["positive", "refusal", "adulterated", "substituted"].includes(String(result ?? "").toLowerCase());
}

function toMdataStatus(status: DispatchStatus): string {
  if (status === "unassigned") return "draft";
  if (status === "assigned_not_dispatched") return "assigned_not_dispatched";
  if (status === "dispatched") return "dispatched";
  if (status === "in_transit") return "in_transit";
  if (status === "delivered_pending_docs") return "delivered_pending_docs";
  if (status === "completed_docs_received") return "completed_docs_received";
  if (status === "abandoned") return "abandoned";
  if (status === "driver_walkoff") return "driver_walkoff";
  if (status === "driver_no_show") return "driver_no_show";
  return "cancelled";
}

async function relationExists(
  client: { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  relationName: string
) {
  const res = await client.query<{ exists: boolean }>(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [relationName]
  );
  return Boolean(res.rows[0]?.exists);
}

async function optionalQuery<T = Record<string, unknown>>(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  sql: string,
  values: unknown[]
) {
  const savepoint = `sp_optional_${Math.random().toString(36).slice(2, 10)}`;
  try {
    await client.query(`SAVEPOINT ${savepoint}`);
    const res = await client.query<T>(sql, values);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    return res.rows;
  } catch {
    await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`).catch(() => undefined);
    await client.query(`RELEASE SAVEPOINT ${savepoint}`).catch(() => undefined);
    return [] as T[];
  }
}

async function collectAssignedDriverIdsForDrugGate(
  client: { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  input: BookLoadInput
) {
  const ids = new Set<string>();
  if (input.assigned_primary_driver_id) ids.add(input.assigned_primary_driver_id);
  if (input.assigned_secondary_driver_id) ids.add(input.assigned_secondary_driver_id);

  if (input.team_id) {
    const teamRows = await optionalQuery<{
      primary_driver_id: string;
      secondary_driver_id: string;
      is_active: boolean;
    }>(
      client,
      `
        SELECT primary_driver_id, secondary_driver_id, is_active
        FROM mdata.driver_teams
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
      `,
      [input.team_id, input.operating_company_id]
    );
    const team = teamRows[0];
    if (team?.is_active !== false) {
      if (team?.primary_driver_id) ids.add(String(team.primary_driver_id));
      if (team?.secondary_driver_id) ids.add(String(team.secondary_driver_id));
    }
  }

  return Array.from(ids);
}

export async function createDriverBillArtifacts(
  client: { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  input: BookLoadInput,
  load: Record<string, unknown>,
  loadNumber: string,
  stops: BookLoadStop[]
) {
  const hasDriverBills = await relationExists(client, "driver_finance.driver_bills");
  if (!hasDriverBills) return;

  const extraPickupCount = stops.filter((s) => s.stop_type === "pickup").length > 1 ? stops.filter((s) => s.stop_type === "pickup").length - 1 : 0;
  const extraDropCount = stops.filter((s) => s.stop_type === "delivery").length > 1 ? stops.filter((s) => s.stop_type === "delivery").length - 1 : 0;
  const extraStopBonusCents = (extraPickupCount + extraDropCount) * 2500;
  const tarpPayCents = input.requires_tarps ? 4000 : 0;
  const driverLumperCents = stops.reduce((sum, stop) => {
    if (!stop.lumper_required) return sum;
    return stop.lumper_paid_by === "carrier" ? sum + Number(stop.lumper_amount_cents ?? 0) : sum;
  }, 0);
  const basePayCents = input.charges.reduce((sum, c) => sum + Number(c.amount_cents ?? 0), 0);
  const totalBillCents = basePayCents + extraStopBonusCents + tarpPayCents + driverLumperCents;

  const resolvedLoadNumber = String(load.load_number ?? loadNumber);
  const billNumber = driverBillNumberFromLoadNumber(resolvedLoadNumber);
  const milesShort = Number(load.miles_shortest ?? 0) || null;
  const milesPrac = Number(load.miles_practical ?? 0) || null;
  let milesBasis: number | null = null;
  let milesBasisType: "short" | "practical" | null = null;
  if (milesShort && milesShort > 0) {
    milesBasis = milesShort;
    milesBasisType = "short";
  } else if (milesPrac && milesPrac > 0) {
    milesBasis = milesPrac;
    milesBasisType = "practical";
  }

  const customerLumperCents = stops.reduce((sum, stop) => {
    if (!stop.lumper_required) return sum;
    return ["shipper", "broker", "receiver"].includes(String(stop.lumper_paid_by ?? "")) ? sum + Number(stop.lumper_amount_cents ?? 0) : sum;
  }, 0);
  const companyLumperCents = stops.reduce((sum, stop) => {
    if (!stop.lumper_required) return sum;
    return stop.lumper_paid_by === "unknown" ? sum + Number(stop.lumper_amount_cents ?? 0) : sum;
  }, 0);

  if (input.team_id) {
    const teamRes = await client.query<{
      primary_driver_id: string;
      secondary_driver_id: string;
      split_method: string;
      primary_share_pct: string | number | null;
      co_share_pct: string | number | null;
      is_active: boolean;
    }>(
      `
        SELECT primary_driver_id, secondary_driver_id, split_method::text, primary_share_pct, co_share_pct, is_active
        FROM mdata.driver_teams
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
      `,
      [input.team_id, input.operating_company_id]
    );
    const teamRow = teamRes.rows[0];
    if (!teamRow || teamRow.is_active === false) return;

    const pcts = effectiveTeamPercentsFromRow(teamRow);
    const split = splitTotalCents(totalBillCents, pcts.primaryPct, pcts.secondaryPct);

    const primaryDriverId = String(teamRow.primary_driver_id);
    const secondaryDriverId = String(teamRow.secondary_driver_id);

    let firstBillId: string | null = null;

    const inserts: Array<{ driverId: string; partnerId: string; cents: number; suffix: string }> = [
      { driverId: primaryDriverId, partnerId: secondaryDriverId, cents: split.primaryCents, suffix: "-P" },
      { driverId: secondaryDriverId, partnerId: primaryDriverId, cents: split.secondaryCents, suffix: "-S" },
    ];

    for (const row of inserts) {
      if (row.cents <= 0) continue;
      const ratePerMileCents = milesBasis && milesBasis > 0 ? Math.round(row.cents / milesBasis) : null;
      const billRes = await client.query<{ id: string }>(
        `
          INSERT INTO driver_finance.driver_bills (
            operating_company_id,
            load_id,
            load_number,
            bill_number,
            driver_id,
            team_driver_id,
            gross_amount_cents,
            miles_basis,
            miles_basis_type,
            rate_per_mile_cents,
            status,
            notes,
            created_by_user_id
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open',$11,$12)
          RETURNING id
        `,
        [
          input.operating_company_id,
          load.id,
          resolvedLoadNumber,
          `${billNumber}${row.suffix}`,
          row.driverId,
          row.partnerId,
          row.cents,
          milesBasis,
          milesBasisType,
          ratePerMileCents,
          `Auto-created from load ${resolvedLoadNumber} (team split ${row.suffix})`,
          input.requestingUserUuid,
        ]
      );
      const billId = billRes.rows[0]?.id ? String(billRes.rows[0].id) : "";
      if (billId && !firstBillId) firstBillId = billId;
    }

    if (!firstBillId) return;

    await appendCrudAudit(
      client,
      input.requestingUserUuid,
      "dispatch.load.driver_bill_created",
      {
        load_uuid: load.id,
        load_number: resolvedLoadNumber,
        bill_id: firstBillId,
        bill_display_id: billNumber,
        team_id: input.team_id,
        split: { primary_cents: split.primaryCents, secondary_cents: split.secondaryCents },
        extra_pickups_count: extraPickupCount,
        extra_drops_count: extraDropCount,
        tarp_pay_cents: tarpPayCents,
        lumper_driver_advance_cents: driverLumperCents,
        lumper_customer_passthrough_cents: customerLumperCents,
        lumper_company_expense_cents: companyLumperCents,
      },
      "info",
      "P6-D2"
    );
    return;
  }

  if (!input.assigned_primary_driver_id) return;

  const ratePerMileCents = milesBasis && milesBasis > 0 ? Math.round(totalBillCents / milesBasis) : null;

  const billRes = await client.query<{ id: string }>(
    `
      INSERT INTO driver_finance.driver_bills (
        operating_company_id,
        load_id,
        load_number,
        bill_number,
        driver_id,
        team_driver_id,
        gross_amount_cents,
        miles_basis,
        miles_basis_type,
        rate_per_mile_cents,
        status,
        notes,
        created_by_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'open',$11,$12)
      RETURNING id
    `,
    [
      input.operating_company_id,
      load.id,
      resolvedLoadNumber,
      billNumber,
      input.assigned_primary_driver_id,
      input.assigned_secondary_driver_id ?? null,
      totalBillCents,
      milesBasis,
      milesBasisType,
      ratePerMileCents,
      `Auto-created from load ${resolvedLoadNumber}`,
      input.requestingUserUuid,
    ]
  );
  const billId = billRes.rows[0]?.id;
  if (!billId) return;

  await appendCrudAudit(
    client,
    input.requestingUserUuid,
    "dispatch.load.driver_bill_created",
    {
      load_uuid: load.id,
      load_number: resolvedLoadNumber,
      bill_id: billId,
      bill_display_id: billNumber,
      extra_pickups_count: extraPickupCount,
      extra_drops_count: extraDropCount,
      tarp_pay_cents: tarpPayCents,
      lumper_driver_advance_cents: driverLumperCents,
      lumper_customer_passthrough_cents: customerLumperCents,
      lumper_company_expense_cents: companyLumperCents,
    },
    "info",
    "P6-D2"
  );
}

export async function bookLoad(input: BookLoadInput): Promise<BookLoadResult> {
  if (input.assigned_primary_driver_id && input.team_id) {
    return { kind: "error", status: 400, payload: { error: "solo_or_team_assignment_required_not_both" } };
  }

  return withCurrentUser(input.requestingUserUuid, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);

    const wf044Warnings: Array<Record<string, unknown>> = [];
    const insuranceCoverageWarnings: Array<Record<string, unknown>> = [];

    if (input.assigned_unit_id) {
      const unitRows = await optionalQuery(
        client,
        `
          SELECT id, display_id, is_dispatch_blocked, dispatch_block_reason, has_open_pm_due_wo, open_wo_count
          FROM views.units_with_dispatch_status
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [input.assigned_unit_id, input.operating_company_id]
      );
      const unit = unitRows[0] ?? null;
      if (unit?.has_open_pm_due_wo) {
        wf044Warnings.push({
          unit_id: unit.id,
          unit_display_id: unit.display_id,
          open_wo_count: Number(unit.open_wo_count ?? 0),
          message: `Unit ${String(unit.display_id ?? "unit")} has open PM-due work order(s).`,
        });
      }

      if (unit?.is_dispatch_blocked) {
        if (!input.override_token) {
          await appendCrudAudit(
            client,
            input.requestingUserUuid,
            "dispatch.book_load_blocked_by_unit",
            {
              operating_company_id: input.operating_company_id,
              unit_id: unit.id,
              block_reason: unit.dispatch_block_reason ?? null,
              block_code: "E_UNIT_DISPATCH_BLOCKED",
            },
            "info",
            "BT-3-DISPATCH-AUTH-GATES"
          );
          return {
            kind: "error",
            status: 422,
            payload: {
              error: "E_UNIT_DISPATCH_BLOCKED",
              message: `Unit ${String(unit.display_id ?? "")} is dispatch-blocked: ${String(unit.dispatch_block_reason ?? "major defect reported")}`,
              details: { unit_id: unit.id, unit_display_id: unit.display_id, block_reason: unit.dispatch_block_reason },
              wf_044_maintenance_warnings: wf044Warnings,
              insurance_coverage_gap_warnings: insuranceCoverageWarnings,
            },
          };
        }
        if (!canOverrideUnitBlock(input.requestingUserRole)) {
          return {
            kind: "error",
            status: 403,
            payload: { error: "E_PERMISSION_DENIED", message: "Only Owner can override dispatch-blocked units." },
          };
        }
        if (!input.override_reason || input.override_reason.trim().length < 10) {
          return {
            kind: "error",
            status: 400,
            payload: { error: "E_OVERRIDE_REASON_REQUIRED", message: "Override reason must be at least 10 characters." },
          };
        }
        await appendCrudAudit(
          client,
          input.requestingUserUuid,
          "dispatch.unit_block_overridden_by_owner",
          {
            operating_company_id: input.operating_company_id,
            unit_id: unit.id,
            unit_display_id: unit.display_id,
            block_reason: unit.dispatch_block_reason ?? null,
            override_token: input.override_token,
            override_reason: input.override_reason,
            role: input.requestingUserRole,
            severity_label: "critical",
          },
          "warning",
          "BT-3-DISPATCH-AUTH-GATES"
        );
        await client.query(
          `
            INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
            VALUES ($1,$2,$3,$4::jsonb)
          `,
          [
            "dispatch.loads",
            input.assigned_unit_id,
            "dispatch.wf064.override_notice",
            JSON.stringify({
              override_type: "unit_block",
              notify_channels: ["email", "sms"],
              operating_company_id: input.operating_company_id,
              override_reason: input.override_reason,
              override_by_user_id: input.requestingUserUuid,
            }),
          ]
        );
      }

      const coverage = await detectAssetCoverageGap(client, {
        operatingCompanyId: input.operating_company_id,
        assetId: input.assigned_unit_id,
      });
      if (!coverage.asset_exists) {
        return {
          kind: "error",
          status: 400,
          payload: { error: "invalid_unit_for_company" },
        };
      }

      if (!coverage.is_covered) {
        const warning = {
          unit_id: input.assigned_unit_id,
          as_of_date: coverage.as_of_date,
          required_types: coverage.required_types,
          covered_types: coverage.covered_types,
          gap_types: coverage.gap_types,
        };
        insuranceCoverageWarnings.push(warning);
        const insuranceGateEnabled = isInsuranceDispatchGateEnabled();
        if (insuranceGateEnabled) {
          await appendCrudAudit(
            client,
            input.requestingUserUuid,
            "dispatch.book_load_blocked_by_insurance_coverage_gap",
            {
              operating_company_id: input.operating_company_id,
              unit_id: input.assigned_unit_id,
              block_code: "E_UNIT_INSURANCE_COVERAGE_GAP",
              required_types: coverage.required_types,
              covered_types: coverage.covered_types,
              gap_types: coverage.gap_types,
              as_of_date: coverage.as_of_date,
            },
            "warning",
            "INS-03-COVERAGE-GAP-GATE"
          );
          return {
            kind: "error",
            status: 422,
            payload: {
              error: "E_UNIT_INSURANCE_COVERAGE_GAP",
              message: "Assigned unit has insurance coverage gaps for dispatch-required policy types.",
              details: warning,
              wf_044_maintenance_warnings: wf044Warnings,
              insurance_coverage_gap_warnings: insuranceCoverageWarnings,
            },
          };
        }
      }
    }

    if (input.assigned_primary_driver_id) {
      const hosRows = await optionalQuery(
        client,
        `
          SELECT id, display_id, full_name, hos_badge_color, is_in_violation, minutes_until_violation
          FROM views.drivers_with_hos_status
          WHERE id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [input.assigned_primary_driver_id, input.operating_company_id]
      );
      const hos = hosRows[0] ?? null;
      if (hos?.is_in_violation) {
        if (!input.override_token) {
          await appendCrudAudit(
            client,
            input.requestingUserUuid,
            "dispatch.book_load_blocked_by_hos",
            {
              operating_company_id: input.operating_company_id,
              driver_id: hos.id,
              block_code: "E_DRIVER_HOS_VIOLATION",
              minutes_until_violation: Number(hos.minutes_until_violation ?? 0),
            },
            "info",
            "BT-3-DISPATCH-AUTH-GATES"
          );
          return {
            kind: "error",
            status: 422,
            payload: {
              error: "E_DRIVER_HOS_VIOLATION",
              message: `Driver ${String(hos.full_name ?? hos.display_id ?? "")} is in HOS violation.`,
              details: {
                driver_id: hos.id,
                minutes_until_violation: Number(hos.minutes_until_violation ?? 0),
                hos_badge_color: hos.hos_badge_color,
              },
              wf_044_maintenance_warnings: wf044Warnings,
              insurance_coverage_gap_warnings: insuranceCoverageWarnings,
            },
          };
        }
        if (!canOverrideHos(input.requestingUserRole)) {
          return {
            kind: "error",
            status: 403,
            payload: { error: "E_PERMISSION_DENIED", message: "Only Manager/Admin/Owner can override HOS violations." },
          };
        }
        if (!input.override_reason || input.override_reason.trim().length < 10) {
          return {
            kind: "error",
            status: 400,
            payload: { error: "E_OVERRIDE_REASON_REQUIRED", message: "Override reason must be at least 10 characters." },
          };
        }
        await appendCrudAudit(
          client,
          input.requestingUserUuid,
          "dispatch.hos_override_by_manager",
          {
            operating_company_id: input.operating_company_id,
            driver_id: hos.id,
            driver_display_id: hos.display_id,
            minutes_until_violation: Number(hos.minutes_until_violation ?? 0),
            override_token: input.override_token,
            override_reason: input.override_reason,
            role: input.requestingUserRole,
          },
          "warning",
          "BT-3-DISPATCH-AUTH-GATES"
        );
        await client.query(
          `
            INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
            VALUES ($1,$2,$3,$4::jsonb)
          `,
          [
            "dispatch.loads",
            input.assigned_primary_driver_id,
            "dispatch.wf064.override_notice",
            JSON.stringify({
              override_type: "hos_violation",
              notify_channels: ["email"],
              operating_company_id: input.operating_company_id,
              override_reason: input.override_reason,
              override_by_user_id: input.requestingUserUuid,
            }),
          ]
        );
      }
    }

    const hasDrugTestTable = await relationExists(client, "safety.drug_test");
    if (hasDrugTestTable) {
      const assignedDriverIds = await collectAssignedDriverIdsForDrugGate(client, input);
      if (assignedDriverIds.length > 0) {
        const latestDrugRows = await optionalQuery<{
          driver_id: string;
          result: string;
          test_date: string;
        }>(
          client,
          `
            SELECT DISTINCT ON (driver_id)
              driver_id::text,
              result::text,
              test_date::text
            FROM safety.drug_test
            WHERE operating_company_id = $1
              AND driver_id = ANY($2::uuid[])
              AND voided_at IS NULL
            ORDER BY driver_id, test_date DESC, created_at DESC
          `,
          [input.operating_company_id, assignedDriverIds]
        );
        const blocked = latestDrugRows.find((row) => isDrugDispatchBlocked(row.result));
        if (blocked) {
          await appendCrudAudit(
            client,
            input.requestingUserUuid,
            "dispatch.book_load_blocked_by_drug_program",
            {
              operating_company_id: input.operating_company_id,
              driver_id: blocked.driver_id,
              latest_result: blocked.result,
              latest_test_date: blocked.test_date,
              block_code: "E_DRIVER_DRUG_DISPATCH_BLOCKED",
            },
            "warning",
            "P7-SAF-DRUG-PROGRAM"
          );
          return {
            kind: "error",
            status: 422,
            payload: {
              error: "E_DRIVER_DRUG_DISPATCH_BLOCKED",
              message: `Driver is dispatch-blocked due to latest drug program result: ${blocked.result}.`,
              details: {
                driver_id: blocked.driver_id,
                latest_result: blocked.result,
                latest_test_date: blocked.test_date,
              },
              wf_044_maintenance_warnings: wf044Warnings,
              insurance_coverage_gap_warnings: insuranceCoverageWarnings,
            },
          };
        }
      }
    }

    let reservationId = "";
    let loadNumber = "";
    if (input.reservation_uuid) {
      const claimed = await claimReservation(client, {
        operatingCompanyId: input.operating_company_id,
        reservationId: input.reservation_uuid,
        reservedByUserId: input.requestingUserUuid,
      });
      if (!claimed) {
        return {
          kind: "error",
          status: 409,
          payload: { error: "E_RESERVATION_NOT_AVAILABLE", message: "Reservation expired or unavailable." },
        };
      }
      reservationId = claimed.id;
      loadNumber = claimed.reserved_load_number;
    } else {
      const reservation = await reserveNextLoadId(client, {
        operatingCompanyId: input.operating_company_id,
        reservedByUserId: input.requestingUserUuid,
      });
      reservationId = reservation.reservationId;
      loadNumber = reservation.loadNumber;
    }
    const statusForInsert = input.save_mode === "draft" ? "draft" : toMdataStatus(input.status);
    const v3Metadata = {
      customer_po_number: input.customer_po_number ?? null,
      hazmat: Boolean(input.hazmat),
    };

    const loadRes = await client.query(
      `
        INSERT INTO mdata.loads (
          operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
          assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id, team_id,
          dispatcher_user_id, notes, booking_mode, requires_tarps, tarp_type, lumper_amount_cents,
          customer_chargeback_requested, customer_chargeback_reason, live_load_number,
          quicksave_pending_fields, presettlement_link_id, booked_by_user_id, updated_by_user_id,
          driver_instructions_text,
          anticipated_chargeback_cents, anticipated_chargeback_reason,
          detention_expected_y_n, detention_expected_hours,
          detention_bill_customer_per_hour_cents, detention_driver_pay_per_hour_cents,
          late_delivery_risk_y_n, late_delivery_est_deduction_cents, late_delivery_reason,
          ocr_source_pdf_r2_key, miles_practical, miles_shortest, miles_deadhead,
          customer_wo_number, pickup_number, border_routing
        )
        VALUES ($1,$2,$3,$4,$5,'USD',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39)
        RETURNING *
      `,
      [
        input.operating_company_id,
        loadNumber,
        input.customer_id,
        statusForInsert,
        input.charges.reduce((sum, item) => sum + item.amount_cents, 0),
        input.assigned_unit_id ?? null,
        input.team_id ? null : (input.assigned_primary_driver_id ?? null),
        input.team_id ? null : (input.assigned_secondary_driver_id ?? null),
        input.team_id ?? null,
        input.requestingUserUuid,
        input.notes ?? null,
        input.booking_mode ?? "single_popup",
        Boolean(input.requires_tarps),
        input.tarp_type ?? null,
        input.lumper_amount_cents ?? 0,
        Boolean(input.customer_chargeback_requested),
        input.customer_chargeback_reason ?? null,
        input.live_load_number ?? null,
        JSON.stringify(v3Metadata),
        null,
        input.requestingUserUuid,
        input.requestingUserUuid,
        input.driver_instructions_text ?? null,
        input.anticipated_chargeback_cents ?? null,
        input.anticipated_chargeback_reason ?? null,
        Boolean(input.detention_expected_y_n),
        input.detention_expected_hours ?? null,
        input.detention_bill_customer_per_hour_cents ?? null,
        input.detention_driver_pay_per_hour_cents ?? null,
        Boolean(input.late_delivery_risk_y_n),
        input.late_delivery_est_deduction_cents ?? null,
        input.late_delivery_reason ?? null,
        input.ocr_source_pdf_r2_key ?? null,
        input.miles_practical ?? null,
        input.miles_shortest ?? null,
        input.miles_deadhead ?? null,
        input.customer_wo_number ?? null,
        input.pickup_number ?? null,
        input.border_routing ?? null,
      ]
    );
    const load = loadRes.rows[0] as Record<string, unknown>;
    await consumeLoadNumberReservation(client, {
      reservationId,
      loadId: String(load.id),
    });

    for (const stop of input.stops) {
      const tw = normalizeStopTimeWindow(stop.time_window_type);
      await client.query(
        `
          INSERT INTO mdata.load_stops (
            load_id, sequence_number, stop_type, location_id, address_line1, city, state, country, scheduled_arrival_at, status,
            time_window_type, appointment_start_at, appointment_end_at, lumper_required, lumper_paid_by, lumper_amount_cents, is_tarp_stop, tarp_count, stop_notes,
            site_contact_name, site_contact_phone, gate_dock_text
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        `,
        [
          load.id,
          stop.sequence_number,
          stop.stop_type,
          stop.location_id ?? null,
          stop.address_line1 ?? null,
          stop.city ?? null,
          stop.state ?? null,
          stop.country ?? null,
          stop.scheduled_arrival_at ?? null,
          tw,
          stop.appointment_start_at ?? null,
          stop.appointment_end_at ?? null,
          Boolean(stop.lumper_required),
          stop.lumper_paid_by ?? "unknown",
          stop.lumper_amount_cents ?? 0,
          Boolean(stop.is_tarp_stop),
          stop.tarp_count ?? 0,
          stop.stop_notes ?? null,
          stop.site_contact_name ?? null,
          stop.site_contact_phone ?? null,
          stop.gate_dock_text ?? null,
        ]
      );
    }

    if (input.driver_instructions_text?.trim()) {
      await appendCrudAudit(
        client,
        input.requestingUserUuid,
        "dispatch.load.driver_instructions_changed",
        {
          load_uuid: load.id,
          operating_company_id: input.operating_company_id,
          driver_instructions_text: input.driver_instructions_text,
        },
        "info",
        "P6-T11171"
      );
    }

    if (
      (input.anticipated_chargeback_cents ?? 0) > 0 ||
      input.detention_expected_y_n ||
      input.late_delivery_risk_y_n
    ) {
      await appendCrudAudit(
        client,
        input.requestingUserUuid,
        "dispatch.load.expected_adjustments_captured",
        {
          load_uuid: load.id,
          operating_company_id: input.operating_company_id,
          anticipated_chargeback_cents: input.anticipated_chargeback_cents ?? null,
          anticipated_chargeback_reason: input.anticipated_chargeback_reason ?? null,
          detention_expected_y_n: Boolean(input.detention_expected_y_n),
          detention_expected_hours: input.detention_expected_hours ?? null,
          late_delivery_risk_y_n: Boolean(input.late_delivery_risk_y_n),
          late_delivery_est_deduction_cents: input.late_delivery_est_deduction_cents ?? null,
          late_delivery_reason: input.late_delivery_reason ?? null,
        },
        "info",
        "P6-T11171"
      );
    }

    if (input.addToOpenPresettlement) {
      // TODO P6-FOLLOWUP-PRESETTLEMENT-LINK: when presettlement query
      //   service exists, look up driver's open presettlement here
      //   and set presettlement_link_id = openPresettlement.uuid.
      //   Until then, leave null. Frontend checkbox renders disabled
      //   with explanatory tooltip.
      await appendCrudAudit(
        client,
        input.requestingUserUuid,
        "dispatch.load.presettlement_link_deferred",
        {
          load_uuid: load.id,
          requested: true,
          reason: "presettlement_query_not_yet_implemented",
        },
        "info",
        "P6-D2"
      );
    }

    if (wf044Warnings.length > 0) {
      await appendCrudAudit(
        client,
        input.requestingUserUuid,
        "dispatch.assignment_with_maintenance_warning",
        {
          resource_id: load.id,
          resource_type: "dispatch.loads",
          operating_company_id: input.operating_company_id,
          wf_044_maintenance_warnings: wf044Warnings,
        },
        "info",
        "BT-3-DISPATCH-AUTH-GATES"
      );
    }

    if (input.save_mode === "book_dispatch") {
      await createDriverBillArtifacts(client, input, load, loadNumber, input.stops);
      await appendCrudAudit(
        client,
        input.requestingUserUuid,
        "dispatch.load_created",
        {
          resource_id: load.id,
          resource_type: "dispatch.loads",
          entity_type: "load",
          entity_id: load.id,
          load_number: load.load_number,
          operating_company_id: load.operating_company_id,
          status: load.status,
          save_mode: input.save_mode,
          wf_044_maintenance_warnings: wf044Warnings,
        },
        "info",
        "BT-3-DISPATCH-AUTH-GATES"
      );

      const outboxEvents = [
        "dispatch.load.created",
        "dispatch.driver_sms",
        "dispatch.qbo_invoice",
        "dispatch.qbo_bill",
        "dispatch.fuel_planner",
        "dispatch.factoring_packet",
        "dispatch.load_notification",
      ];
      for (const eventType of outboxEvents) {
        await client.query(
          `
            INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
            VALUES ($1,$2,$3,$4::jsonb)
          `,
          [
            "dispatch.loads",
            load.id,
            eventType,
            JSON.stringify(
              eventType === "dispatch.load.created"
                ? {
                    load,
                    stops: input.stops,
                    operating_company_id: load.operating_company_id,
                    actor_user_id: input.requestingUserUuid,
                    save_mode: input.save_mode,
                    load_number: loadNumber,
                  }
                : { load_id: load.id, operating_company_id: load.operating_company_id }
            ),
          ]
        );
      }
      await client.query(
        `
          INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
          VALUES ($1,$2,$3,$4::jsonb)
        `,
        [
          "dispatch.load",
          load.id,
          "dispatch.load.dispatched",
          JSON.stringify({
            load_id: load.id,
            operating_company_id: load.operating_company_id,
            actor_user_id: input.requestingUserUuid,
          }),
        ]
      );
    }

    return {
      kind: "ok",
      row: {
        ...load,
        wf_044_maintenance_warnings: wf044Warnings,
        insurance_coverage_gap_warnings: insuranceCoverageWarnings,
      },
    };
  });
}
