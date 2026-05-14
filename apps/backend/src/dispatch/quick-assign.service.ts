import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { notifyLoadAssigned } from "../services/push-notification.service.js";

type QuickAssignInput = {
  operating_company_id: string;
  load_id: string;
  driver_id: string;
  unit_id?: string;
  trailer_id?: string;
  assignment_method?: "quicksave" | "drag_drop";
  acknowledged_warnings?: string[];
};

function isOwner(role: string) {
  return role === "Owner";
}

export async function quickAssignLoad(userId: string, role: string, input: QuickAssignInput) {
  const notifyBox: {
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
      const load = loadRes.rows[0];
      if (!load) throw new Error("E_LOAD_NOT_FOUND");

      const warnings: Array<{ code: string; severity: "advisory" | "hard_block"; message: string }> = [];
      if (input.unit_id) {
        const unit = await client
          .query(
            `
              SELECT id, display_id, is_dispatch_blocked, dispatch_block_reason, has_open_pm_due_wo
              FROM views.units_with_dispatch_status
              WHERE id = $1
                AND operating_company_id = $2
              LIMIT 1
            `,
            [input.unit_id, input.operating_company_id]
          )
          .catch(() => ({ rows: [] as Record<string, unknown>[] }));
        const row = unit.rows[0];
        if (row?.has_open_pm_due_wo) {
          warnings.push({
            code: "WF044_PM_DUE",
            severity: "advisory",
            message: `Unit ${String(row.display_id ?? input.unit_id)} has open PM-due work order(s).`,
          });
        }
        if (row?.is_dispatch_blocked) {
          warnings.push({
            code: "WF050_UNIT_BLOCK",
            severity: "hard_block",
            message: String(row.dispatch_block_reason ?? "Unit is dispatch-blocked"),
          });
        }
      }

      const driver = await client
        .query(
          `
            SELECT id, display_id, is_in_violation
            FROM views.drivers_with_hos_status
            WHERE id = $1
              AND operating_company_id = $2
            LIMIT 1
          `,
          [input.driver_id, input.operating_company_id]
        )
        .catch(() => ({ rows: [] as Record<string, unknown>[] }));
      if (driver.rows[0]?.is_in_violation) {
        warnings.push({
          code: "WF038_HOS_VIOLATION",
          severity: "hard_block",
          message: `Driver ${String(driver.rows[0]?.display_id ?? input.driver_id)} is currently in HOS violation.`,
        });
      }

      const hardBlocks = warnings.filter((w) => w.severity === "hard_block");
      const acknowledged = new Set((input.acknowledged_warnings ?? []).map((value) => String(value)));
      const allHardBlocksAcknowledged = hardBlocks.every((warning) => acknowledged.has(warning.code));
      if (hardBlocks.length > 0 && (!isOwner(role) || !allHardBlocksAcknowledged)) {
        throw new Error("E_HARD_BLOCKS_PRESENT");
      }

      const pendingFields: string[] = [];
      if (!input.unit_id) pendingFields.push("assigned_unit_id");
      if (!input.trailer_id) pendingFields.push("assigned_secondary_driver_id");

      await client.query(
        `
          UPDATE mdata.loads
          SET assigned_primary_driver_id = $2,
              assigned_unit_id = COALESCE($3, assigned_unit_id),
              assigned_secondary_driver_id = $4,
              is_quicksave_draft = $5,
              quicksave_pending_fields = $6::jsonb,
              quicksave_completed_at = CASE WHEN $5 = false THEN now() ELSE NULL END,
              updated_at = now()
          WHERE id = $1
        `,
        [
          input.load_id,
          input.driver_id,
          input.unit_id ?? null,
          input.trailer_id ?? null,
          pendingFields.length > 0,
          pendingFields.length > 0 ? JSON.stringify(pendingFields) : null,
        ]
      );

      await client.query(
        `
          INSERT INTO dispatch.load_assignment_history (
            operating_company_id, load_id, assignment_method,
            previous_driver_id, new_driver_id,
            previous_unit_id, new_unit_id,
            previous_trailer_id, new_trailer_id,
            assigned_by_user_id, warnings_acknowledged
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
        `,
        [
          input.operating_company_id,
          input.load_id,
          input.assignment_method ?? "quicksave",
          load.assigned_primary_driver_id ?? null,
          input.driver_id,
          load.assigned_unit_id ?? null,
          input.unit_id ?? load.assigned_unit_id ?? null,
          load.assigned_secondary_driver_id ?? null,
          input.trailer_id ?? null,
          userId,
          JSON.stringify([...acknowledged]),
        ]
      );

      await appendCrudAudit(
        client,
        userId,
        "dispatch.load.quick_assigned",
        {
          resource_type: "mdata.loads",
          resource_id: input.load_id,
          operating_company_id: input.operating_company_id,
          assignment_method: input.assignment_method ?? "quicksave",
          warnings,
          pending_fields: pendingFields,
        },
        "info",
        "P5-F3-QUICKSAVE"
      );

      await client.query("COMMIT");
      const prevDriver = (load as { assigned_primary_driver_id?: string | null }).assigned_primary_driver_id ?? null;
      if (input.driver_id !== prevDriver) {
        notifyBox.v = {
          operatingCompanyId: input.operating_company_id,
          driverId: input.driver_id,
          loadId: input.load_id,
          loadLabel: (load as { load_number?: string | null }).load_number ?? null,
        };
      }
      return { load_id: input.load_id, warnings, pending_fields: pendingFields };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  if (notifyBox.v) {
    void notifyLoadAssigned({
      operatingCompanyId: notifyBox.v.operatingCompanyId,
      driverId: notifyBox.v.driverId,
      loadId: notifyBox.v.loadId,
      loadLabel: notifyBox.v.loadLabel,
    }).catch(() => undefined);
  }

  return result;
}

export async function completeQuicksaveDraft(
  userId: string,
  input: { operating_company_id: string; load_id: string; fields: Record<string, unknown> }
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${input.operating_company_id}'`);
    const patch = input.fields ?? {};
    const unitId = typeof patch.assigned_unit_id === "string" ? patch.assigned_unit_id : null;
    const trailerId = typeof patch.assigned_secondary_driver_id === "string" ? patch.assigned_secondary_driver_id : null;
    const pendingFields: string[] = [];
    if (!unitId) pendingFields.push("assigned_unit_id");
    if (!trailerId) pendingFields.push("assigned_secondary_driver_id");
    const update = await client.query(
      `
        UPDATE mdata.loads
        SET assigned_unit_id = COALESCE($3, assigned_unit_id),
            assigned_secondary_driver_id = COALESCE($4, assigned_secondary_driver_id),
            is_quicksave_draft = $5,
            quicksave_pending_fields = $6::jsonb,
            quicksave_completed_at = CASE WHEN $5 = false THEN now() ELSE quicksave_completed_at END,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
        RETURNING id
      `,
      [
        input.load_id,
        input.operating_company_id,
        unitId,
        trailerId,
        pendingFields.length > 0,
        pendingFields.length > 0 ? JSON.stringify(pendingFields) : null,
      ]
    );
    if (!update.rows[0]?.id) throw new Error("E_LOAD_NOT_FOUND");
    return { load_id: input.load_id, pending_fields: pendingFields, is_quicksave_draft: pendingFields.length > 0 };
  });
}

export async function listQuicksaveDrafts(userId: string, operatingCompanyId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    const rows = await client.query(
      `
        SELECT id, load_number, assigned_primary_driver_id, assigned_unit_id, quicksave_pending_fields, updated_at
        FROM mdata.loads
        WHERE operating_company_id = $1
          AND is_quicksave_draft = true
          AND soft_deleted_at IS NULL
        ORDER BY updated_at DESC
      `,
      [operatingCompanyId]
    );
    return { drafts: rows.rows };
  });
}

export async function getAssignmentHistory(userId: string, operatingCompanyId: string, loadId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    const rows = await client.query(
      `
        SELECT *
        FROM dispatch.load_assignment_history
        WHERE operating_company_id = $1
          AND load_id = $2
        ORDER BY assigned_at DESC
      `,
      [operatingCompanyId, loadId]
    );
    return { rows: rows.rows };
  });
}
