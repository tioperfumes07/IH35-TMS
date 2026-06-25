/**
 * factoring-queue.routes.ts — GET /api/v1/dispatch/factoring-queue
 *
 * Returns delivered+ loads grouped with their factoring packet stage.
 * Packet stage is derived from:
 *   - load notes IH35_FACTORING_PACKAGE_V1:: metadata (generated_at, approved_at)
 *   - linked invoice factoring_status
 *   - presence of required documents (BOL, POD, rate_confirmation)
 *
 * Lane A wires this into index.ts; no other files touched.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withCurrentUser } from "../auth/db.js";

const PACKET_PREFIX = "IH35_FACTORING_PACKAGE_V1::";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  stage: z
    .enum(["NOT_FACTORED", "PACKET_READY", "SUBMITTED", "ADVANCE_RECEIVED", "RESERVE_RELEASED", "CHARGED_BACK"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

/** Parse IH35_FACTORING_PACKAGE_V1::{json}\n… from a load's notes field. */
function parsePacketMeta(notes: string | null | undefined): {
  generated_at: string | null;
  approved_at: string | null;
  invoice_id: string | null;
} {
  const raw = String(notes ?? "");
  if (!raw.startsWith(PACKET_PREFIX)) {
    return { generated_at: null, approved_at: null, invoice_id: null };
  }
  const nl = raw.indexOf("\n");
  const chunk = nl >= 0 ? raw.slice(PACKET_PREFIX.length, nl) : raw.slice(PACKET_PREFIX.length);
  try {
    const parsed = JSON.parse(chunk) as Record<string, unknown>;
    return {
      generated_at: typeof parsed.generated_at === "string" ? parsed.generated_at : null,
      approved_at: typeof parsed.approved_at === "string" ? parsed.approved_at : null,
      invoice_id: typeof parsed.invoice_id === "string" ? parsed.invoice_id : null,
    };
  } catch {
    return { generated_at: null, approved_at: null, invoice_id: null };
  }
}

type PacketStage =
  | "NOT_FACTORED"
  | "PACKET_READY"
  | "SUBMITTED"
  | "ADVANCE_RECEIVED"
  | "RESERVE_RELEASED"
  | "CHARGED_BACK";

function deriveStage(
  invoiceFactoringStatus: string | null | undefined,
  generatedAt: string | null,
): PacketStage {
  const fs = invoiceFactoringStatus ?? "not_factored";
  if (fs === "released") return "RESERVE_RELEASED";
  if (fs === "recourse_returned") return "CHARGED_BACK";
  if (fs === "advanced" || fs === "reserve_held" || fs === "collected") return "ADVANCE_RECEIVED";
  if (fs === "submitted") return "SUBMITTED";
  if (generatedAt) return "PACKET_READY";
  return "NOT_FACTORED";
}

