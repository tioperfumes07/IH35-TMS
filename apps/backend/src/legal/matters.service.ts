import crypto from "node:crypto";
import { z } from "zod";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { generatePresignedDownloadUrl, getR2BucketName, isR2Configured } from "../storage/r2-client.js";

export type QueryableClient = {
  query: (query: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

let r2UploadClientInstance: S3Client | null | undefined;

function getR2UploadClient(): S3Client | null {
  if (r2UploadClientInstance !== undefined) {
    return r2UploadClientInstance;
  }
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey) {
    r2UploadClientInstance = null;
    return r2UploadClientInstance;
  }
  r2UploadClientInstance = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return r2UploadClientInstance;
}

export const matterCreateSchema = z.object({
  matter_number: z.string().trim().min(2).max(120),
  type: z.enum(["lawsuit", "claim", "demand_letter", "settlement", "regulatory", "other"]),
  status: z
    .enum(["open", "investigating", "litigation", "settled", "dismissed", "judgment", "closed"])
    .optional(),
  severity: z.enum(["low", "medium", "high", "critical"]).optional(),
  our_role: z.enum(["defendant", "plaintiff", "third_party", "other"]).optional(),
  opposing_party: z.string().trim().max(500).optional(),
  case_number: z.string().trim().max(200).optional(),
  court: z.string().trim().max(500).optional(),
  description: z.string().trim().max(20_000).optional(),
  internal_notes: z.string().trim().max(20_000).optional(),
  amount_claimed_against_us: z.number().nonnegative().optional().nullable(),
  amount_we_seek: z.number().nonnegative().optional().nullable(),
  financial_reserve_cents: z.number().int().nonnegative().optional().nullable(),
  next_hearing_date: z.string().trim().optional().nullable(),
  statute_of_limitations_at: z.string().trim().optional().nullable(),
  attorney_name: z.string().trim().max(200).optional(),
  attorney_firm: z.string().trim().max(200).optional(),
  attorney_phone: z.string().trim().max(50).optional(),
  attorney_email: z.string().trim().email().optional().nullable(),
  related_user_id: z.string().uuid().optional().nullable(),
  related_driver_id: z.string().uuid().optional().nullable(),
  insurance_claim_id: z.string().uuid().optional().nullable(),
  insurance_lawsuit_id: z.string().uuid().optional().nullable(),
  incident_id: z.string().uuid().optional().nullable(),
  unit_id: z.string().uuid().optional().nullable(),
  // Trailers live in mdata.equipment, NOT mdata.units - a separate key space, so a separate column.
  equipment_id: z.string().uuid().optional().nullable(),
});

export const matterUpdateSchema = matterCreateSchema
  .partial()
  .omit({ matter_number: true })
  .extend({
    // Close is exclusively via closeMatter (outcome_summary + closed_at + matter_closed).
    status: z.enum(["open", "investigating", "litigation", "settled", "dismissed", "judgment"]).optional(),
    // Allow intentional clears on update (empty string / null).
    opposing_party: z.string().trim().max(500).optional().nullable(),
    case_number: z.string().trim().max(200).optional().nullable(),
    court: z.string().trim().max(500).optional().nullable(),
    description: z.string().trim().max(20_000).optional().nullable(),
    internal_notes: z.string().trim().max(20_000).optional().nullable(),
    attorney_name: z.string().trim().max(200).optional().nullable(),
    attorney_firm: z.string().trim().max(200).optional().nullable(),
    attorney_phone: z.string().trim().max(50).optional().nullable(),
  });

export const matterEventSchema = z.object({
  event_type: z.string().trim().min(2).max(120),
  event_body: z.record(z.string(), z.unknown()).optional(),
});

export const matterDeadlineSchema = z.object({
  deadline_type: z.enum(["statute_of_limitations", "response", "hearing", "filing", "other"]),
  title: z.string().trim().min(2).max(500),
  deadline_at: z.string().trim().min(4),
  reminder_offset_days: z.number().int().min(0).max(365).optional(),
  reminder_recipients: z.array(z.string().email()).default([]),
});

export const closeMatterSchema = z.object({
  outcome_summary: z.string().trim().min(10).max(10_000),
});

// Roles allowed to READ legal-matters (litigation data — office staff only, never drivers/portal).
// Owner + Administrator at minimum; the remaining office roles preserve existing access.
export const LEGAL_MATTERS_READ_ROLES = [
  "Owner",
  "Administrator",
  "Manager",
  "Accountant",
  "Dispatcher",
  "Safety",
  "Mechanic",
] as const;

// Roles allowed to WRITE/manage legal-matters (create/update/close/documents/deadlines).
export const LEGAL_MATTERS_MANAGE_ROLES = ["Owner", "Administrator"] as const;

export function canManageLegalMatters(role: string) {
  return (LEGAL_MATTERS_MANAGE_ROLES as readonly string[]).includes(role);
}

export function canAccessLegalMattersOffice(role: string) {
  return (LEGAL_MATTERS_READ_ROLES as readonly string[]).includes(role);
}

async function setOperatingCompany(client: QueryableClient, operatingCompanyId: string) {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
}

async function assertEquipmentInCompany(
  client: QueryableClient,
  equipmentId: string | null | undefined,
  operatingCompanyId: string,
) {
  if (!equipmentId) return;
  const result = await client.query(
    `SELECT id
       FROM mdata.equipment
      WHERE id = $1::uuid
        AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid
        AND deactivated_at IS NULL
      LIMIT 1`,
    [equipmentId, operatingCompanyId],
  );
  if (!result.rows[0]) {
    throw Object.assign(new Error("linked_entity_not_in_operating_company"), {
      code: "linked_entity_not_in_operating_company",
    });
  }
}

async function assertDriverInCompany(
  client: QueryableClient,
  driverId: string | null | undefined,
  operatingCompanyId: string,
) {
  if (!driverId) return;
  const result = await client.query(
    `SELECT id
       FROM mdata.drivers
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND deactivated_at IS NULL
        AND archived_at IS NULL
      LIMIT 1`,
    [driverId, operatingCompanyId],
  );
  if (!result.rows[0]) {
    throw Object.assign(new Error("linked_entity_not_in_operating_company"), {
      code: "linked_entity_not_in_operating_company",
    });
  }
}

async function assertUnitInCompany(
  client: QueryableClient,
  unitId: string | null | undefined,
  operatingCompanyId: string,
) {
  if (!unitId) return;
  const result = await client.query(
    `SELECT id
       FROM mdata.units
      WHERE id = $1::uuid
        AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid
        AND deactivated_at IS NULL
      LIMIT 1`,
    [unitId, operatingCompanyId],
  );
  if (!result.rows[0]) {
    throw Object.assign(new Error("linked_entity_not_in_operating_company"), {
      code: "linked_entity_not_in_operating_company",
    });
  }
}

async function assertInsuranceLawsuitInCompany(
  client: QueryableClient,
  lawsuitId: string | null | undefined,
  operatingCompanyId: string,
) {
  if (!lawsuitId) return;
  const result = await client.query(
    `SELECT id
       FROM insurance.lawsuit
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1`,
    [lawsuitId, operatingCompanyId],
  );
  if (!result.rows[0]) {
    throw Object.assign(new Error("linked_entity_not_in_operating_company"), {
      code: "linked_entity_not_in_operating_company",
    });
  }
}

async function assertInsuranceClaimInCompany(
  client: QueryableClient,
  claimId: string | null | undefined,
  operatingCompanyId: string,
) {
  if (!claimId) return;
  const result = await client.query(
    `SELECT id
       FROM insurance.claim
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
      LIMIT 1`,
    [claimId, operatingCompanyId],
  );
  if (!result.rows[0]) {
    throw Object.assign(new Error("linked_entity_not_in_operating_company"), {
      code: "linked_entity_not_in_operating_company",
    });
  }
}

function severityRankSql() {
  return `CASE m.severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
    ELSE 5
  END`;
}

async function appendMatterEvent(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    matterId: string;
    eventType: string;
    eventBody?: Record<string, unknown>;
    createdByUserId: string;
  }
) {
  await client.query(
    `
      INSERT INTO legal.matter_events (
        operating_company_id,
        matter_id,
        event_type,
        event_body,
        created_by_user_id
      ) VALUES ($1, $2, $3, $4::jsonb, $5)
    `,
    [
      args.operatingCompanyId,
      args.matterId,
      args.eventType,
      JSON.stringify(args.eventBody ?? {}),
      args.createdByUserId,
    ]
  );
}

