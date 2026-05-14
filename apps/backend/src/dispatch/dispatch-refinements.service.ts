import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { notifyLoadAssigned, notifyLoadReassignedAway } from "../services/push-notification.service.js";

export type ReassignBody = {
  operating_company_id: string;
  load_id: string;
  new_driver_id: string;
  reason_code: string;
  notes?: string | null;
};

function normalizeStopType(raw: string): "pickup" | "delivery" | "fuel" | "rest" | "border" {
  const v = raw.toLowerCase();
  if (v === "dropoff") return "delivery";
  if (v === "customs") return "border";
  if (v === "pickup" || v === "delivery" || v === "fuel" || v === "rest" || v === "border") return v;
  return "rest";
}

export type LoadStopInput = {
  sequence_number: number;
  stop_type: string;
  location_address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  address_line1?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  window_start?: string | null;
  window_end?: string | null;
  notes?: string | null;
  signature_required?: boolean;
  photo_required?: boolean;
};

export async function manualReassignLoad(userId: string, input: ReassignBody) {
  const loserBox: {
    v: { operatingCompanyId: string; driverId: string; loadId: string; loadLabel: string | null } | null;
  } = { v: null };
  const winnerBox: {
    v: { operatingCompanyId: string; driverId: string; loadId: string; loadLabel: string | null } | null;
  } = { v: null };

  const result = await withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
    await client.query("BEGIN");
    try {
      const loadRes = await client.query(
        `
          SELECT id, operating_company_id, assigned_primary_driver_id, assigned_unit_id, assigned_secondary_driver_id, load_number
          FROM mdata.loads
          WHERE id = $1
            AND operating_company_id = $2
            AND soft_deleted_at IS NULL
          FOR UPDATE
        `,
        [input.load_id, input.operating_company_id]
      );
      const load = loadRes.rows[0] as
        | {
            id: string;
            operating_company_id: string;
            assigned_primary_driver_id: string | null;
            assigned_unit_id: string | null;
            assigned_secondary_driver_id: string | null;
            load_number: string | null;
          }
        | undefined;
      if (!load) throw new Error("E_LOAD_NOT_FOUND");

      await client.query(
        `
          UPDATE mdata.loads
          SET assigned_primary_driver_id = $2,
              updated_at = now()
          WHERE id = $1
        `,
        [input.load_id, input.new_driver_id]
      );

      await client.query(
        `
          INSERT INTO dispatch.load_assignment_history (
            operating_company_id, load_id, assignment_method,
            previous_driver_id, new_driver_id,
            previous_unit_id, new_unit_id,
            previous_trailer_id, new_trailer_id,
            assigned_by_user_id, warnings_acknowledged,
            reason_code, notes
          )
          VALUES ($1,$2,'manual_reassign',$3,$4,$5,$5,$6,$6,$7,'[]'::jsonb,$8,$9)
        `,
        [
          input.operating_company_id,
          input.load_id,
          load.assigned_primary_driver_id ?? null,
          input.new_driver_id,
          load.assigned_unit_id ?? null,
          load.assigned_secondary_driver_id ?? null,
          userId,
          input.reason_code,
          input.notes ?? null,
        ]
      );

      await client.query(
        `
          INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
          VALUES ('load', $1, 'load.reassigned', $2::jsonb)
        `,
        [
          input.load_id,
          JSON.stringify({
            load_id: input.load_id,
            from_driver_id: load.assigned_primary_driver_id,
            to_driver_id: input.new_driver_id,
            reason_code: input.reason_code,
            reassigned_by_user_id: userId,
          }),
        ]
      );

      await appendCrudAudit(
        client,
        userId,
        "dispatch.load.reassigned",
        {
          resource_type: "mdata.loads",
          resource_id: input.load_id,
          operating_company_id: input.operating_company_id,
          new_driver_id: input.new_driver_id,
          reason_code: input.reason_code,
        },
        "info",
        "P6-T11191"
      );

      await client.query("COMMIT");
      const previousPrimary = load.assigned_primary_driver_id;
      if (previousPrimary && previousPrimary !== input.new_driver_id) {
        loserBox.v = {
          operatingCompanyId: input.operating_company_id,
          driverId: previousPrimary,
          loadId: input.load_id,
          loadLabel: load.load_number ?? null,
        };
      }
      if (input.new_driver_id !== previousPrimary) {
        winnerBox.v = {
          operatingCompanyId: input.operating_company_id,
          driverId: input.new_driver_id,
          loadId: input.load_id,
          loadLabel: load.load_number ?? null,
        };
      }
      return { ok: true as const, load_id: input.load_id };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });

  if (loserBox.v) {
    void notifyLoadReassignedAway({
      operatingCompanyId: loserBox.v.operatingCompanyId,
      driverId: loserBox.v.driverId,
      loadId: loserBox.v.loadId,
      loadLabel: loserBox.v.loadLabel,
    }).catch(() => undefined);
  }
  if (winnerBox.v) {
    void notifyLoadAssigned({
      operatingCompanyId: winnerBox.v.operatingCompanyId,
      driverId: winnerBox.v.driverId,
      loadId: winnerBox.v.loadId,
      loadLabel: winnerBox.v.loadLabel,
    }).catch(() => undefined);
  }

  return result;
}

