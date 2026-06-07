import type { PoolClient } from "pg";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";

type LoadRow = {
  id: string;
  operating_company_id: string;
  assigned_primary_driver_id: string | null;
  assigned_unit_id: string | null;
  assigned_secondary_driver_id: string | null;
  load_number: string | null;
};

async function fetchLoadForUpdate(client: PoolClient, loadId: string, operatingCompanyId: string): Promise<LoadRow | null> {
  const res = await client.query<LoadRow>(
    `
      SELECT id, operating_company_id, assigned_primary_driver_id, assigned_unit_id, assigned_secondary_driver_id, load_number
      FROM mdata.loads
      WHERE id = $1
        AND operating_company_id = $2
        AND soft_deleted_at IS NULL
      FOR UPDATE
    `,
    [loadId, operatingCompanyId]
  );
  return res.rows[0] ?? null;
}

async function assertUnitAvailable(client: PoolClient, unitId: string, operatingCompanyId: string) {
  const res = await client.query<{ id: string; is_dispatch_blocked: boolean; dispatch_block_reason: string | null }>(
    `
      SELECT id::text, COALESCE(is_dispatch_blocked, false) AS is_dispatch_blocked, dispatch_block_reason
      FROM views.units_with_dispatch_status
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1
    `,
    [unitId, operatingCompanyId]
  );
  const row = res.rows[0];
  if (!row) throw new Error("E_VALIDATION_UNIT_UNAVAILABLE");
  if (row.is_dispatch_blocked) {
    throw new Error(`E_VALIDATION_UNIT_UNAVAILABLE:${row.dispatch_block_reason ?? "dispatch blocked"}`);
  }
  return row.id;
}