export async function listMatters(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    status?: string | undefined;
    severity?: string | undefined;
    type?: string | undefined;
    related_driver_id?: string | undefined;
    unit_id?: string | undefined;
    equipment_id?: string | undefined;
    insurance_claim_id?: string | undefined;
    insurance_lawsuit_id?: string | undefined;
    limit?: number | undefined;
    offset?: number | undefined;
    requesterUserId: string;
    requesterRole: string;
  }
) {
  await setOperatingCompany(client, args.operatingCompanyId);
  const values: unknown[] = [args.operatingCompanyId];
  const where: string[] = ["m.operating_company_id = $1::uuid"];
  if (!canManageLegalMatters(args.requesterRole)) {
    values.push(args.requesterUserId);
    where.push(`m.related_user_id = $${values.length}`);
  }
  if (args.status) {
    values.push(args.status);
    where.push(`m.status = $${values.length}`);
  }
  if (args.severity) {
    values.push(args.severity);
    where.push(`m.severity = $${values.length}`);
  }
  if (args.type) {
    values.push(args.type);
    where.push(`m.type = $${values.length}`);
  }
  if (args.related_driver_id) {
    values.push(args.related_driver_id);
    where.push(`m.related_driver_id = $${values.length}`);
  }
  if (args.unit_id) {
    values.push(args.unit_id);
    where.push(`m.unit_id = $${values.length}`);
  }
  if (args.equipment_id) {
    values.push(args.equipment_id);
    where.push(`m.equipment_id = $${values.length}`);
  }
  if (args.insurance_claim_id) {
    values.push(args.insurance_claim_id);
    where.push(`m.insurance_claim_id = $${values.length}`);
  }
  if (args.insurance_lawsuit_id) {
    values.push(args.insurance_lawsuit_id);
    where.push(`m.insurance_lawsuit_id = $${values.length}`);
  }
  const orderRank = severityRankSql();

  // CLS-UUID-LABEL — return DISPLAY NAMES, not bare FKs. The matter payload previously carried only
  // related_driver_id / unit_id / insurance_claim_id / incident_id, so every consumer had nothing to
  // render but the uuid and the detail page fell back to `id.slice(0, 8)`. Patching those call sites
  // only relocates the uuid; the root cause is that the query never resolved a name. Columns verified
  // live on prod (br-fancy-credit-akjnd07a) before writing these joins:
  //   mdata.drivers  -> first_name/last_name (§4: there is NO full_name column)
  //   mdata.units    -> unit_number
  //   insurance.claim -> claim_number  (SINGULAR table: `insurance.claims` DOES NOT EXIST on prod)
  //   safety.accidents -> NOT JOINED. It exists on PROD but is created by NO migration (only referenced
  //     in migration comments as "prod-proven"), so joining it would break any fresh database —
  //     verify:sql-read-targets caught exactly that. The incident link therefore carries a human
  //     label instead of a joined display_id; it still shows no uuid, which is what CLS-UUID-LABEL
  //     requires. The missing migration is a separate, reportable drift finding.
  // LEFT JOINs throughout: a matter with no driver/unit/claim/incident is normal and must still list.
  const displaySelect = `
      NULLIF(CONCAT_WS(' ', d.first_name, d.last_name), '') AS related_driver_name,
      u.unit_number                                          AS unit_number,
      eq.equipment_number                                    AS equipment_number,
      ic.claim_number                                        AS insurance_claim_number,
      lw.case_number                                         AS insurance_lawsuit_case_number`;
  // ENTITY PREDICATE ON THE JOIN ITSELF (verify-mdata-entity-scope). The matter is scoped by
  // `m.operating_company_id = $1` in WHERE, but that does NOT scope what we join TO: a bare `d.id =
  // m.related_driver_id` would happily surface another entity's driver name or unit number if an id
  // ever crossed over. Scoping each join to the MATTER's own company keeps the displayed label in the
  // same entity as the record it describes. mdata.units uses the owner/leased pair, not
  // operating_company_id (that column does not exist on units).
  const displayJoins = `
    LEFT JOIN mdata.drivers   d  ON d.id  = m.related_driver_id
                                AND d.operating_company_id = m.operating_company_id
    LEFT JOIN mdata.units     u  ON u.id  = m.unit_id
                                AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = m.operating_company_id
    LEFT JOIN mdata.equipment eq ON eq.id = m.equipment_id
                                AND COALESCE(eq.currently_leased_to_company_id, eq.owner_company_id) = m.operating_company_id
    LEFT JOIN insurance.claim ic ON ic.id = m.insurance_claim_id
                                AND ic.operating_company_id = m.operating_company_id
    LEFT JOIN insurance.lawsuit lw ON lw.id = m.insurance_lawsuit_id
                                  AND lw.operating_company_id = m.operating_company_id`;

  // CLS-SILENT-CAP inst.1 — this was a bare `LIMIT 500` with no offset and no total, so matter 501
  // simply vanished with nothing in the UI to say so. A cap the caller cannot see is indistinguishable
  // from "there is no more data". Now: caller-controlled limit/offset (bounded), plus the unfiltered
  // total so a consumer can page or honestly report "showing N of M".
  const limit = Math.min(Math.max(args.limit ?? 200, 1), 500);
  const offset = Math.max(args.offset ?? 0, 0);
  values.push(limit, offset);
  const limitIdx = values.length - 1;
  const offsetIdx = values.length;

  const sql = `
    SELECT m.*,${displaySelect},
      (${orderRank}) AS _severity_rank,
      COUNT(*) OVER () AS _total_count
    FROM legal.matters m${displayJoins}
    WHERE ${where.join(" AND ")}
    ORDER BY
      ${orderRank} ASC,
      m.next_hearing_date ASC NULLS LAST,
      m.statute_of_limitations_at ASC NULLS LAST,
      m.matter_number ASC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;
  const res = await client.query(sql, values);
  const total = Number((res.rows[0] as { _total_count?: string } | undefined)?._total_count ?? 0);
  const rows = res.rows.map((row) => {
    const { _severity_rank: _r, _total_count: _t, ...rest } = row as Record<string, unknown>;
    return rest;
  });
  // LEGAL-HEARING-DEADLINES-INVISIBLE-ON-MATTER-AND-LIST: m.next_hearing_date /
  // m.statute_of_limitations_at are standalone scalar columns addMatterDeadlineRow never writes,
  // so a matter with a real, active legal.matter_deadlines row of the matching type still shows
  // "—" on this list. Fall back to the earliest OPEN (completed_at IS NULL) deadline of the
  // matching type — never overwrites an explicit scalar value, only fills a null one.
  const matterIds = rows.map((r) => (r as Record<string, unknown>).id as string).filter(Boolean);
  if (matterIds.length > 0) {
    const dRes = await client.query(
      `
        SELECT DISTINCT ON (matter_id, deadline_type) matter_id, deadline_type, deadline_at
        FROM legal.matter_deadlines
        WHERE matter_id = ANY($1::uuid[])
          AND deadline_type IN ('hearing', 'statute_of_limitations')
          AND completed_at IS NULL
        ORDER BY matter_id, deadline_type, deadline_at ASC
      `,
      [matterIds]
    );
    const earliestByMatter = new Map<string, { hearing?: unknown; statute_of_limitations?: unknown }>();
    for (const d of dRes.rows) {
      const key = String(d.matter_id);
      const entry = earliestByMatter.get(key) ?? {};
      entry[d.deadline_type as "hearing" | "statute_of_limitations"] = d.deadline_at;
      earliestByMatter.set(key, entry);
    }
    for (const row of rows) {
      const r = row as Record<string, unknown>;
      const derived = earliestByMatter.get(String(r.id));
      if (!derived) continue;
      if (r.next_hearing_date == null && derived.hearing != null) r.next_hearing_date = derived.hearing;
      if (r.statute_of_limitations_at == null && derived.statute_of_limitations != null) {
        r.statute_of_limitations_at = derived.statute_of_limitations;
      }
    }
  }
  return { rows, total, limit, offset };
}

export async function getMatter(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    matterId: string;
    requesterUserId: string;
    requesterRole: string;
  }
) {
  await setOperatingCompany(client, args.operatingCompanyId);
  const mRes = await client.query(
    `
      SELECT m.*,
             NULLIF(CONCAT_WS(' ', d.first_name, d.last_name), '') AS related_driver_name,
             u.unit_number                                          AS unit_number,
             eq.equipment_number                                    AS equipment_number,
             ic.claim_number                                        AS insurance_claim_number,
                    lw.case_number                                         AS insurance_lawsuit_case_number
      FROM legal.matters m
      -- CLS-UUID-LABEL — the DETAIL page is where the truncated uuids were rendered, so the same
      -- display joins used by listMatters must exist here too. Fixing only the list query would have
      -- left the actual offending screen unchanged. Same prod-verified columns, same LEFT JOINs.
      -- Same entity predicate as the list query: scope what we join TO, not just the matter row.
      LEFT JOIN mdata.drivers   d  ON d.id  = m.related_driver_id
                                  AND d.operating_company_id = m.operating_company_id
      LEFT JOIN mdata.units     u  ON u.id  = m.unit_id
                                  AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = m.operating_company_id
      LEFT JOIN mdata.equipment eq ON eq.id = m.equipment_id
                                  AND COALESCE(eq.currently_leased_to_company_id, eq.owner_company_id) = m.operating_company_id
      LEFT JOIN insurance.claim ic ON ic.id = m.insurance_claim_id
                                  AND ic.operating_company_id = m.operating_company_id
      LEFT JOIN insurance.lawsuit lw ON lw.id = m.insurance_lawsuit_id
                                    AND lw.operating_company_id = m.operating_company_id
      WHERE m.operating_company_id = $1::uuid AND m.id = $2
      LIMIT 1
    `,
    [args.operatingCompanyId, args.matterId]
  );
  const matter = mRes.rows[0] ?? null;
  if (!matter) return null;
  if (!canManageLegalMatters(args.requesterRole) && String(matter.related_user_id ?? "") !== args.requesterUserId) {
    return null;
  }

  const admin = canManageLegalMatters(args.requesterRole);
  const events = await client.query(
    `
      SELECT *
      FROM legal.matter_events
      WHERE matter_id = $1
      ORDER BY id ASC
      LIMIT 2000
    `,
    [args.matterId]
  );
  const dRes = await client.query(
    `
      SELECT *
      FROM legal.matter_documents
      WHERE matter_id = $1
      ORDER BY created_at DESC
      LIMIT 500
    `,
    [args.matterId]
  );
  const documents = dRes.rows.map((doc) => {
    if (admin || !doc.is_privileged) return doc;
    return {
      id: doc.id,
      matter_id: doc.matter_id,
      title: doc.title,
      is_privileged: true,
      privileged_mask: true,
      created_at: doc.created_at,
    };
  });
  const deadlines = await client.query(
    `
      SELECT *
      FROM legal.matter_deadlines
      WHERE matter_id = $1
      ORDER BY deadline_at ASC
      LIMIT 200
    `,
    [args.matterId]
  );
  // LEGAL-HEARING-DEADLINES-INVISIBLE-ON-MATTER-AND-LIST: same derivation as listMatters — fall
  // back to the earliest OPEN deadline of the matching type when the scalar column was never
  // written by addMatterDeadlineRow. `deadlines.rows` is already ordered by deadline_at ASC, so
  // .find() naturally returns the earliest match.
  const m = matter as Record<string, unknown>;
  if (m.next_hearing_date == null) {
    const earliestHearing = deadlines.rows.find((d) => d.deadline_type === "hearing" && d.completed_at == null);
    if (earliestHearing) m.next_hearing_date = earliestHearing.deadline_at;
  }
  if (m.statute_of_limitations_at == null) {
    const earliestSol = deadlines.rows.find(
      (d) => d.deadline_type === "statute_of_limitations" && d.completed_at == null
    );
    if (earliestSol) m.statute_of_limitations_at = earliestSol.deadline_at;
  }
  return { matter, events: events.rows, documents, deadlines: deadlines.rows };
}

export async function createMatter(
  client: QueryableClient,
  args: { operatingCompanyId: string; actorUserId: string; body: z.infer<typeof matterCreateSchema> }
) {
  const input = matterCreateSchema.parse(args.body);
  await setOperatingCompany(client, args.operatingCompanyId);
  await assertEquipmentInCompany(client, input.equipment_id, args.operatingCompanyId);
  await assertDriverInCompany(client, input.related_driver_id, args.operatingCompanyId);
  await assertUnitInCompany(client, input.unit_id, args.operatingCompanyId);
  await assertInsuranceClaimInCompany(client, input.insurance_claim_id, args.operatingCompanyId);
  await assertInsuranceLawsuitInCompany(client, input.insurance_lawsuit_id, args.operatingCompanyId);
  const ins = await client.query(
    `
      INSERT INTO legal.matters (
        operating_company_id,
        matter_number,
        type,
        status,
        severity,
        our_role,
        opposing_party,
        case_number,
        court,
        description,
        internal_notes,
        amount_claimed_against_us,
        amount_we_seek,
        financial_reserve_cents,
        next_hearing_date,
        statute_of_limitations_at,
        attorney_name,
        attorney_firm,
        attorney_phone,
        attorney_email,
        related_user_id,
        related_driver_id,
        insurance_claim_id,
        insurance_lawsuit_id,
        incident_id,
        unit_id,
        equipment_id,
        created_by_user_id,
        updated_by_user_id
      ) VALUES (
        $1, $2, $3,
        COALESCE($4, 'open'),
        COALESCE($5, 'medium'),
        COALESCE($6, 'defendant'),
        $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22,
        $23, $24, $25, $26, $27,
        $28, $28
      )
      RETURNING *
    `,
    [
      args.operatingCompanyId,
      input.matter_number,
      input.type,
      input.status ?? null,
      input.severity ?? null,
      input.our_role ?? null,
      input.opposing_party ?? null,
      input.case_number ?? null,
      input.court ?? null,
      input.description ?? null,
      input.internal_notes ?? null,
      input.amount_claimed_against_us ?? null,
      input.amount_we_seek ?? null,
      input.financial_reserve_cents ?? null,
      input.next_hearing_date ? input.next_hearing_date.slice(0, 10) : null,
      input.statute_of_limitations_at ? input.statute_of_limitations_at.slice(0, 10) : null,
      input.attorney_name ?? null,
      input.attorney_firm ?? null,
      input.attorney_phone ?? null,
      input.attorney_email ?? null,
      input.related_user_id ?? null,
      input.related_driver_id ?? null,
      input.insurance_claim_id ?? null,
      input.insurance_lawsuit_id ?? null,
      input.incident_id ?? null,
      input.unit_id ?? null,
      input.equipment_id ?? null,
      args.actorUserId,
    ]
  );
  const row = ins.rows[0]!;
  const mid = String(row.id);
  await appendMatterEvent(client, {
    operatingCompanyId: args.operatingCompanyId,
    matterId: mid,
    eventType: "matter_created",
    eventBody: { matter_number: input.matter_number },
    createdByUserId: args.actorUserId,
  });
  await appendCrudAudit(
    client,
    args.actorUserId,
    "legal.matter.created",
    { matter_id: mid, matter_number: input.matter_number, operating_company_id: args.operatingCompanyId },
    "info",
    "P8C-I-LEGAL-MATTERS"
  );
  return row;
}

export async function updateMatter(
  client: QueryableClient,
  args: { operatingCompanyId: string; matterId: string; actorUserId: string; body: z.infer<typeof matterUpdateSchema> }
) {
  const input = matterUpdateSchema.parse(args.body);
  await setOperatingCompany(client, args.operatingCompanyId);
  await assertEquipmentInCompany(client, input.equipment_id, args.operatingCompanyId);
  await assertDriverInCompany(client, input.related_driver_id, args.operatingCompanyId);
  await assertUnitInCompany(client, input.unit_id, args.operatingCompanyId);
  await assertInsuranceClaimInCompany(client, input.insurance_claim_id, args.operatingCompanyId);
  await assertInsuranceLawsuitInCompany(client, input.insurance_lawsuit_id, args.operatingCompanyId);
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  const push = (col: string, val: unknown) => {
    fields.push(`${col} = $${i}`);
    values.push(val);
    i += 1;
  };
  if (input.type !== undefined) push("type", input.type);
  if (input.status !== undefined) push("status", input.status);
  if (input.severity !== undefined) push("severity", input.severity);
  if (input.our_role !== undefined) push("our_role", input.our_role);
  if (input.opposing_party !== undefined) push("opposing_party", input.opposing_party);
  if (input.case_number !== undefined) push("case_number", input.case_number);
  if (input.court !== undefined) push("court", input.court);
  if (input.description !== undefined) push("description", input.description);
  if (input.internal_notes !== undefined) push("internal_notes", input.internal_notes);
  if (input.amount_claimed_against_us !== undefined) push("amount_claimed_against_us", input.amount_claimed_against_us);
  if (input.amount_we_seek !== undefined) push("amount_we_seek", input.amount_we_seek);
  if (input.financial_reserve_cents !== undefined) push("financial_reserve_cents", input.financial_reserve_cents);
  if (input.next_hearing_date !== undefined)
    push("next_hearing_date", input.next_hearing_date ? input.next_hearing_date.slice(0, 10) : null);
  if (input.statute_of_limitations_at !== undefined)
    push("statute_of_limitations_at", input.statute_of_limitations_at ? input.statute_of_limitations_at.slice(0, 10) : null);
  if (input.attorney_name !== undefined) push("attorney_name", input.attorney_name);
  if (input.attorney_firm !== undefined) push("attorney_firm", input.attorney_firm);
  if (input.attorney_phone !== undefined) push("attorney_phone", input.attorney_phone);
  if (input.attorney_email !== undefined) push("attorney_email", input.attorney_email);
  if (input.related_user_id !== undefined) push("related_user_id", input.related_user_id);
  if (input.related_driver_id !== undefined) push("related_driver_id", input.related_driver_id);
  if (input.insurance_claim_id !== undefined) push("insurance_claim_id", input.insurance_claim_id);
  if (input.insurance_lawsuit_id !== undefined) push("insurance_lawsuit_id", input.insurance_lawsuit_id);
  if (input.incident_id !== undefined) push("incident_id", input.incident_id);
  if (input.unit_id !== undefined) push("unit_id", input.unit_id);
  if (input.equipment_id !== undefined) push("equipment_id", input.equipment_id);
  if (fields.length === 0) {
    const cur = await client.query(`SELECT * FROM legal.matters WHERE id = $1 AND operating_company_id = $2::uuid`, [
      args.matterId,
      args.operatingCompanyId,
    ]);
    return cur.rows[0] ?? null;
  }
  push("updated_by_user_id", args.actorUserId);
  values.push(args.matterId, args.operatingCompanyId);
  const res = await client.query(
    `UPDATE legal.matters SET ${fields.join(", ")} WHERE id = $${i} AND operating_company_id = $${i + 1}::uuid RETURNING *`,
    values
  );
  const row = res.rows[0] ?? null;
  if (row) {
    await appendMatterEvent(client, {
      operatingCompanyId: args.operatingCompanyId,
      matterId: args.matterId,
      eventType: "matter_updated",
      eventBody: { fields: Object.keys(input) },
      createdByUserId: args.actorUserId,
    });
    await appendCrudAudit(
      client,
      args.actorUserId,
      "legal.matter.updated",
      { matter_id: args.matterId, operating_company_id: args.operatingCompanyId },
      "info",
      "P8C-I-LEGAL-MATTERS"
    );
  }
  return row;
}

export async function closeMatter(
  client: QueryableClient,
  args: { operatingCompanyId: string; matterId: string; actorUserId: string; body: z.infer<typeof closeMatterSchema> }
) {
  const input = closeMatterSchema.parse(args.body);
  await setOperatingCompany(client, args.operatingCompanyId);
  const cur = await client.query(
    `SELECT * FROM legal.matters WHERE id = $1 AND operating_company_id = $2::uuid`,
    [args.matterId, args.operatingCompanyId]
  );
  const row = cur.rows[0] ?? null;
  if (!row) return null;
  const st = String(row.status ?? "");
  if (!["settled", "dismissed", "judgment"].includes(st)) return { error: "invalid_status_for_close" as const };
  const res = await client.query(
    `
      UPDATE legal.matters
      SET status = 'closed',
          outcome_summary = $3,
          closed_at = now(),
          closed_by_user_id = $4,
          updated_by_user_id = $4
      WHERE id = $1 AND operating_company_id = $2::uuid
      RETURNING *
    `,
    [args.matterId, args.operatingCompanyId, input.outcome_summary, args.actorUserId]
  );
  const updated = res.rows[0]!;
  await appendMatterEvent(client, {
    operatingCompanyId: args.operatingCompanyId,
    matterId: args.matterId,
    eventType: "matter_closed",
    eventBody: { outcome_summary: input.outcome_summary },
    createdByUserId: args.actorUserId,
  });
  await appendCrudAudit(
    client,
    args.actorUserId,
    "legal.matter.closed",
    { matter_id: args.matterId, operating_company_id: args.operatingCompanyId },
    "info",
    "P8C-I-LEGAL-MATTERS"
  );
  return { matter: updated };
}

export async function addMatterEventRow(
  client: QueryableClient,
  args: { operatingCompanyId: string; matterId: string; actorUserId: string; body: z.infer<typeof matterEventSchema> }
) {
  const input = matterEventSchema.parse(args.body);
  await setOperatingCompany(client, args.operatingCompanyId);
  await appendMatterEvent(client, {
    operatingCompanyId: args.operatingCompanyId,
    matterId: args.matterId,
    eventType: input.event_type,
    eventBody: input.event_body ?? {},
    createdByUserId: args.actorUserId,
  });
  await appendCrudAudit(
    client,
    args.actorUserId,
    "legal.matter.event_added",
    { matter_id: args.matterId, event_type: input.event_type },
    "info",
    "P8C-I-LEGAL-MATTERS"
  );
  return { ok: true };
}

async function uploadMatterBytesToR2(operatingCompanyId: string, matterId: string, buffer: Buffer, contentType: string) {
  const r2UploadClient = getR2UploadClient();
  if (!r2UploadClient) throw new Error("r2_not_configured");
  const key = `${operatingCompanyId}/legal/matters/${matterId}/${crypto.randomUUID()}${contentType.includes("pdf") ? ".pdf" : ""}`;
  await r2UploadClient.send(
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return key;
}

export async function addMatterDocumentRow(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    matterId: string;
    actorUserId: string;
    title: string;
    isPrivileged: boolean;
    buffer: Buffer;
    contentType: string;
  }
) {
  if (!isR2Configured()) throw new Error("r2_not_configured");
  await setOperatingCompany(client, args.operatingCompanyId);
  const key = await uploadMatterBytesToR2(args.operatingCompanyId, args.matterId, args.buffer, args.contentType);
  const ins = await client.query(
    `
      INSERT INTO legal.matter_documents (
        operating_company_id,
        matter_id,
        title,
        is_privileged,
        r2_object_key,
        content_type,
        file_size_bytes,
        uploaded_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      args.operatingCompanyId,
      args.matterId,
      args.title.trim(),
      args.isPrivileged,
      key,
      args.contentType,
      args.buffer.length,
      args.actorUserId,
    ]
  );
  const row = ins.rows[0]!;
  await appendMatterEvent(client, {
    operatingCompanyId: args.operatingCompanyId,
    matterId: args.matterId,
    eventType: "document_uploaded",
    eventBody: { document_id: row.id, title: args.title, is_privileged: args.isPrivileged },
    createdByUserId: args.actorUserId,
  });
  await appendCrudAudit(
    client,
    args.actorUserId,
    "legal.matter.document_uploaded",
    { matter_id: args.matterId, document_id: row.id, is_privileged: args.isPrivileged },
    "info",
    "P8C-I-LEGAL-MATTERS"
  );
  return row;
}

