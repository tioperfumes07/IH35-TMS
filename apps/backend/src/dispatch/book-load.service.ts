import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { consumeLoadNumberReservation, reserveNextLoadNumber } from "./load-id-reservation.service.js";

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
  time_window_type?: "appointment" | "first_come_first_serve" | "drop_window";
  appointment_start_at?: string;
  appointment_end_at?: string;
  lumper_required?: boolean;
  lumper_paid_by?: "carrier" | "shipper" | "broker" | "receiver" | "unknown";
  lumper_amount_cents?: number;
  is_tarp_stop?: boolean;
  tarp_count?: number;
  stop_notes?: string;
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
  commodity?: string;
  weight_lbs?: number;
  notes?: string;
  booking_mode?: "single_popup" | "legacy_form";
  requires_tarps?: boolean;
  tarp_type?: string;
  lumper_amount_cents?: number;
  customer_chargeback_requested?: boolean;
  customer_chargeback_reason?: string;
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

function canOverrideUnitBlock(role: string) {
  return role === "Owner";
}

function canOverrideHos(role: string) {
  return ["Owner", "Administrator", "Manager"].includes(role);
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

export async function bookLoad(input: BookLoadInput): Promise<BookLoadResult> {
  if (input.assigned_primary_driver_id && input.team_id) {
    return { kind: "error", status: 400, payload: { error: "solo_or_team_assignment_required_not_both" } };
  }

  return withCurrentUser(input.requestingUserUuid, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);

    const wf044Warnings: Array<Record<string, unknown>> = [];

    if (input.assigned_unit_id) {
      const unitRes = await client
        .query(
          `
            SELECT id, display_id, is_dispatch_blocked, dispatch_block_reason, has_open_pm_due_wo, open_wo_count
            FROM views.units_with_dispatch_status
            WHERE id = $1
              AND operating_company_id = $2
            LIMIT 1
          `,
          [input.assigned_unit_id, input.operating_company_id]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      const unit = unitRes.rows[0] ?? null;
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
    }

    if (input.assigned_primary_driver_id) {
      const hosRes = await client
        .query(
          `
            SELECT id, display_id, full_name, hos_badge_color, is_in_violation, minutes_until_violation
            FROM views.drivers_with_hos_status
            WHERE id = $1
              AND operating_company_id = $2
            LIMIT 1
          `,
          [input.assigned_primary_driver_id, input.operating_company_id]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      const hos = hosRes.rows[0] ?? null;
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

    const reservation = await reserveNextLoadNumber(client, {
      operatingCompanyId: input.operating_company_id,
      reservedByUserId: input.requestingUserUuid,
    });
    const loadNumber = reservation.loadNumber;
    const statusForInsert = input.save_mode === "draft" ? "draft" : toMdataStatus(input.status);

    const loadRes = await client.query(
      `
        INSERT INTO mdata.loads (
          operating_company_id, load_number, customer_id, status, rate_total_cents, currency_code,
          assigned_unit_id, assigned_primary_driver_id, assigned_secondary_driver_id, team_id,
          dispatcher_user_id, notes, booking_mode, requires_tarps, tarp_type, lumper_amount_cents,
          customer_chargeback_requested, customer_chargeback_reason, booked_by_user_id, updated_by_user_id
        )
        VALUES ($1,$2,$3,$4,$5,'USD',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
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
        input.requestingUserUuid,
        input.requestingUserUuid,
      ]
    );
    const load = loadRes.rows[0] as Record<string, unknown>;
    await consumeLoadNumberReservation(client, {
      reservationId: reservation.reservationId,
      loadId: String(load.id),
    });

    for (const stop of input.stops) {
      await client.query(
        `
          INSERT INTO mdata.load_stops (
            load_id, sequence_number, stop_type, location_id, address_line1, city, state, country, scheduled_arrival_at, status,
            time_window_type, appointment_start_at, appointment_end_at, lumper_required, lumper_paid_by, lumper_amount_cents, is_tarp_stop, tarp_count, stop_notes
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12,$13,$14,$15,$16,$17,$18)
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
          stop.time_window_type ?? "appointment",
          stop.appointment_start_at ?? null,
          stop.appointment_end_at ?? null,
          Boolean(stop.lumper_required),
          stop.lumper_paid_by ?? "unknown",
          stop.lumper_amount_cents ?? 0,
          Boolean(stop.is_tarp_stop),
          stop.tarp_count ?? 0,
          stop.stop_notes ?? null,
        ]
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
          ["dispatch.loads", load.id, eventType, JSON.stringify({ load_id: load.id, operating_company_id: load.operating_company_id })]
        );
      }
      await client.query(
        `
          INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
          VALUES ($1,$2,$3,$4::jsonb)
        `,
        [
          "dispatch.loads",
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

    return { kind: "ok", row: { ...load, wf_044_maintenance_warnings: wf044Warnings } };
  });
}