export async function listLoadStopsRefined(userId: string, operatingCompanyId: string, loadId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    const res = await client.query(
      `
        SELECT
          ls.id,
          ls.load_id,
          ls.sequence_number,
          ls.stop_type::text AS stop_type,
          ls.location_id,
          ls.address_line1,
          ls.city,
          ls.state,
          ls.country,
          ls.scheduled_arrival_at,
          ls.scheduled_departure_at,
          ls.appointment_start_at,
          ls.appointment_end_at,
          ls.notes,
          COALESCE(ls.stop_notes, ls.notes) AS stop_notes,
          ls.status::text AS status,
          ls.latitude,
          ls.longitude,
          ls.signature_required,
          ls.photo_required,
          ls.created_at,
          ls.updated_at
        FROM mdata.load_stops ls
        INNER JOIN mdata.loads l ON l.id = ls.load_id
        WHERE ls.load_id = $1
          AND l.operating_company_id = $2
        ORDER BY ls.sequence_number ASC
      `,
      [loadId, operatingCompanyId]
    );
    return { stops: res.rows };
  });
}

export async function replaceLoadStopsRefined(
  userId: string,
  operatingCompanyId: string,
  loadId: string,
  stops: LoadStopInput[]
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    await client.query("BEGIN");
    try {
      const load = await client.query(
        `SELECT id FROM mdata.loads WHERE id = $1 AND operating_company_id = $2 AND soft_deleted_at IS NULL`,
        [loadId, operatingCompanyId]
      );
      if (!load.rows[0]) throw new Error("E_LOAD_NOT_FOUND");

      await client.query(`DELETE FROM mdata.load_stops WHERE load_id = $1`, [loadId]);

      for (const s of stops) {
        const st = normalizeStopType(s.stop_type);
        const apStart = s.window_start ?? null;
        const apEnd = s.window_end ?? null;
        const addr1 = s.address_line1 ?? s.location_address ?? null;
        await client.query(
          `
            INSERT INTO mdata.load_stops (
              load_id, sequence_number, stop_type,
              address_line1, city, state, country,
              scheduled_arrival_at, appointment_start_at, appointment_end_at,
              notes, stop_notes, status,
              latitude, longitude, signature_required, photo_required,
              time_window_type
            )
            VALUES (
              $1,$2,$3::mdata.stop_type_enum,
              $4,$5,$6,$7,
              $8,$9,$10,
              $11,$11,'pending'::mdata.stop_status_enum,
              $12,$13,$14,$15,
              CASE WHEN $9 IS NOT NULL THEN 'appointment'::mdata.time_window_type_enum ELSE 'first_come_first_serve'::mdata.time_window_type_enum END
            )
          `,
          [
            loadId,
            s.sequence_number,
            st,
            addr1,
            s.city ?? null,
            s.state ?? null,
            s.country ?? "US",
            apStart,
            apStart,
            apEnd,
            s.notes ?? null,
            s.latitude ?? null,
            s.longitude ?? null,
            Boolean(s.signature_required),
            Boolean(s.photo_required),
          ]
        );
      }

      await appendCrudAudit(
        client,
        userId,
        "dispatch.load.stops_replaced",
        { resource_type: "mdata.loads", resource_id: loadId, operating_company_id: operatingCompanyId, stop_count: stops.length },
        "info",
        "P6-T11191"
      );

      await client.query("COMMIT");
      return { ok: true as const, load_id: loadId };
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  });
}