export async function addMatterDeadlineRow(
  client: QueryableClient,
  args: { operatingCompanyId: string; matterId: string; actorUserId: string; body: z.infer<typeof matterDeadlineSchema> }
) {
  const input = matterDeadlineSchema.parse(args.body);
  await setOperatingCompany(client, args.operatingCompanyId);
  const ins = await client.query(
    `
      INSERT INTO legal.matter_deadlines (
        operating_company_id,
        matter_id,
        deadline_type,
        title,
        deadline_at,
        reminder_offset_days,
        reminder_recipients
      ) VALUES ($1, $2, $3, $4, $5::timestamptz, $6, $7)
      RETURNING *
    `,
    [
      args.operatingCompanyId,
      args.matterId,
      input.deadline_type,
      input.title,
      input.deadline_at,
      input.reminder_offset_days ?? 7,
      input.reminder_recipients,
    ]
  );
  const row = ins.rows[0]!;
  await appendMatterEvent(client, {
    operatingCompanyId: args.operatingCompanyId,
    matterId: args.matterId,
    eventType: "deadline_added",
    eventBody: { deadline_id: row.id, deadline_type: input.deadline_type },
    createdByUserId: args.actorUserId,
  });
  return row;
}

export async function completeMatterDeadline(
  client: QueryableClient,
  args: { operatingCompanyId: string; matterId: string; deadlineId: string; actorUserId: string }
) {
  await setOperatingCompany(client, args.operatingCompanyId);
  const res = await client.query(
    `
      UPDATE legal.matter_deadlines
      SET completed_at = now(),
          completed_by_user_id = $4
      WHERE id = $1
        AND matter_id = $2
        AND operating_company_id = $3::uuid
        AND completed_at IS NULL
      RETURNING *
    `,
    [args.deadlineId, args.matterId, args.operatingCompanyId, args.actorUserId]
  );
  const row = res.rows[0] ?? null;
  if (row) {
    await appendMatterEvent(client, {
      operatingCompanyId: args.operatingCompanyId,
      matterId: args.matterId,
      eventType: "deadline_completed",
      eventBody: { deadline_id: args.deadlineId },
      createdByUserId: args.actorUserId,
    });
  }
  return row;
}