export async function registerFactoringQueueRoutes(app: FastifyInstance) {
  app.get("/api/v1/dispatch/factoring-queue", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const parsed = querySchema.safeParse(req.query ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }

    const { operating_company_id: companyId, stage: stageFilter, limit, offset } = parsed.data;

    return withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [companyId]);

      // ── fetch delivered+ loads with linked invoice info + doc presence ─────
      const res = await client.query<{
        load_id: string;
        load_number: string;
        customer_name: string | null;
        load_status: string;
        rate_total_cents: number;
        currency_code: string;
        notes: string | null;
        invoice_id: string | null;
        invoice_display_id: string | null;
        invoice_factoring_status: string | null;
        delivery_city: string | null;
        delivery_state: string | null;
        delivered_at: string | null;
        has_rate_conf: boolean;
        has_bol: boolean;
        has_pod: boolean;
      }>(
        `
        SELECT
          l.id                          AS load_id,
          l.load_number,
          c.customer_name,
          l.status                      AS load_status,
          l.rate_total_cents,
          COALESCE(l.currency_code, 'USD') AS currency_code,
          l.notes,
          inv.id                        AS invoice_id,
          inv.display_id                AS invoice_display_id,
          COALESCE(inv.factoring_status, 'not_factored') AS invoice_factoring_status,
          sd.city                       AS delivery_city,
          sd.state                      AS delivery_state,
          l.updated_at                  AS delivered_at,
          EXISTS (
            SELECT 1 FROM docs.files df
            JOIN docs.file_links dfl ON dfl.file_id = df.id
            LEFT JOIN catalogs.file_categories dfc ON dfc.id = df.category_id
            WHERE dfl.entity_type = 'load'
              AND dfl.entity_id = l.id
              AND dfl.deleted_at IS NULL
              AND df.deleted_at IS NULL
              AND dfc.code = 'rate_confirmation'
          ) AS has_rate_conf,
          EXISTS (
            SELECT 1 FROM docs.files df
            JOIN docs.file_links dfl ON dfl.file_id = df.id
            LEFT JOIN catalogs.file_categories dfc ON dfc.id = df.category_id
            WHERE dfl.entity_type = 'load'
              AND dfl.entity_id = l.id
              AND dfl.deleted_at IS NULL
              AND df.deleted_at IS NULL
              AND dfc.code = 'bol'
          ) AS has_bol,
          EXISTS (
            SELECT 1 FROM docs.files df
            JOIN docs.file_links dfl ON dfl.file_id = df.id
            LEFT JOIN catalogs.file_categories dfc ON dfc.id = df.category_id
            WHERE dfl.entity_type = 'load'
              AND dfl.entity_id = l.id
              AND dfl.deleted_at IS NULL
              AND df.deleted_at IS NULL
              AND dfc.code = 'pod'
          ) AS has_pod
        FROM mdata.loads l
        JOIN mdata.customers c ON c.id = l.customer_id
        LEFT JOIN accounting.invoices inv
          ON inv.source_load_id = l.id
          AND inv.operating_company_id = l.operating_company_id
          AND inv.status != 'void'
        LEFT JOIN LATERAL (
          SELECT city, state
          FROM mdata.load_stops
          WHERE load_id = l.id AND stop_type = 'delivery'
          ORDER BY sequence_number DESC
          LIMIT 1
        ) sd ON true
        WHERE l.operating_company_id = $1
          AND l.soft_deleted_at IS NULL
          AND l.status IN ('delivered', 'invoiced', 'paid', 'closed')
        ORDER BY l.updated_at DESC
        LIMIT $2 OFFSET $3
        `,
        [companyId, limit + 1, offset],
      );

      const rawRows = res.rows;
      const hasMore = rawRows.length > limit;
      const pageRows = rawRows.slice(0, limit);

      const rows = pageRows
        .map((row) => {
          const meta = parsePacketMeta(row.notes);
          const stage = deriveStage(row.invoice_factoring_status, meta.generated_at);

          const missingDocTypes: string[] = [];
          if (!row.has_rate_conf) missingDocTypes.push("rate_conf");
          if (!row.has_bol) missingDocTypes.push("BOL");
          if (!row.has_pod) missingDocTypes.push("POD");
          if (!row.invoice_id) missingDocTypes.push("invoice");

          return {
            load_id: row.load_id,
            load_number: row.load_number,
            customer_name: row.customer_name,
            load_status: row.load_status,
            rate_total_cents: Number(row.rate_total_cents),
            currency_code: row.currency_code,
            packet_stage: stage,
            packet_generated_at: meta.generated_at,
            packet_approved_at: meta.approved_at,
            invoice_id: row.invoice_id,
            invoice_display_id: row.invoice_display_id,
            invoice_factoring_status: row.invoice_factoring_status,
            missing_doc_types: missingDocTypes,
            delivery_city: row.delivery_city,
            delivery_state: row.delivery_state,
            delivered_at: row.delivered_at,
          };
        })
        .filter((row) => !stageFilter || row.packet_stage === stageFilter);

      return { rows, total: rows.length, has_more: hasMore };
    });
  });
}