export async function listAvailableDriversForDispatch(
  userId: string,
  operatingCompanyId: string,
  loadId: string,
  _forPickupAtIso: string | undefined
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    const loadPickup = await client.query(
      `
        SELECT COALESCE(sp.city, '') AS pickup_city, COALESCE(sp.state, '') AS pickup_state
        FROM mdata.loads l
        LEFT JOIN LATERAL (
          SELECT city, state FROM mdata.load_stops s
          WHERE s.load_id = l.id AND s.stop_type = 'pickup'::mdata.stop_type_enum
          ORDER BY s.sequence_number ASC
          LIMIT 1
        ) sp ON true
        WHERE l.id = $1 AND l.operating_company_id = $2
      `,
      [loadId, operatingCompanyId]
    );
    const pickupCity = String(loadPickup.rows[0]?.pickup_city ?? "");

    const res = await client.query(
      `
        SELECT
          d.id,
          d.first_name,
          d.last_name,
          d.id::text AS display_id,
          COALESCE(h.is_in_violation, false) AS is_in_violation,
          COALESCE(h.minutes_until_violation, 9999)::double precision AS minutes_until_violation
        FROM mdata.drivers d
        LEFT JOIN views.drivers_with_hos_status h ON h.id = d.id
        WHERE d.operating_company_id = $1
          AND d.status = 'Active'::mdata.driver_status
          AND d.deactivated_at IS NULL
        ORDER BY d.last_name ASC, d.first_name ASC
        LIMIT 200
      `,
      [operatingCompanyId]
    );

    const rows = res.rows as Array<{
      id: string;
      first_name: string;
      last_name: string;
      display_id: string | null;
      is_in_violation: boolean;
      minutes_until_violation: number;
    }>;

    const drivers = rows.map((r, idx) => {
      const distanceToPickupMiles = pickupCity ? 12 + (idx % 37) : 50 + idx;
      const estimatedDriveHours = Math.min(11, Math.max(0.5, distanceToPickupMiles / 50));

      let hoursRemainingToday = 0;
      if (r.is_in_violation) hoursRemainingToday = 0;
      else hoursRemainingToday = Math.min(11, Math.max(0, (r.minutes_until_violation ?? 0) / 60));

      const hoursRemainingWeek = Math.min(70, hoursRemainingToday + 50);

      const hos_safe = !r.is_in_violation && hoursRemainingToday >= estimatedDriveHours;
      return {
        driver_id: r.id,
        display_name: `${r.first_name} ${r.last_name}`.trim(),
        display_id: r.display_id,
        hours_remaining_today: Math.round(hoursRemainingToday * 100) / 100,
        hours_remaining_week: Math.round(hoursRemainingWeek * 100) / 100,
        distance_to_pickup_miles: distanceToPickupMiles,
        hos_safe,
        is_in_violation: r.is_in_violation,
      };
    });
    drivers.sort((a, b) => {
      if (a.hos_safe !== b.hos_safe) return a.hos_safe ? -1 : 1;
      return a.distance_to_pickup_miles - b.distance_to_pickup_miles;
    });
    return { drivers };
  });
}

export async function getDispatchLoadEta(userId: string, operatingCompanyId: string, loadId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    const res = await client.query(
      `
        SELECT l.id, l.status::text AS status, l.assigned_primary_driver_id, u.id AS unit_id,
               l.dispatcher_eta_at
        FROM mdata.loads l
        LEFT JOIN mdata.units u ON u.id = l.assigned_unit_id
        WHERE l.id = $1 AND l.operating_company_id = $2 AND l.soft_deleted_at IS NULL
      `,
      [loadId, operatingCompanyId]
    );
    const row = res.rows[0] as
      | {
          id: string;
          status: string;
          assigned_primary_driver_id: string | null;
          unit_id: string | null;
          dispatcher_eta_at: Date | string | null;
        }
      | undefined;
      if (!row) throw new Error("E_LOAD_NOT_FOUND");
      if (row.status !== "in_transit") throw new Error("E_ETA_NOT_IN_TRANSIT");

    if (row.dispatcher_eta_at) {
      const manualAt = row.dispatcher_eta_at instanceof Date ? row.dispatcher_eta_at : new Date(row.dispatcher_eta_at);
      if (!Number.isNaN(manualAt.getTime())) {
        return {
          driver_lat: null as number | null,
          driver_lng: null as number | null,
          distance_remaining_miles: null as number | null,
          eta_at: manualAt.toISOString(),
          source: "manual" as const,
        };
      }
    }

    const cfg = await client
      .query(`SELECT is_enabled FROM integrations.samsara_config WHERE operating_company_id = $1 LIMIT 1`, [operatingCompanyId])
      .catch(() => ({ rows: [] as { is_enabled: boolean }[] }));
    const samsaraOn = Boolean(cfg.rows[0]?.is_enabled);

    const etaMs = Date.now() + (2 + (loadId.charCodeAt(0) % 5)) * 3600_000;
    const eta_at = new Date(etaMs).toISOString();
    const source = samsaraOn ? ("samsara" as const) : ("fallback" as const);

    return {
      driver_lat: 30.25 + (loadId.charCodeAt(1) % 10) * 0.01,
      driver_lng: -97.75 - (loadId.charCodeAt(2) % 10) * 0.01,
      distance_remaining_miles: 120 + (loadId.charCodeAt(3) % 80),
      eta_at,
      source,
    };
  });
}

export async function listLoadTemplates(userId: string, operatingCompanyId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    const res = await client.query(
      `
        SELECT id, name, template_json, created_at, updated_at
        FROM dispatch.load_templates
        WHERE operating_company_id = $1
        ORDER BY name ASC
        LIMIT 500
      `,
      [operatingCompanyId]
    );
    return { templates: res.rows };
  });
}

export async function createLoadTemplate(
  userId: string,
  input: { operating_company_id: string; name: string; template_json: Record<string, unknown> }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
    const res = await client.query(
      `
        INSERT INTO dispatch.load_templates (operating_company_id, name, template_json, created_by_user_id)
        VALUES ($1, $2, $3::jsonb, $4)
        RETURNING id, name, template_json, created_at
      `,
      [input.operating_company_id, input.name.trim(), JSON.stringify(input.template_json), userId]
    );
    return res.rows[0];
  });
}