export async function getMatterDocumentForDownload(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    matterId: string;
    documentId: string;
    requesterUserId: string;
    requesterRole: string;
  }
) {
  await setOperatingCompany(client, args.operatingCompanyId);
  const dRes = await client.query(
    `
      SELECT d.id,
        d.operating_company_id,
        d.matter_id,
        d.title,
        d.is_privileged,
        d.r2_object_key,
        d.content_type,
        d.file_size_bytes,
        d.attachment_id,
        d.uploaded_by_user_id,
        d.created_at,
        m.related_user_id AS matter_related_user_id
      FROM legal.matter_documents d
      JOIN legal.matters m ON m.id = d.matter_id
      WHERE d.id = $1 AND d.matter_id = $2 AND d.operating_company_id = $3::uuid
      LIMIT 1
    `,
    [args.documentId, args.matterId, args.operatingCompanyId]
  );
  const row = dRes.rows[0] ?? null;
  if (!row) return null;
  const matterRelated = row.matter_related_user_id;
  const doc = { ...row };
  delete (doc as Record<string, unknown>).matter_related_user_id;
  const admin = canManageLegalMatters(args.requesterRole);
  const involved = String(matterRelated ?? "") === args.requesterUserId;
  if (!admin && !involved) return null;
  if (doc.is_privileged && !admin) return { error: "forbidden_privileged" as const };
  if (!isR2Configured()) return { error: "r2_not_configured" as const };
  const signed = await generatePresignedDownloadUrl(String(doc.r2_object_key), 600);
  return { document: doc, download_url: signed.url, expires_in_seconds: signed.expires_in_seconds };
}

