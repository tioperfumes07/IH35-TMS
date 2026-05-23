import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";

type ConflictType = "field_drift" | "missing_in_qbo" | "missing_in_mirror";
type EntityType = "customer" | "vendor" | "product" | "account";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  entity: z.enum(["customer", "vendor", "product", "account"]),
  conflict_type: z.enum(["field_drift", "missing_in_qbo", "missing_in_mirror"]).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
  cursor: z.string().optional(),
});

type EntityRow = {
  mirror_id: string;
  qbo_id: string | null;
  detected_at: string;
  mirror_snapshot: Record<string, unknown> | null;
  qbo_snapshot: Record<string, unknown> | null;
  raw_payload: Record<string, unknown> | null;
};

type KeysetCursor = {
  detected_at: string;
  mirror_id: string;
  conflict_type: ConflictType;
};

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

function parseCursor(raw: string | undefined): KeysetCursor | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<KeysetCursor>;
    if (!parsed.detected_at || !parsed.mirror_id || !parsed.conflict_type) return null;
    if (!["field_drift", "missing_in_qbo", "missing_in_mirror"].includes(parsed.conflict_type)) return null;
    return parsed as KeysetCursor;
  } catch {
    return null;
  }
}

function encodeCursor(cursor: KeysetCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function normalizeSnapshot(value: Record<string, unknown> | null | undefined) {
  const source = value ?? {};
  const out: Record<string, string | null> = {};
  for (const [key, raw] of Object.entries(source)) {
    if (raw == null) out[key] = null;
    else if (typeof raw === "boolean") out[key] = raw ? "true" : "false";
    else if (typeof raw === "number") out[key] = String(raw);
    else if (typeof raw === "string") out[key] = raw.trim();
    else out[key] = JSON.stringify(raw);
  }
  return out;
}

function hasAnyValue(snapshot: Record<string, string | null>) {
  return Object.values(snapshot).some((v) => v != null && v !== "");
}

function classifyConflict(row: EntityRow): {
  conflict_type: ConflictType;
  summary: string;
  diff: Array<{ field: string; mirror: string | null; qbo: string | null }>;
} | null {
  const mirror = normalizeSnapshot(row.mirror_snapshot);
  const qbo = normalizeSnapshot(row.qbo_snapshot);
  const qboId = (row.qbo_id ?? "").trim();
  const mirrorHasData = hasAnyValue(mirror);
  const qboHasData = hasAnyValue(qbo) || Object.keys(row.raw_payload ?? {}).length > 0;

  if (qboId && !qboHasData) {
    return {
      conflict_type: "missing_in_qbo",
      summary: "Mirror row has QBO ID, but latest observed QBO snapshot is missing.",
      diff: [],
    };
  }
  if (!qboId && qboHasData) {
    return {
      conflict_type: "missing_in_mirror",
      summary: "Observed QBO snapshot exists, but mirror row is missing a QBO ID link.",
      diff: [],
    };
  }

  if (!qboId || !qboHasData || !mirrorHasData) return null;

  const keys = new Set([...Object.keys(mirror), ...Object.keys(qbo)]);
  const diff = [...keys]
    .map((field) => ({ field, mirror: mirror[field] ?? null, qbo: qbo[field] ?? null }))
    .filter((entry) => (entry.mirror ?? "") !== (entry.qbo ?? ""))
    .sort((a, b) => a.field.localeCompare(b.field));

  if (diff.length === 0) return null;
  return {
    conflict_type: "field_drift",
    summary: `Field drift across ${diff.length} field${diff.length === 1 ? "" : "s"}.`,
    diff,
  };
}

function entitySql(entity: EntityType) {
  if (entity === "customer") {
    return `
      SELECT
        m.id::text AS mirror_id,
        m.qbo_id,
        COALESCE(m.last_seen_at, m.mirrored_at, m.updated_at, m.created_at)::text AS detected_at,
        jsonb_build_object(
          'display_name', m.display_name,
          'company_name', m.company_name,
          'primary_email', m.primary_email,
          'primary_phone', m.primary_phone,
          'active', m.active
        ) AS mirror_snapshot,
        jsonb_build_object(
          'display_name', NULLIF(COALESCE(m.raw_payload->>'DisplayName', m.raw_payload->>'FullyQualifiedName'), ''),
          'company_name', NULLIF(m.raw_payload->>'CompanyName', ''),
          'primary_email', NULLIF(m.raw_payload->'PrimaryEmailAddr'->>'Address', ''),
          'primary_phone', NULLIF(m.raw_payload->'PrimaryPhone'->>'FreeFormNumber', ''),
          'active', CASE WHEN m.raw_payload ? 'Active' THEN lower(m.raw_payload->>'Active') ELSE NULL END
        ) AS qbo_snapshot,
        m.raw_payload
      FROM mdata.qbo_customers m
      WHERE m.operating_company_id = $1::uuid
    `;
  }
  if (entity === "vendor") {
    return `
      SELECT
        m.id::text AS mirror_id,
        m.qbo_id,
        COALESCE(m.last_seen_at, m.mirrored_at, m.updated_at, m.created_at)::text AS detected_at,
        jsonb_build_object(
          'display_name', m.display_name,
          'company_name', m.company_name,
          'primary_email', m.primary_email,
          'primary_phone', m.primary_phone,
          'active', m.active
        ) AS mirror_snapshot,
        jsonb_build_object(
          'display_name', NULLIF(COALESCE(m.raw_payload->>'DisplayName', m.raw_payload->>'FullyQualifiedName'), ''),
          'company_name', NULLIF(m.raw_payload->>'CompanyName', ''),
          'primary_email', NULLIF(m.raw_payload->'PrimaryEmailAddr'->>'Address', ''),
          'primary_phone', NULLIF(m.raw_payload->'PrimaryPhone'->>'FreeFormNumber', ''),
          'active', CASE WHEN m.raw_payload ? 'Active' THEN lower(m.raw_payload->>'Active') ELSE NULL END
        ) AS qbo_snapshot,
        m.raw_payload
      FROM mdata.qbo_vendors m
      WHERE m.operating_company_id = $1::uuid
    `;
  }
  if (entity === "product") {
    return `
      SELECT
        m.id::text AS mirror_id,
        m.qbo_id,
        COALESCE(m.last_seen_at, m.mirrored_at, m.updated_at, m.created_at)::text AS detected_at,
        jsonb_build_object(
          'name', m.name,
          'sku', m.sku,
          'item_type', m.item_type,
          'unit_price_cents', m.unit_price_cents,
          'active', m.active
        ) AS mirror_snapshot,
        jsonb_build_object(
          'name', NULLIF(COALESCE(m.raw_payload->>'Name', m.raw_payload->>'FullyQualifiedName'), ''),
          'sku', NULLIF(m.raw_payload->>'Sku', ''),
          'item_type', NULLIF(m.raw_payload->>'Type', ''),
          'unit_price_cents', CASE
            WHEN (m.raw_payload->>'UnitPrice') ~ '^-?\\d+(\\.\\d+)?$'
              THEN (round(((m.raw_payload->>'UnitPrice')::numeric) * 100))::text
            ELSE NULL
          END,
          'active', CASE WHEN m.raw_payload ? 'Active' THEN lower(m.raw_payload->>'Active') ELSE NULL END
        ) AS qbo_snapshot,
        m.raw_payload
      FROM mdata.qbo_items m
      WHERE m.operating_company_id = $1::uuid
    `;
  }
  return `
    SELECT
      m.id::text AS mirror_id,
      m.qbo_id,
      COALESCE(m.last_seen_at, m.mirrored_at, m.updated_at, m.created_at)::text AS detected_at,
      jsonb_build_object(
        'name', m.name,
        'full_qualified_name', m.full_qualified_name,
        'account_type', m.account_type,
        'account_sub_type', m.account_sub_type,
        'active', m.active
      ) AS mirror_snapshot,
      jsonb_build_object(
        'name', NULLIF(COALESCE(m.raw_payload->>'Name', m.raw_payload->>'FullyQualifiedName'), ''),
        'full_qualified_name', NULLIF(m.raw_payload->>'FullyQualifiedName', ''),
        'account_type', NULLIF(m.raw_payload->>'AccountType', ''),
        'account_sub_type', NULLIF(m.raw_payload->>'AccountSubType', ''),
        'active', CASE WHEN m.raw_payload ? 'Active' THEN lower(m.raw_payload->>'Active') ELSE NULL END
      ) AS qbo_snapshot,
      m.raw_payload
    FROM mdata.qbo_accounts m
    WHERE m.operating_company_id = $1::uuid
  `;
}

export async function registerQboSyncConflictDetectionRoutes(app: FastifyInstance) {
  app.get("/api/v1/qbo/sync-conflicts", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const routeCursor = parseCursor(parsed.data.cursor);
    if (parsed.data.cursor && !routeCursor) return reply.code(400).send({ error: "invalid_cursor" });

    const result = await withCompanyScope(String(user.uuid), parsed.data.operating_company_id, async (client) => {
      const tableName =
        parsed.data.entity === "customer"
          ? "qbo_customers"
          : parsed.data.entity === "vendor"
            ? "qbo_vendors"
            : parsed.data.entity === "product"
              ? "qbo_items"
              : "qbo_accounts";

      const exists = await client.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`mdata.${tableName}`]);
      if (!exists.rows[0]?.ok) return { items: [], next_cursor: null as string | null };

      const collected: Array<{
        entity_type: EntityType;
        qbo_id: string | null;
        mirror_id: string;
        conflict_type: ConflictType;
        summary: string;
        detected_at: string;
        mirror_snapshot: Record<string, unknown>;
        qbo_snapshot: Record<string, unknown>;
        diff: Array<{ field: string; mirror: string | null; qbo: string | null }>;
      }> = [];

      let loopCursor = routeCursor ? { detected_at: routeCursor.detected_at, mirror_id: routeCursor.mirror_id } : null;
      let attempts = 0;
      let exhausted = false;

      while (collected.length < parsed.data.limit + 1 && attempts < 6 && !exhausted) {
        attempts += 1;
        const values: unknown[] = [parsed.data.operating_company_id];
        let cursorSql = "";
        if (loopCursor) {
          values.push(loopCursor.detected_at, loopCursor.mirror_id);
          cursorSql = `AND (COALESCE(m.last_seen_at, m.mirrored_at, m.updated_at, m.created_at), m.id) < ($2::timestamptz, $3::uuid)`;
        }
        values.push(parsed.data.limit * 3);
        const limitIdx = values.length;

        const sql = `
          ${entitySql(parsed.data.entity)}
          ${cursorSql}
          ORDER BY COALESCE(m.last_seen_at, m.mirrored_at, m.updated_at, m.created_at) DESC, m.id DESC
          LIMIT $${limitIdx}
        `;
        const res = await client.query(sql, values);
        const rows = res.rows as EntityRow[];

        if (rows.length === 0) {
          exhausted = true;
          break;
        }

        for (const row of rows) {
          const classification = classifyConflict(row);
          if (!classification) continue;
          if (parsed.data.conflict_type && classification.conflict_type !== parsed.data.conflict_type) continue;
          collected.push({
            entity_type: parsed.data.entity,
            qbo_id: row.qbo_id ?? null,
            mirror_id: row.mirror_id,
            conflict_type: classification.conflict_type,
            summary: classification.summary,
            detected_at: row.detected_at,
            mirror_snapshot: row.mirror_snapshot ?? {},
            qbo_snapshot: row.qbo_snapshot ?? {},
            diff: classification.diff,
          });
          if (collected.length >= parsed.data.limit + 1) break;
        }

        const tail = rows[rows.length - 1];
        loopCursor = tail ? { detected_at: tail.detected_at, mirror_id: tail.mirror_id } : null;
        if (rows.length < parsed.data.limit * 3) exhausted = true;
      }

      const hasMore = collected.length > parsed.data.limit;
      const page = hasMore ? collected.slice(0, parsed.data.limit) : collected;
      const last = page[page.length - 1];
      return {
        items: page,
        next_cursor: hasMore && last ? encodeCursor({
          detected_at: last.detected_at,
          mirror_id: last.mirror_id,
          conflict_type: last.conflict_type,
        }) : null,
      };
    });

    return result;
  });
}
