import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { requireAuth } from "../auth/session-middleware.js";
import { getPlaidClient } from "../integrations/plaid/plaid-client.js";

function officeRole(role: string) {
  return role !== "Driver";
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

function mapSyncStatus(raw: string): "healthy" | "login_required" | "error" {
  const s = String(raw ?? "").toLowerCase();
  if (s === "needs_reauth" || s === "disconnected") return "login_required";
  if (s === "error" || s === "pending") return "error";
  return "healthy";
}

export async function registerPlaidBankingItemsRoutes(app: FastifyInstance) {
  app.get("/api/v1/banking/plaid/items", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const rows = await withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const rel = await client.query(`SELECT to_regclass('banking.bank_accounts') IS NOT NULL AS ok`);
      if (!rel.rows[0]?.ok) return [];

      const itemsRes = await client.query(
        `
          SELECT
            plaid_item_id AS item_id,
            MIN(institution_name) AS institution_name,
            MAX(last_synced_at)::text AS last_synced_at,
            MIN(sync_status) AS sync_status
          FROM banking.bank_accounts
          WHERE operating_company_id = $1::uuid
            AND plaid_item_id IS NOT NULL
            AND deactivated_at IS NULL
          GROUP BY plaid_item_id
          ORDER BY MIN(institution_name) ASC NULLS LAST
        `,
        [parsed.data.operating_company_id]
      );

      const results: Array<Record<string, unknown>> = [];
      for (const item of itemsRes.rows) {
        const acctRes = await client.query(
          `
            SELECT
              plaid_account_id AS account_id,
              account_name AS name,
              account_mask AS mask,
              account_class AS "accountClass",
              current_balance_cents AS "balanceCents",
              last_synced_at::text AS "lastSyncedAt",
              sync_status AS sync_status
            FROM banking.bank_accounts
            WHERE operating_company_id = $1::uuid
              AND plaid_item_id = $2
              AND deactivated_at IS NULL
            ORDER BY account_name ASC NULLS LAST
          `,
          [parsed.data.operating_company_id, item.item_id]
        );

        results.push({
          itemId: item.item_id,
          institutionName: item.institution_name ?? null,
          institutionId: null,
          plaidLogoUrl: null,
          lastSyncAt: item.last_synced_at,
          syncStatus: mapSyncStatus(String(item.sync_status ?? "active")),
          accounts: acctRes.rows.map((row: Record<string, unknown>) => ({
            accountId: row.account_id,
            name: row.name,
            mask: row.mask,
            accountClass: row.accountClass,
            balanceCents: Number(row.balanceCents ?? 0),
            lastSyncedAt: row.lastSyncedAt,
          })),
        });
      }

      return results;
    });

    return rows;
  });

  app.post("/api/v1/banking/plaid/items/:itemId/disconnect", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ itemId: z.string().min(4).max(120) }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const body = companyQuerySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    try {
      await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
        const accessRes = await client.query(
          `
            SELECT plaid_access_token AS token
            FROM banking.bank_accounts
            WHERE operating_company_id = $1::uuid
              AND plaid_item_id = $2
              AND plaid_access_token IS NOT NULL
            ORDER BY updated_at DESC NULLS LAST
            LIMIT 1
          `,
          [body.data.operating_company_id, params.data.itemId]
        );

        const token = accessRes.rows[0]?.token ?? null;
        if (token) {
          await getPlaidClient().itemRemove({ access_token: token });
        }

        await client.query(
          `
            UPDATE banking.bank_accounts
            SET sync_status = 'disconnected',
                is_active = false,
                deactivated_at = COALESCE(deactivated_at, now()),
                plaid_access_token = NULL,
                updated_at = now()
            WHERE operating_company_id = $1::uuid
              AND plaid_item_id = $2
          `,
          [body.data.operating_company_id, params.data.itemId]
        );

        await appendCrudAudit(client, user.uuid, "banking.plaid.item_disconnect", {
          operating_company_id: body.data.operating_company_id,
          item_id: params.data.itemId,
        });
      });

      return reply.code(200).send({ ok: true });
    } catch (error) {
      req.log.error({ err: error }, "plaid_item_disconnect_failed");
      return reply.code(500).send({ error: "plaid_item_disconnect_failed" });
    }
  });
}