export async function legalMattersReportsSummary(client: QueryableClient, operatingCompanyId: string) {
  await setOperatingCompany(client, operatingCompanyId);
  const openWhere = `operating_company_id = $1::uuid AND status IN ('open','investigating','litigation')`;
  const counts = await client.query(
    `
      SELECT severity, count(*)::int AS n
      FROM legal.matters
      WHERE ${openWhere}
      GROUP BY severity
    `,
    [operatingCompanyId]
  );
  const atRisk = await client.query(
    `
      SELECT coalesce(sum(amount_claimed_against_us), 0)::numeric AS total
      FROM legal.matters
      WHERE ${openWhere}
    `,
    [operatingCompanyId]
  );
  const weSeek = await client.query(
    `
      SELECT coalesce(sum(amount_we_seek), 0)::numeric AS total
      FROM legal.matters
      WHERE ${openWhere}
        AND our_role = 'plaintiff'
    `,
    [operatingCompanyId]
  );
  // LEGAL-REPORTS-CLOSED-COUNT-SCOPED-TO-CLAIM-AMOUNT: total_closed is the true, unscoped count of
  // status='closed' matters -- the FE's "Closed matters (count)" card must read this, not closed_n.
  // closed_n/avg_settled_claim stay scoped to matters WITH a claim amount (correct math for an
  // average), but a closed matter with no monetary claim was previously invisible on the report
  // because the FE reused closed_n as if it were the total closed-matter count.
  const totalClosed = await client.query(
    `
      SELECT count(*)::int AS n
      FROM legal.matters
      WHERE operating_company_id = $1::uuid
        AND status = 'closed'
    `,
    [operatingCompanyId]
  );
  const settlements = await client.query(
    `
      SELECT
        count(*)::int AS closed_n,
        avg(amount_claimed_against_us)::numeric AS avg_settled_claim
      FROM legal.matters
      WHERE operating_company_id = $1::uuid
        AND status = 'closed'
        AND amount_claimed_against_us IS NOT NULL
    `,
    [operatingCompanyId]
  );
  const deadlines30 = await client.query(
    `
      SELECT count(*)::int AS n
      FROM legal.matter_deadlines d
      WHERE d.operating_company_id = $1::uuid
        AND d.completed_at IS NULL
        AND d.deadline_at <= now() + interval '30 days'
        AND d.deadline_at >= now()
    `,
    [operatingCompanyId]
  );
  const sol90 = await client.query(
    `
      SELECT count(*)::int AS n
      FROM legal.matters
      WHERE operating_company_id = $1::uuid
        AND status IN ('open','investigating','litigation')
        AND statute_of_limitations_at IS NOT NULL
        AND statute_of_limitations_at <= (current_date + interval '90 days')
        AND statute_of_limitations_at >= current_date
    `,
    [operatingCompanyId]
  );
  return {
    open_by_severity: Object.fromEntries(counts.rows.map((r) => [r.severity, r.n])) as Record<string, number>,
    total_amount_at_risk: atRisk.rows[0]?.total ?? 0,
    total_amount_we_seek: weSeek.rows[0]?.total ?? 0,
    total_closed_matters: totalClosed.rows[0]?.n ?? 0,
    settlement_history: settlements.rows[0] ?? { closed_n: 0, avg_settled_claim: null },
    deadlines_next_30_days: deadlines30.rows[0]?.n ?? 0,
    statute_limitations_approaching_90d: sol90.rows[0]?.n ?? 0,
  };
}

