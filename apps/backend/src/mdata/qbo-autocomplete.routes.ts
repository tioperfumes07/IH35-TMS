import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { sendZodValidation } from "../lib/zod-http-error.js";

const querySchema = z.object({
  q: z.string().trim().default(""),
  operating_company_id: z.string().uuid(),
  active_only: z.coerce.boolean().optional().default(true),
});

function officeRole(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher", "Accountant", "Safety"].includes(role);
}

async function assertCompanyAccess(
  client: { query: (sql: string, args?: unknown[]) => Promise<{ rows: Array<{ ok: boolean }> }> },
  userId: string,
  operatingCompanyId: string
) {
  const res = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM org.user_company_access uca
        WHERE uca.user_id = $1::uuid
          AND uca.company_id = $2::uuid
          AND uca.deactivated_at IS NULL
      ) AS ok
    `,
    [userId, operatingCompanyId]
  );
  return Boolean(res.rows[0]?.ok);
}

export async function registerQboAutocompleteRoutes(app: FastifyInstance) {
  const factory =
    (table: "mdata.qbo_vendors" | "mdata.qbo_customers" | "mdata.qbo_items" | "mdata.qbo_accounts") =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!requireAuth(req, reply)) return;
      const role = String(req.user?.role ?? "");
      if (!officeRole(role)) return reply.code(403).send({ error: "forbidden" });

      const parsed = querySchema.safeParse(req.query ?? {});
      if (!parsed.success) return sendZodValidation(reply, parsed.error);

      const userId = String(req.user?.uuid ?? "");
      const { q, operating_company_id, active_only } = parsed.data;
      const term = q.trim();
      const prefix = term.length > 0 ? `${term}%` : "%";
      const activeClause = active_only ? `AND v.active = true` : "";

      const result = await withCurrentUser(userId, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operating_company_id]);
        const allowed = await assertCompanyAccess(client, userId, operating_company_id);
        if (!allowed) return null;

        if (table === "mdata.qbo_vendors") {
          return client.query(
            `
              SELECT
                v.id,
                v.qbo_id,
                v.display_name,
                v.company_name,
                v.primary_email,
                v.primary_phone,
                v.active
              FROM mdata.qbo_vendors v
              WHERE v.operating_company_id = $1::uuid
                ${activeClause}
                AND (
                  $2::text = ''
                  OR (
                    length($2::text) >= 3
                    AND to_tsvector('english', v.display_name || ' ' || COALESCE(v.company_name, ''))
                      @@ plainto_tsquery('english', $2::text)
                  )
                  OR v.display_name ILIKE $3
                  OR COALESCE(v.company_name, '') ILIKE $3
                )
              ORDER BY
                CASE
                  WHEN lower(v.display_name) = lower($2::text) THEN 0
                  WHEN v.display_name ILIKE $3 OR COALESCE(v.company_name, '') ILIKE $3 THEN 1
                  ELSE 2
                END ASC,
                ts_rank_cd(
                  to_tsvector('english', v.display_name || ' ' || COALESCE(v.company_name, '')),
                  plainto_tsquery('english', CASE WHEN length($2::text) >= 3 THEN $2::text ELSE 'zzzunused' END)
                ) DESC NULLS LAST,
                v.display_name ASC
              LIMIT 25
            `,
            [operating_company_id, term, prefix]
          );
        }

        if (table === "mdata.qbo_customers") {
          return client.query(
            `
              SELECT
                v.id,
                v.qbo_id,
                v.display_name,
                v.company_name,
                v.primary_email,
                v.primary_phone,
                v.mc_number,
                v.active
              FROM mdata.qbo_customers v
              WHERE v.operating_company_id = $1::uuid
                ${activeClause}
                AND (
                  $2::text = ''
                  OR (
                    length($2::text) >= 3
                    AND to_tsvector('english', v.display_name || ' ' || COALESCE(v.company_name, ''))
                      @@ plainto_tsquery('english', $2::text)
                  )
                  OR v.display_name ILIKE $3
                  OR COALESCE(v.company_name, '') ILIKE $3
                )
              ORDER BY
                CASE
                  WHEN lower(v.display_name) = lower($2::text) THEN 0
                  WHEN v.display_name ILIKE $3 OR COALESCE(v.company_name, '') ILIKE $3 THEN 1
                  ELSE 2
                END ASC,
                ts_rank_cd(
                  to_tsvector('english', v.display_name || ' ' || COALESCE(v.company_name, '')),
                  plainto_tsquery('english', CASE WHEN length($2::text) >= 3 THEN $2::text ELSE 'zzzunused' END)
                ) DESC NULLS LAST,
                v.display_name ASC
              LIMIT 25
            `,
            [operating_company_id, term, prefix]
          );
        }

        if (table === "mdata.qbo_items") {
          return client.query(
            `
              SELECT
                v.id,
                v.qbo_id,
                v.name AS display_name,
                v.sku,
                v.item_type,
                v.unit_price_cents,
                v.active
              FROM mdata.qbo_items v
              WHERE v.operating_company_id = $1::uuid
                ${activeClause}
                AND (
                  $2::text = ''
                  OR (
                    length($2::text) >= 3
                    AND to_tsvector('english', v.name || ' ' || COALESCE(v.sku, ''))
                      @@ plainto_tsquery('english', $2::text)
                  )
                  OR v.name ILIKE $3
                  OR COALESCE(v.sku, '') ILIKE $3
                )
              ORDER BY
                CASE
                  WHEN lower(v.name) = lower($2::text) THEN 0
                  WHEN v.name ILIKE $3 OR COALESCE(v.sku, '') ILIKE $3 THEN 1
                  ELSE 2
                END ASC,
                ts_rank_cd(
                  to_tsvector('english', v.name || ' ' || COALESCE(v.sku, '')),
                  plainto_tsquery('english', CASE WHEN length($2::text) >= 3 THEN $2::text ELSE 'zzzunused' END)
                ) DESC NULLS LAST,
                v.name ASC
              LIMIT 25
            `,
            [operating_company_id, term, prefix]
          );
        }

        return client.query(
          `
            SELECT
              v.id,
              v.qbo_id,
              v.name AS display_name,
              v.full_qualified_name,
              v.account_type,
              v.account_sub_type,
              v.active
            FROM mdata.qbo_accounts v
            WHERE v.operating_company_id = $1::uuid
              ${activeClause}
              AND (
                $2::text = ''
                OR (
                  length($2::text) >= 3
                  AND to_tsvector('english', v.name || ' ' || COALESCE(v.full_qualified_name, ''))
                    @@ plainto_tsquery('english', $2::text)
                )
                OR v.name ILIKE $3
                OR COALESCE(v.full_qualified_name, '') ILIKE $3
              )
            ORDER BY
              CASE
                WHEN lower(v.name) = lower($2::text) THEN 0
                WHEN v.name ILIKE $3 OR COALESCE(v.full_qualified_name, '') ILIKE $3 THEN 1
                ELSE 2
              END ASC,
              ts_rank_cd(
                to_tsvector('english', v.name || ' ' || COALESCE(v.full_qualified_name, '')),
                plainto_tsquery('english', CASE WHEN length($2::text) >= 3 THEN $2::text ELSE 'zzzunused' END)
              ) DESC NULLS LAST,
              v.name ASC
            LIMIT 25
          `,
          [operating_company_id, term, prefix]
        );
      });

      if (!result) return reply.code(403).send({ error: "forbidden" });

      reply.header("Cache-Control", "private, max-age=30");
      return { results: result.rows };
    };

  app.get("/api/v1/mdata/qbo/vendors", factory("mdata.qbo_vendors"));
  app.get("/api/v1/mdata/qbo/customers", factory("mdata.qbo_customers"));
  app.get("/api/v1/mdata/qbo/items", factory("mdata.qbo_items"));
  app.get("/api/v1/mdata/qbo/accounts", factory("mdata.qbo_accounts"));
}
