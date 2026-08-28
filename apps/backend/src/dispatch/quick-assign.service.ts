import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import type { PoolClient } from "pg";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { enqueueOutboxEvent } from "../outbox/enqueue-outbox-event.js";
import { notifyLoadAssigned } from "../services/push-notification.service.js";
import { emitDispatchSpineEvent } from "./dispatch-spine-emit.js";
import {
  assertDriverQualifiedForLoad,
  DriverNotQualifiedError,
} from "./driver-qualification.service.js";

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

async function resolveCurrentTrailerId(
  client: PoolClient,
  operatingCompanyId: string,
  loadId: string,
) {
  const result = await client.query<{ new_trailer_id: string | null }>(
    `SELECT new_trailer_id::text
       FROM dispatch.load_assignment_history
      WHERE operating_company_id = $1::uuid
        AND load_id = $2::uuid
        AND new_trailer_id IS NOT NULL
      ORDER BY assigned_at DESC, created_at DESC, id DESC
      LIMIT 1`,
    [operatingCompanyId, loadId],
  );
  return result.rows[0]?.new_trailer_id ?? null;
}

export async function quickAssignLoad(
  userId: string,
  role: string,
  input: QuickAssignInput,
) {
  const notifyBox: {
    v: {
      operatingCompanyId: string;
      driverId: string;
      loadId: string;
      loadLabel: string | null;
    } | null;
  } = { v: null };

  const result = await withCurrentUser(userId, async (client) => {
    // ENTITY GATE (MDATA-F09 class). input.operating_company_id is caller-supplied — quicksave.routes.ts
    // passes the request body straight through — and it both SETS the RLS scope and drives every
    // predicate below, so without this the caller chooses the scope RLS enforces. Assert first.
    await assertCompanyMembership(client, userId, input.operating_company_id);
    await client.query(
      "SELECT set_config('app.operating_company_id', $1::text, true)",
      [input.operating_company_id],
    );
    try {
      const loadRes = await client.query(
        `
          SELECT id, operating_company_id, assigned_primary_driver_id, assigned_unit_id, assigned_secondary_driver_id, load_number,
                 COALESCE((quicksave_pending_fields->>'hazmat')::boolean, false) AS is_hazmat
          FROM mdata.loads
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND soft_deleted_at IS NULL
          FOR UPDATE
        `,
        [input.load_id, input.operating_company_id],
      );
      const load = loadRes.rows[0];
      if (!load) throw new Error("E_LOAD_NOT_FOUND");

      // Shared driver-qualification gate (G9-C1 + D3-1): deactivated / archived / expired-CDL /
      // expired-medical are DOT hard-stops, plus the hazmat H-endorsement on a hazmat load. This
      // path previously enforced only unit-block / HOS / drug. Throws → mapped to a 422 by the route.
      const qualBlock = await assertDriverQualifiedForLoad(client, {
        driverId: input.driver_id,
        operatingCompanyId: input.operating_company_id,
        isHazmat: Boolean((load as { is_hazmat?: boolean }).is_hazmat),
      });
      if (qualBlock) throw new DriverNotQualifiedError(qualBlock);

      const warnings: Array<{
        code: string;
        severity: "advisory" | "hard_block";
        message: string;
      }> = [];
      if (input.unit_id) {
        const unit = await client.query(
          `
              -- DISP-F01 — this path already read is_oos straight from mdata.units (below), which is
              -- the only reason quick-assign still blocked out-of-service units while the other three
              -- dispatch paths did not. But WF-050 dispatch-block and WF-044 PM-due were read SOLELY
              -- from views.units_with_dispatch_status, a dead stub on prod (WHERE false, 0 rows), so
              -- those two gates were inert here too — a half-working gate, which is the hardest kind
              -- to notice. Driven from mdata.units with the view LEFT JOINed for its advisory columns.
              SELECT u.id,
                     COALESCE(u.unit_number, v.display_id, u.id::text) AS display_id,
                     COALESCE(u.is_oos, false) AS is_oos,
                     COALESCE(v.is_dispatch_blocked, false) AS is_dispatch_blocked,
                     v.dispatch_block_reason,
                     COALESCE(v.has_open_pm_due_wo, false) AS has_open_pm_due_wo
              FROM mdata.units u
              LEFT JOIN views.units_with_dispatch_status v ON v.id = u.id
              WHERE u.id = $1
                AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $2
                AND u.deactivated_at IS NULL
              LIMIT 1
            `,
          [input.unit_id, input.operating_company_id],
        );
        const row = unit.rows[0];
        if (!row) throw new Error("E_UNIT_NOT_FOUND");
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
            message: String(
              row.dispatch_block_reason ?? "Unit is dispatch-blocked",
            ),
          });
        }
        if (row.is_oos) {
          warnings.push({
            code: "UNIT_OOS",
            severity: "hard_block",
            message: `Unit ${String(row.display_id ?? input.unit_id)} is out of service (OOS) and cannot be assigned.`,
          });
        }
      }

      if (input.trailer_id) {
        const trailer = await client.query<{ id: string }>(
          `SELECT id::text
           FROM mdata.equipment
           WHERE id = $1::uuid
             AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid
             AND deactivated_at IS NULL
           LIMIT 1`,
          [input.trailer_id, input.operating_company_id],
        );
        if (!trailer.rows[0]?.id) throw new Error("E_TRAILER_NOT_FOUND");
      }

      const driver = await client.query(
          `
            SELECT id, display_id, is_in_violation
            FROM views.drivers_with_hos_status
            WHERE id = $1
              AND operating_company_id = $2::uuid
            LIMIT 1
          `,
          [input.driver_id, input.operating_company_id],
        );
      if (driver.rows[0]?.is_in_violation) {
        warnings.push({
          code: "WF038_HOS_VIOLATION",
          severity: "hard_block",
          message: `Driver ${String(driver.rows[0]?.display_id ?? input.driver_id)} is currently in HOS violation.`,
        });
      }

      const latestDrug = await client.query<{ result: string }>(
          `
            SELECT result::text
            FROM safety.drug_test
            WHERE operating_company_id = $1::uuid
              AND driver_id = $2
              AND voided_at IS NULL
            ORDER BY test_date DESC, created_at DESC
            LIMIT 1
          `,
          [input.operating_company_id, input.driver_id],
        );
      const drugResult = String(latestDrug.rows[0]?.result ?? "");
      if (
        ["positive", "refusal", "adulterated", "substituted"].includes(
          drugResult,
        )
      ) {
        warnings.push({
          code: "WF037_DRUG_PROGRAM_BLOCK",
          severity: "hard_block",
          message: `Driver is dispatch-blocked due to latest drug program result: ${drugResult}.`,
        });
      }

      const hardBlocks = warnings.filter((w) => w.severity === "hard_block");
      const acknowledged = new Set(
        (input.acknowledged_warnings ?? []).map((value) => String(value)),
      );
      const allHardBlocksAcknowledged = hardBlocks.every((warning) =>
        acknowledged.has(warning.code),
      );
      if (
        hardBlocks.length > 0 &&
        (!isOwner(role) || !allHardBlocksAcknowledged)
      ) {
        const oosBlock = hardBlocks.find(
          (w) => w.code === "UNIT_OOS" && !acknowledged.has(w.code),
        );
        if (oosBlock) throw new Error(`E_UNIT_OOS:${oosBlock.message}`);
        const dvirBlock = hardBlocks.find(
          (w) => w.code === "WF050_UNIT_BLOCK" && !acknowledged.has(w.code),
        );
        if (dvirBlock)
          throw new Error(`E_UNIT_DISPATCH_BLOCKED:${dvirBlock.message}`);
        throw new Error("E_HARD_BLOCKS_PRESENT");
      }

      const pendingFields: string[] = [];
      if (!input.unit_id) pendingFields.push("assigned_unit_id");
      if (!input.trailer_id) pendingFields.push("assigned_secondary_driver_id");

      // DISP-1 corruption fix: the trailer is an mdata.equipment id and must NOT be written into
      // assigned_secondary_driver_id — that is the CO-DRIVER column (FK -> mdata.drivers, migration 0034).
      // The trailer's only real sink is dispatch.load_assignment_history.new_trailer_id (recorded below).
      // The pending-fields tracking key intentionally keeps its legacy "assigned_secondary_driver_id"
      // label so the frontend draft/complete contract is unchanged.
      await client.query(
        `
          UPDATE mdata.loads
          SET assigned_primary_driver_id = $2,
              assigned_unit_id = COALESCE($3, assigned_unit_id),
              is_quicksave_draft = $4,
              quicksave_pending_fields = $5::jsonb,
              quicksave_completed_at = CASE WHEN $4 = false THEN now() ELSE NULL END,
              updated_at = now()
          WHERE id = $1
        `,
        [
          input.load_id,
          input.driver_id,
          input.unit_id ?? null,
          pendingFields.length > 0,
          pendingFields.length > 0 ? JSON.stringify(pendingFields) : null,
        ],
      );

      const previousTrailerId = await resolveCurrentTrailerId(
        client,
        input.operating_company_id,
        input.load_id,
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
          previousTrailerId,
          input.trailer_id ?? null,
          userId,
          JSON.stringify([...acknowledged]),
        ],
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
        "P5-F3-QUICKSAVE",
      );

      // The spine is the canonical reverse/audit feed for dispatch mutations. Keep it in the same
      // transaction as the load + assignment-history write: a committed assignment without this
      // event is a silent partial success and cannot be repaired reliably by a detached callback.
      await emitDispatchSpineEvent(client, {
        operating_company_id: input.operating_company_id,
        actor_user_id: userId,
        event_type: "load.assigned_to_driver",
        load_id: input.load_id,
        payload: {
          driver_id: input.driver_id,
          unit_id: input.unit_id ?? null,
          trailer_id: input.trailer_id ?? null,
        },
      });

      const prevDriver =
        (load as { assigned_primary_driver_id?: string | null })
          .assigned_primary_driver_id ?? null;
      if (input.driver_id !== prevDriver) {
        // The driver-facing notice is part of the assignment write, not a best-effort callback.
        // Persist it on the canonical drained outbox in this transaction so commit means the new
        // driver will either receive an in-app notice or the outbox will retain a visible failure.
        await enqueueOutboxEvent(
          client,
          "load.assigned_to_driver",
          { aggregate_type: "load", aggregate_id: input.load_id },
          {
            operating_company_id: input.operating_company_id,
            load_id: input.load_id,
            load_number:
              (load as { load_number?: string | null }).load_number ?? null,
            driver_id: input.driver_id,
          },
        );
        notifyBox.v = {
          operatingCompanyId: input.operating_company_id,
          driverId: input.driver_id,
          loadId: input.load_id,
          loadLabel:
            (load as { load_number?: string | null }).load_number ?? null,
        };
      }
      return {
        load_id: input.load_id,
        warnings,
        pending_fields: pendingFields,
      };
    } catch (error) {
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
  input: {
    operating_company_id: string;
    load_id: string;
    fields: Record<string, unknown>;
  },
) {
  return withCurrentUser(userId, async (client) => {
    // ENTITY GATE (MDATA-F09 class) — input.operating_company_id is caller-supplied and sets the RLS scope.
    await assertCompanyMembership(client, userId, input.operating_company_id);
    try {
      await client.query(
        "SELECT set_config('app.operating_company_id', $1::text, true)",
        [input.operating_company_id],
      );
      const beforeRes = await client.query<{ assigned_unit_id: string | null }>(
        `SELECT assigned_unit_id::text
           FROM mdata.loads
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND soft_deleted_at IS NULL
          FOR UPDATE`,
        [input.load_id, input.operating_company_id],
      );
      const before = beforeRes.rows[0];
      if (!before) throw new Error("E_LOAD_NOT_FOUND");
      const previousTrailerId = await resolveCurrentTrailerId(
        client,
        input.operating_company_id,
        input.load_id,
      );

      const patch = input.fields ?? {};
      const unitId =
        typeof patch.assigned_unit_id === "string"
          ? patch.assigned_unit_id
          : null;
      const trailerId =
        typeof patch.assigned_secondary_driver_id === "string"
          ? patch.assigned_secondary_driver_id
          : null;
      if (unitId) {
        const unitRes = await client.query<{
          id: string;
          is_oos: boolean;
          display_id: string;
        }>(
          `
          SELECT id::text,
                 COALESCE(is_oos, false) AS is_oos,
                 COALESCE(unit_number, id::text) AS display_id
          FROM mdata.units
          WHERE id = $1::uuid
            AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid
            AND deactivated_at IS NULL
          LIMIT 1
        `,
          [unitId, input.operating_company_id],
        );
        if (!unitRes.rows[0]?.id) throw new Error("E_UNIT_NOT_FOUND");
        if (unitRes.rows[0].is_oos) {
          throw new Error(
            `E_UNIT_OOS:Unit ${unitRes.rows[0].display_id ?? unitId} is out of service (OOS) and cannot be assigned.`,
          );
        }
      }
      let resolvedTrailerId: string | null = null;
      if (trailerId) {
        const trailerRes = await client.query<{ id: string }>(
          `
          SELECT id::text
          FROM mdata.equipment
          WHERE id = $1::uuid
            AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid
            AND deactivated_at IS NULL
          LIMIT 1
        `,
          [trailerId, input.operating_company_id],
        );
        resolvedTrailerId = trailerRes.rows[0]?.id ?? null;
        if (!resolvedTrailerId) throw new Error("E_TRAILER_NOT_FOUND");
      }
      const pendingFields: string[] = [];
      if (!unitId) pendingFields.push("assigned_unit_id");
      if (!trailerId) pendingFields.push("assigned_secondary_driver_id");
      // DISP-1 corruption fix: the "assigned_secondary_driver_id" draft field actually carries a trailer
      // (mdata.equipment) id, so it must NOT be written into assigned_secondary_driver_id (the CO-DRIVER
      // column, FK -> mdata.drivers). Update only the co-driver-safe columns here; the trailer is persisted
      // below on the real link dispatch.load_assignment_history.new_trailer_id.
      const update = await client.query(
        `
        UPDATE mdata.loads
        SET assigned_unit_id = COALESCE($3, assigned_unit_id),
            is_quicksave_draft = $4,
            quicksave_pending_fields = $5::jsonb,
            quicksave_completed_at = CASE WHEN $4 = false THEN now() ELSE quicksave_completed_at END,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2::uuid
        RETURNING id
      `,
        [
          input.load_id,
          input.operating_company_id,
          unitId,
          pendingFields.length > 0,
          pendingFields.length > 0 ? JSON.stringify(pendingFields) : null,
        ],
      );
      if (!update.rows[0]?.id) throw new Error("E_LOAD_NOT_FOUND");

      // Persist unit/trailer changes in the same transaction as the load mutation. A failed history
      // INSERT must never leave the load reassigned without its audit/reverse-link row.
      if (unitId || resolvedTrailerId) {
        await client.query(
          `
            INSERT INTO dispatch.load_assignment_history (
              operating_company_id, load_id, assignment_method,
              previous_unit_id, new_unit_id,
              previous_trailer_id, new_trailer_id,
              assigned_by_user_id, warnings_acknowledged
            )
            VALUES ($1::uuid, $2::uuid, 'quicksave', $3::uuid, $4::uuid, $5::uuid, $6::uuid, $7::uuid, '[]'::jsonb)
          `,
          [
            input.operating_company_id,
            input.load_id,
            before.assigned_unit_id,
            unitId ?? before.assigned_unit_id,
            previousTrailerId,
            resolvedTrailerId ?? previousTrailerId,
            userId,
          ],
        );
      }
      await emitDispatchSpineEvent(client, {
        operating_company_id: input.operating_company_id,
        actor_user_id: userId,
        event_type: "load.quicksave_draft_completed",
        load_id: input.load_id,
        payload: {
          unit_id: unitId ?? before.assigned_unit_id,
          trailer_id: resolvedTrailerId ?? previousTrailerId,
          pending_fields: pendingFields,
        },
      });
      return {
        load_id: input.load_id,
        pending_fields: pendingFields,
        is_quicksave_draft: pendingFields.length > 0,
      };
    } catch (error) {
      throw error;
    }
  });
}

