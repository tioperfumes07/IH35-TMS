import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";

export const dvirItemSchema = z.object({
  key: z.string(),
  status: z.enum(["pass", "minor", "major"]),
  note: z.string(),
  photo_keys: z.array(z.string()).max(5),
});

export const submitDvirBodySchema = z.object({
  load_id: z.string().uuid(),
  mode: z.enum(["pre", "post"]),
  unit: z.string().trim().min(1),
  trailer: z.string().trim().optional().default(""),
  odometer: z.number().int().nonnegative(),
  location: z.string().trim().min(1),
  certified_at: z.string().datetime({ offset: true }),
  signature_data_url: z.string().min(1),
  out_of_service: z.boolean(),
  items: z.array(dvirItemSchema).min(1),
  client_request_id: z.string().trim().min(1).max(128).optional(),
});

export type SubmitDvirBody = z.infer<typeof submitDvirBodySchema>;

type DbClient = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
};

export type SubmitDvirDriverContext = {
  id: string;
};

export type SubmitDvirResult =
  | { success: true; oos_flag: boolean; dvir_submission_id: string; follow_up_wo_id: string | null }
  | { error: "load_not_found" | "forbidden" | "load_missing_unit" | "unit_not_found" | "dvir_insert_failed" | "duplicate_request" };