async function assertTrailerAvailable(client: PoolClient, trailerId: string, operatingCompanyId: string) {
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM mdata.units
      WHERE id = $1::uuid
        AND equipment_kind = 'trailer'
        AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
      LIMIT 1
    `,
    [trailerId, operatingCompanyId]
  );
  if (!res.rows[0]) throw new Error("E_VALIDATION_TRAILER_UNAVAILABLE");
  return res.rows[0].id;
}

async function assertDriverActive(client: PoolClient, driverId: string, operatingCompanyId: string) {
  const res = await client.query<{ id: string; status: string; is_in_violation: boolean }>(
    `
      SELECT d.id::text, d.status::text AS status, COALESCE(dhs.is_in_violation, false) AS is_in_violation
      FROM mdata.drivers d
      LEFT JOIN views.drivers_with_hos_status dhs ON dhs.id = d.id
      WHERE d.id = $1::uuid
        AND (
          d.operating_company_id = $2::uuid
          OR EXISTS (
            SELECT 1 FROM mdata.driver_company_authorizations dca
            WHERE dca.driver_id = d.id AND dca.company_id = $2::uuid AND dca.is_authorized = true AND dca.deactivated_at IS NULL
          )
        )
      LIMIT 1
    `,
    [driverId, operatingCompanyId]
  );
  const row = res.rows[0];
  if (!row || row.status !== "Active") throw new Error("E_VALIDATION_DRIVER_INACTIVE");
  if (row.is_in_violation) throw new Error("E_VALIDATION_DRIVER_INACTIVE:WF-038 HOS violation");
  return row.id;
}

async function recordAssignment(
  client: PoolClient,
  input: {
    operating_company_id: string;
    load_id: string;
    method: string;
    previous_driver_id: string | null;
    new_driver_id: string | null;
    previous_unit_id: string | null;
    new_unit_id: string | null;
    previous_trailer_id: string | null;
    new_trailer_id: string | null;
    user_id: string;
  }
) {
  await client.query(
    `
      INSERT INTO dispatch.load_assignment_history (
        operating_company_id, load_id, assignment_method,
        previous_driver_id, new_driver_id,
        previous_unit_id, new_unit_id,
        previous_trailer_id, new_trailer_id,
        assigned_by_user_id, warnings_acknowledged
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'[]'::jsonb)
    `,
    [
      input.operating_company_id,
      input.load_id,
      input.method,
      input.previous_driver_id,
      input.new_driver_id,
      input.previous_unit_id,
      input.new_unit_id,
      input.previous_trailer_id,
      input.new_trailer_id,
      input.user_id,
    ]
  );
}

export async function reassignUnit(
  userId: string,
  input: { operating_company_id: string; load_uuid: string; unit_uuid: string }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    await client.query("BEGIN");
    try {
      const load = await fetchLoadForUpdate(client, input.load_uuid, input.operating_company_id);
      if (!load) throw new Error("E_LOAD_NOT_FOUND");
      await assertUnitAvailable(client, input.unit_uuid, input.operating_company_id);

      await client.query(
        `UPDATE mdata.loads SET assigned_unit_id = $2, updated_at = now() WHERE id = $1`,
        [input.load_uuid, input.unit_uuid]
      );

      await recordAssignment(client, {
        operating_company_id: input.operating_company_id,
        load_id: input.load_uuid,
        method: "inline_quicksave_unit",
        previous_driver_id: load.assigned_primary_driver_id,
        new_driver_id: load.assigned_primary_driver_id,
        previous_unit_id: load.assigned_unit_id,
        new_unit_id: input.unit_uuid,
        previous_trailer_id: load.assigned_secondary_driver_id,
        new_trailer_id: load.assigned_secondary_driver_id,
        user_id: userId,
      });

      await appendCrudAudit(client, userId, "dispatch.load.assign_unit", {
        resource_type: "mdata.loads",
        resource_id: input.load_uuid,
        operating_company_id: input.operating_company_id,
        prior_value: load.assigned_unit_id,
        new_value: input.unit_uuid,
      });

      await client.query("COMMIT");
      return {
        load_id: input.load_uuid,
        assigned_unit_id: input.unit_uuid,
        load_number: load.load_number,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function reassignTrailer(
  userId: string,
  input: { operating_company_id: string; load_uuid: string; trailer_uuid: string }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    await client.query("BEGIN");
    try {
      const load = await fetchLoadForUpdate(client, input.load_uuid, input.operating_company_id);
      if (!load) throw new Error("E_LOAD_NOT_FOUND");
      await assertTrailerAvailable(client, input.trailer_uuid, input.operating_company_id);

      await client.query(
        `UPDATE mdata.loads SET assigned_secondary_driver_id = $2, updated_at = now() WHERE id = $1`,
        [input.load_uuid, input.trailer_uuid]
      );

      await recordAssignment(client, {
        operating_company_id: input.operating_company_id,
        load_id: input.load_uuid,
        method: "inline_quicksave_trailer",
        previous_driver_id: load.assigned_primary_driver_id,
        new_driver_id: load.assigned_primary_driver_id,
        previous_unit_id: load.assigned_unit_id,
        new_unit_id: load.assigned_unit_id,
        previous_trailer_id: load.assigned_secondary_driver_id,
        new_trailer_id: input.trailer_uuid,
        user_id: userId,
      });

      await appendCrudAudit(client, userId, "dispatch.load.assign_trailer", {
        resource_type: "mdata.loads",
        resource_id: input.load_uuid,
        operating_company_id: input.operating_company_id,
        prior_value: load.assigned_secondary_driver_id,
        new_value: input.trailer_uuid,
      });

      await client.query("COMMIT");
      return {
        load_id: input.load_uuid,
        trailer_uuid: input.trailer_uuid,
        load_number: load.load_number,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function reassignDriver(
  userId: string,
  input: { operating_company_id: string; load_uuid: string; driver_uuid: string }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);
    await client.query("BEGIN");
    try {
      const load = await fetchLoadForUpdate(client, input.load_uuid, input.operating_company_id);
      if (!load) throw new Error("E_LOAD_NOT_FOUND");
      await assertDriverActive(client, input.driver_uuid, input.operating_company_id);

      await client.query(
        `UPDATE mdata.loads SET assigned_primary_driver_id = $2, updated_at = now() WHERE id = $1`,
        [input.load_uuid, input.driver_uuid]
      );

      await recordAssignment(client, {
        operating_company_id: input.operating_company_id,
        load_id: input.load_uuid,
        method: "inline_quicksave_driver",
        previous_driver_id: load.assigned_primary_driver_id,
        new_driver_id: input.driver_uuid,
        previous_unit_id: load.assigned_unit_id,
        new_unit_id: load.assigned_unit_id,
        previous_trailer_id: load.assigned_secondary_driver_id,
        new_trailer_id: load.assigned_secondary_driver_id,
        user_id: userId,
      });

      await appendCrudAudit(client, userId, "dispatch.load.assign_driver", {
        resource_type: "mdata.loads",
        resource_id: input.load_uuid,
        operating_company_id: input.operating_company_id,
        prior_value: load.assigned_primary_driver_id,
        new_value: input.driver_uuid,
      });

      await client.query("COMMIT");
      return {
        load_id: input.load_uuid,
        assigned_primary_driver_id: input.driver_uuid,
        load_number: load.load_number,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