export async function listQuicksaveDrafts(
  userId: string,
  operatingCompanyId: string,
) {
  return withCurrentUser(userId, async (client) => {
    // ENTITY GATE (MDATA-F09 class) — operatingCompanyId is caller-supplied and sets the RLS scope.
    await assertCompanyMembership(client, userId, operatingCompanyId);
    await client.query(
      "SELECT set_config('app.operating_company_id', $1::text, true)",
      [operatingCompanyId],
    );
    const rows = await client.query(
      `
        SELECT id, load_number, assigned_primary_driver_id, assigned_unit_id, quicksave_pending_fields, updated_at
        FROM mdata.loads
        WHERE operating_company_id = $1::uuid
          AND is_quicksave_draft = true
          AND soft_deleted_at IS NULL
        ORDER BY updated_at DESC
      `,
      [operatingCompanyId],
    );
    return { drafts: rows.rows };
  });
}

export async function getAssignmentHistory(
  userId: string,
  operatingCompanyId: string,
  loadId: string,
) {
  return withCurrentUser(userId, async (client) => {
    // ENTITY GATE. operatingCompanyId reaches here straight from the caller's query string
    // (quicksave.routes.ts:165 passes query.data.operating_company_id), and it is used both to SET the
    // RLS scope and as the WHERE predicate — so without this assert the caller picks the scope RLS
    // enforces and RLS authorizes nothing. Same class as MDATA-F09; this one sits in a *.service.ts,
    // where the caller-scoped-GUC guard was not looking.
    await assertCompanyMembership(client, userId, operatingCompanyId);
    await client.query(
      "SELECT set_config('app.operating_company_id', $1::text, true)",
      [operatingCompanyId],
    );

    // Resolve DISPLAY NAMES here rather than shipping raw uuids to the client. `SELECT *` returned
    // previous_driver_id / new_driver_id as bare uuids, so LoadDetailDrawer rendered
    // String(id).slice(0, 8) — an 8-character uuid prefix is not an identification of a human being,
    // and this tab is the audit trail for who a load was taken away from. Joins are entity-scoped:
    // drivers by operating_company_id, units by COALESCE(currently_leased_to_company_id,
    // owner_company_id) because mdata.units has no operating_company_id column.
    const rows = await client.query(
      `
        SELECT h.*,
               NULLIF(TRIM(CONCAT(COALESCE(pd.first_name, ''), ' ', COALESCE(pd.last_name, ''))), '')
                 AS previous_driver_name,
               NULLIF(TRIM(CONCAT(COALESCE(nd.first_name, ''), ' ', COALESCE(nd.last_name, ''))), '')
                 AS new_driver_name,
               pu.unit_number AS previous_unit_number,
               nu.unit_number AS new_unit_number,
               pt.equipment_number AS previous_trailer_number,
               nt.equipment_number AS new_trailer_number,
               -- identity.users has NO first_name/last_name — 0004 creates it with email/role only and
               -- no later migration adds a name — so email is the only human-readable identifier.
               -- The PK column is id: 0004 created it under the old name and
               -- 0005_identity_id_rename.sql renames it to id for the Lucia adapter. Read the MIGRATED
               -- schema, never a single migration file. (Deliberately not naming the pre-rename column
               -- here: verify-sql-read-targets regexes raw source and would read the mention in this
               -- comment as a live column reference — CLS-GUARD-READS-COMMENTS.)
               au.email AS assigned_by_email
        FROM dispatch.load_assignment_history h
        LEFT JOIN mdata.drivers pd
               ON pd.id = h.previous_driver_id
              AND (pd.operating_company_id = h.operating_company_id OR EXISTS (
                SELECT 1 FROM mdata.driver_company_authorizations assignment_previous_driver_dca
                WHERE assignment_previous_driver_dca.driver_id = pd.id
                  AND assignment_previous_driver_dca.company_id = h.operating_company_id
                  AND assignment_previous_driver_dca.is_authorized = true
                  AND assignment_previous_driver_dca.deactivated_at IS NULL
              ))
        LEFT JOIN mdata.drivers nd
               ON nd.id = h.new_driver_id
              AND (nd.operating_company_id = h.operating_company_id OR EXISTS (
                SELECT 1 FROM mdata.driver_company_authorizations assignment_new_driver_dca
                WHERE assignment_new_driver_dca.driver_id = nd.id
                  AND assignment_new_driver_dca.company_id = h.operating_company_id
                  AND assignment_new_driver_dca.is_authorized = true
                  AND assignment_new_driver_dca.deactivated_at IS NULL
              ))
        LEFT JOIN mdata.units pu
               ON pu.id = h.previous_unit_id
              AND COALESCE(pu.currently_leased_to_company_id, pu.owner_company_id) = h.operating_company_id
        LEFT JOIN mdata.units nu
               ON nu.id = h.new_unit_id
              AND COALESCE(nu.currently_leased_to_company_id, nu.owner_company_id) = h.operating_company_id
        LEFT JOIN mdata.equipment pt
               ON pt.id = h.previous_trailer_id
              AND (pt.owner_company_id = h.operating_company_id
                   OR pt.currently_leased_to_company_id = h.operating_company_id)
        LEFT JOIN mdata.equipment nt
               ON nt.id = h.new_trailer_id
              AND (nt.owner_company_id = h.operating_company_id
                   OR nt.currently_leased_to_company_id = h.operating_company_id)
        LEFT JOIN identity.users au
               ON au.id = h.assigned_by_user_id
        WHERE h.operating_company_id = $1::uuid
          AND h.load_id = $2
        ORDER BY h.assigned_at DESC
      `,
      [operatingCompanyId, loadId],
    );
    return { rows: rows.rows };
  });
}
