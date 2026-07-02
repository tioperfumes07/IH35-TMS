import type { FastifyInstance, FastifyReply } from "fastify";
import { withCurrentUser } from "../auth/db.js";
import { parseSamsaraVehiclePayload } from "../mdata/unit-aggregate.service.js";
import { getCurrentClocks } from "../telematics/hos-clocks.service.js";
import { requireDriverSession } from "./auth.js";

type DutyStatus = "driving" | "on_duty_not_driving" | "off_duty" | "sleeper_berth";

function nowIso() {
  return new Date().toISOString();
}

function inferDutyStatusFromEvent(value: string | null): DutyStatus {
  if (value === "driving") return "driving";
  if (value === "on_duty_not_driving" || value === "yard_moves") return "on_duty_not_driving";
  if (value === "sleeper") return "sleeper_berth";
  return "off_duty";
}

function sendForbidden(reply: FastifyReply) {
  return reply.code(403).send({ error: "forbidden" });
}

async function resolveDriverCompany(
  client: { query: <R>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  driverId: string
) {
  const companyRes = await client.query<{ operating_company_id: string }>(
    `
      SELECT operating_company_id::text
      FROM mdata.drivers
      WHERE id = $1::uuid
      LIMIT 1
    `,
    [driverId]
  );
  return companyRes.rows[0]?.operating_company_id ?? null;
}

export async function registerDriverPwaLiveRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver-pwa/hos-clocks", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    if (!driver || !req.user) return sendForbidden(reply);

    const snapshot = await withCurrentUser(req.user.uuid, async (client) => {
      const operatingCompanyId = await resolveDriverCompany(client, driver.id);
      if (!operatingCompanyId) return null;
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

      const clocks = await getCurrentClocks(client, operatingCompanyId, driver.id);
      const latestEventRes = await client.query<{ duty_status: string | null }>(
        `
          SELECT duty_status
          FROM hos.duty_status_events
          WHERE operating_company_id = $1::uuid
            AND driver_id = $2::uuid
          ORDER BY started_at DESC
          LIMIT 1
        `,
        [operatingCompanyId, driver.id]
      );
      const dutyStatus = inferDutyStatusFromEvent(latestEventRes.rows[0]?.duty_status ?? null);

      const unitRes = await client.query<{ raw_payload: unknown }>(
        `
          SELECT sv.raw_payload
          FROM telematics.vehicle_driver_assignments vda
          JOIN mdata.units u ON u.id = vda.unit_id
          LEFT JOIN integrations.samsara_vehicles sv
            ON sv.samsara_vehicle_id = u.samsara_vehicle_id
           AND sv.operating_company_id = vda.operating_company_id
          WHERE vda.driver_id = $1::uuid
            AND vda.operating_company_id = $2::uuid
            AND vda.ended_at IS NULL
          ORDER BY vda.started_at DESC
          LIMIT 1
        `,
        [driver.id, operatingCompanyId]
      );
      const fuelLevelPct = parseSamsaraVehiclePayload(unitRes.rows[0]?.raw_payload ?? null).fuel_level_pct;

      return {
        duty_status: dutyStatus,
        clocks: [
          { key: "drive", remaining_minutes: clocks.drive_remaining_min, max_minutes: 11 * 60, next_reset_at: clocks.last_reset_at },
          { key: "shift", remaining_minutes: clocks.window_remaining_min, max_minutes: 14 * 60, next_reset_at: clocks.last_reset_at },
          { key: "cycle", remaining_minutes: clocks.cycle_remaining_min, max_minutes: 70 * 60, next_reset_at: null },
          { key: "break", remaining_minutes: clocks.break_remaining_min, max_minutes: 30, next_reset_at: null },
        ],
        last_synced_at: nowIso(),
        fuel_level_pct: fuelLevelPct,
        status: {
          id: driver.id,
          hos_badge_color: clocks.status === "violation" ? "red" : clocks.status === "ok" ? "green" : "yellow",
          is_in_violation: clocks.status === "violation",
          minutes_until_violation: Math.min(
            clocks.drive_remaining_min,
            clocks.window_remaining_min,
            clocks.break_remaining_min,
            clocks.cycle_remaining_min
          ),
        },
      };
    });

    if (!snapshot) return reply.code(404).send({ error: "hos_not_found" });
    return snapshot;
  });

  app.get("/api/v1/driver-pwa/recent-fuel-transactions", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    if (!driver || !req.user) return sendForbidden(reply);

    const rows = await withCurrentUser(req.user.uuid, async (client) => {
      const operatingCompanyId = await resolveDriverCompany(client, driver.id);
      if (!operatingCompanyId) return [];
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

      const res = await client.query<{
        id: string;
        transaction_at: string;
        gallons: string | null;
        total_cost: string;
        location_city: string | null;
        location_state: string | null;
        vendor_name: string | null;
      }>(
        `
          SELECT
            ft.id::text,
            ft.transaction_at::text,
            ft.gallons::text,
            ft.total_cost::text,
            ft.location_city,
            ft.location_state,
            v.vendor_name
          FROM fuel.fuel_transactions ft
          LEFT JOIN mdata.vendors v ON v.id = ft.vendor_id
          WHERE ft.operating_company_id = $1::uuid
            AND ft.driver_id = $2::uuid
            AND ft.archived_at IS NULL
          ORDER BY ft.transaction_at DESC
          LIMIT 5
        `,
        [operatingCompanyId, driver.id]
      );
      return res.rows.map((row) => ({
        id: row.id,
        transaction_at: row.transaction_at,
        gallons: row.gallons !== null ? Number(row.gallons) : null,
        total_cost: Number(row.total_cost),
        location_city: row.location_city,
        location_state: row.location_state,
        vendor_name: row.vendor_name,
      }));
    });

    return { rows };
  });

  app.get("/api/v1/driver-pwa/equipment", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    if (!driver || !req.user) return sendForbidden(reply);

    const payload = await withCurrentUser(req.user.uuid, async (client) => {
      const operatingCompanyId = await resolveDriverCompany(client, driver.id);
      if (!operatingCompanyId) return null;
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

      const truckRes = await client.query<{
        unit_id: string;
        unit_number: string | null;
        vin: string | null;
        make: string | null;
        model: string | null;
        source: string;
      }>(
        `
          SELECT
            u.id::text AS unit_id,
            u.unit_number,
            u.vin,
            u.make,
            u.model,
            vda.source
          FROM telematics.vehicle_driver_assignments vda
          JOIN mdata.units u ON u.id = vda.unit_id
          WHERE vda.driver_id = $1::uuid
            AND vda.operating_company_id = $2::uuid
            AND vda.ended_at IS NULL
          ORDER BY (vda.source = 'samsara_webhook') DESC, vda.is_default DESC, vda.started_at DESC
          LIMIT 1
        `,
        [driver.id, operatingCompanyId]
      );

      const loadUnitRes = await client.query<{ unit_id: string; unit_number: string | null }>(
        `
          SELECT u.id::text AS unit_id, u.unit_number
          FROM mdata.loads l
          JOIN mdata.units u ON u.id = l.assigned_unit_id
          WHERE l.operating_company_id = $1::uuid
            AND (l.assigned_primary_driver_id = $2::uuid OR l.assigned_secondary_driver_id = $2::uuid)
            AND l.soft_deleted_at IS NULL
            AND l.status::text NOT IN ('cancelled', 'closed', 'paid', 'invoiced')
          ORDER BY l.updated_at DESC
          LIMIT 1
        `,
        [operatingCompanyId, driver.id]
      );

      const truck = truckRes.rows[0] ?? (loadUnitRes.rows[0] ? { ...loadUnitRes.rows[0], vin: null, make: null, model: null, source: "load_assignment" } : null);
      const unitId = truck?.unit_id ?? null;

      const trailerRes = unitId
        ? await client.query<{
            equipment_id: string;
            equipment_number: string | null;
            equipment_type: string | null;
          }>(
            `
              SELECT
                e.id::text AS equipment_id,
                e.equipment_number,
                e.equipment_type
              FROM mdata.equipment e
              WHERE (e.owner_company_id = $1::uuid OR e.currently_leased_to_company_id = $1::uuid)
                AND e.current_unit_id = $2::uuid
                AND e.status::text NOT IN ('Sold', 'Lost')
              ORDER BY e.updated_at DESC
              LIMIT 1
            `,
            [operatingCompanyId, unitId]
          )
        : { rows: [] as Array<{ equipment_id: string; equipment_number: string | null; equipment_type: string | null }> };

      return {
        truck: truck
          ? {
              unit_id: truck.unit_id,
              unit_number: truck.unit_number,
              vin: truck.vin,
              make: truck.make,
              model: truck.model,
              assignment_source: truck.source,
            }
          : null,
        trailer: trailerRes.rows[0]
          ? {
              equipment_id: trailerRes.rows[0].equipment_id,
              equipment_number: trailerRes.rows[0].equipment_number,
              equipment_type: trailerRes.rows[0].equipment_type,
            }
          : null,
      };
    });

    if (!payload) return reply.code(404).send({ error: "equipment_not_found" });
    return payload;
  });
}