export async function submitDriverDvir(
  client: DbClient,
  userId: string,
  driver: SubmitDvirDriverContext,
  body: SubmitDvirBody
): Promise<SubmitDvirResult> {
  if (body.client_request_id) {
    const dupRes = await client.query<{ id: string }>(
      `
        SELECT s.id
        FROM safety.dvir_submissions s
        INNER JOIN mdata.loads l ON l.id = $2 AND s.operating_company_id = l.operating_company_id
        WHERE s.client_request_id = $1
        LIMIT 1
      `,
      [body.client_request_id, body.load_id]
    );
    if (dupRes.rows[0]?.id) {
      return { error: "duplicate_request" };
    }
  }

  const loadRes = await client.query<{
    id: string;
    operating_company_id: string;
    assigned_primary_driver_id: string | null;
    assigned_secondary_driver_id: string | null;
    assigned_unit_id: string | null;
  }>(
    `
      SELECT id, operating_company_id, assigned_primary_driver_id, assigned_secondary_driver_id, assigned_unit_id
      FROM mdata.loads
      WHERE id = $1
        AND soft_deleted_at IS NULL
      LIMIT 1
    `,
    [body.load_id]
  );
  const load = loadRes.rows[0] ?? null;
  if (!load) return { error: "load_not_found" };
  if (load.assigned_primary_driver_id !== driver.id && load.assigned_secondary_driver_id !== driver.id) {
    return { error: "forbidden" };
  }
  if (!load.assigned_unit_id) return { error: "load_missing_unit" };

  // Entity scope (USMCA cross-entity leak fix): mdata.units is NOT entity-scoped by RLS, and the
  // driver-typed unit_number can collide across operating companies. Bind the load's operating
  // entity (owner_company_id OR currently_leased_to_company_id — §4: units have no
  // operating_company_id) so a DVIR can never resolve to another carrier's unit.
  const unitRes = await client.query<{ id: string }>(
    `
      SELECT id
      FROM mdata.units
      WHERE (id = $1 OR unit_number = $2)
        AND (owner_company_id = $3 OR currently_leased_to_company_id = $3)
      LIMIT 1
    `,
    [load.assigned_unit_id, body.unit, load.operating_company_id]
  );
  const unit = unitRes.rows[0] ?? null;
  if (!unit) return { error: "unit_not_found" };

  const trailerRes = body.trailer
    ? await client.query<{ id: string }>(
        `
          SELECT id
          FROM mdata.units
          WHERE (id::text = $1 OR unit_number = $1)
            AND (owner_company_id = $2 OR currently_leased_to_company_id = $2)
          LIMIT 1
        `,
        [body.trailer, load.operating_company_id]
      )
    : { rows: [] as Array<{ id: string }> };
  const trailerId = trailerRes.rows[0]?.id ?? null;

  const defectItems = body.items.filter((item) => item.status !== "pass");
  const hasMajor = defectItems.some((item) => item.status === "major");
  const hasAnyDefect = defectItems.length > 0;

  const dvirRes = await client.query<{ id: string }>(
    `
      INSERT INTO safety.dvir_submissions (
        operating_company_id,
        driver_id,
        load_id,
        unit_id,
        trailer_id,
        type,
        odometer,
        location,
        items,
        certified,
        signature_data_url,
        submitted_at,
        has_major_defect,
        has_any_defect,
        client_request_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,true,$10,$11,$12,$13,$14)
      RETURNING id
    `,
    [
      load.operating_company_id,
      driver.id,
      load.id,
      unit.id,
      trailerId,
      body.mode === "pre" ? "pre_trip" : "post_trip",
      body.odometer,
      body.location,
      JSON.stringify(body.items),
      body.signature_data_url,
      body.certified_at,
      hasMajor,
      hasAnyDefect,
      body.client_request_id ?? null,
    ]
  );
  const submissionId = dvirRes.rows[0]?.id;
  if (!submissionId) return { error: "dvir_insert_failed" };

  let followUpWoId: string | null = null;

  if (hasAnyDefect) {
    const displayRes = await client.query<{ display_id: string; sequence: number }>(
      `
        SELECT display_id, sequence
        FROM maintenance.next_wo_display_id($1, 'DV', CURRENT_DATE, $2)
      `,
      [unit.id, load.operating_company_id]
    );
    const display = displayRes.rows[0];
    const defectSummary = defectItems.map((item) => `${item.key} (${item.status})`).join("; ");

    const woRes = await client.query<{ id: string; display_id: string | null }>(
      `
        INSERT INTO maintenance.work_orders (
          operating_company_id,
          wo_type,
          source_type,
          status,
          unit_id,
          driver_id,
          opened_at,
          repair_location,
          description,
          display_id,
          unit_sequence,
          origin,
          wo_title
        )
        VALUES (
          $1,
          'repair',
          'DV',
          'open',
          $2,
          $3,
          now(),
          'in_house',
          $4,
          $5,
          $6,
          'dvir',
          $7
        )
        RETURNING id, display_id
      `,
      [
        load.operating_company_id,
        unit.id,
        driver.id,
        `Auto-created from DVIR ${submissionId}. Defects: ${defectSummary}`,
        display?.display_id ?? null,
        Number(display?.sequence ?? 0) || null,
        `DVIR follow-up — ${body.mode === "pre" ? "pre-trip" : "post-trip"}`,
      ]
    );
    followUpWoId = woRes.rows[0]?.id ?? null;

    if (followUpWoId) {
      await client.query(
        `
          UPDATE safety.dvir_submissions
          SET follow_up_wo_id = $2
          WHERE id = $1
        `,
        [submissionId, followUpWoId]
      );

      for (const item of defectItems) {
        await client.query(
          `
            INSERT INTO safety.dvir_defects (
              operating_company_id,
              dvir_submission_id,
              unit_id,
              item_key,
              severity,
              notes,
              photo_keys,
              follow_up_wo_id
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7::text[],$8)
          `,
          [
            load.operating_company_id,
            submissionId,
            unit.id,
            item.key,
            item.status,
            item.note || "",
            item.photo_keys,
            followUpWoId,
          ]
        );
      }

      await appendCrudAudit(
        client,
        userId,
        "safety.dvir.spawn_wo",
        {
          resource_type: "maintenance.work_orders",
          resource_id: followUpWoId,
          dvir_submission_id: submissionId,
          operating_company_id: load.operating_company_id,
        },
        "info",
        "WF-050"
      );
    }
  }

  if (hasMajor) {
    await client.query(
      `
        SELECT safety.set_unit_dispatch_block($1, $2, $3::uuid, 'dvir')
      `,
      [unit.id, `Major DVIR defect on ${body.mode === "pre" ? "pre-trip" : "post-trip"} inspection`, submissionId]
    );
    await appendCrudAudit(
      client,
      userId,
      "safety.dvir.unit_dispatch_blocked",
      {
        resource_type: "mdata.units",
        resource_id: unit.id,
        dvir_submission_id: submissionId,
      },
      "warning",
      "WF-050"
    );
  }

  await appendCrudAudit(
    client,
    userId,
    "safety.dvir_submitted",
    {
      resource_type: "safety.dvir_submissions",
      resource_id: submissionId,
      has_major_defect: hasMajor,
      follow_up_wo_id: followUpWoId,
    },
    hasMajor ? "warning" : "info",
    "WF-050"
  );

  return {
    success: true,
    oos_flag: hasMajor,
    dvir_submission_id: submissionId,
    follow_up_wo_id: followUpWoId,
  };
}