export type MatterDeadlineReminderRow = Record<string, unknown>;

export async function listDeadlinesNeedingReminder(client: QueryableClient): Promise<MatterDeadlineReminderRow[]> {
  const res = await client.query(
    `
      SELECT
        d.*,
        m.matter_number,
        m.operating_company_id,
        m.related_driver_id
      FROM legal.matter_deadlines d
      JOIN legal.matters m ON m.id = d.matter_id
      WHERE d.completed_at IS NULL
        AND d.deadline_at > now()
        AND (date(d.deadline_at) - current_date) <= d.reminder_offset_days
        AND (
          cardinality(d.reminder_sent_at) = 0
          OR date_trunc('day', (SELECT max(ts) FROM unnest(d.reminder_sent_at) AS ts)) < date_trunc('day', now() AT TIME ZONE 'America/Chicago')
        )
      ORDER BY d.deadline_at ASC
      LIMIT 500
    `
  );
  return res.rows;
}

export async function appendDeadlineReminderSent(client: QueryableClient, deadlineId: string) {
  await client.query(
    `
      UPDATE legal.matter_deadlines
      SET reminder_sent_at = coalesce(reminder_sent_at, ARRAY[]::timestamptz[]) || ARRAY[now()]::timestamptz[]
      WHERE id = $1
    `,
    [deadlineId]
  );
}
