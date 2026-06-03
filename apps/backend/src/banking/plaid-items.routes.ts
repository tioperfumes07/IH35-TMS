import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { requireAuth } from "../auth/session-middleware.js";
import { getPlaidClient } from "../integrations/plaid/plaid-client.js";
import { handleItemError, syncTransactions } from "../integrations/plaid/plaid.service.js";
import { plaidManualSyncErrorResponse } from "../integrations/plaid/plaid-sync-state.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";

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

function extractPlaidApiError(err: unknown): { code?: string; message?: string } | null {
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  const resp = e.response as Record<string, unknown> | undefined;
  const data = resp?.data as Record<string, unknown> | undefined;
  const code = typeof data?.error_code === "string" ? data.error_code : undefined;
  const message =
    (typeof data?.error_message === "string" ? data.error_message : undefined) ??
    (typeof e.message === "string" ? e.message : undefined);
  if (!code && !message) return null;
  return { code, message };
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

  app.post("/api/v1/banking/plaid/items/:itemId/sync", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    if (!officeRole(user.role)) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ itemId: z.string().min(4).max(120) }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const bodyOc = z.object({ operating_company_id: z.string().uuid().optional() }).safeParse(req.body ?? {});
    const queryOc = z.object({ operating_company_id: z.string().uuid().optional() }).safeParse(req.query ?? {});
    const operatingCompanyId = (bodyOc.success ? bodyOc.data.operating_company_id : undefined) ?? (queryOc.success ? queryOc.data.operating_company_id : undefined);
    if (!operatingCompanyId) return reply.code(400).send({ error: "operating_company_id required" });

    const exists = await withCompanyScope(user.uuid, operatingCompanyId, async (client) => {
      const rel = await client.query(`SELECT to_regclass('banking.bank_accounts') IS NOT NULL AS ok`);
      if (!rel.rows[0]?.ok) return false;

      const hit = await client.query(
        `
          SELECT 1 AS ok
          FROM banking.bank_accounts
          WHERE operating_company_id = $1::uuid
            AND plaid_item_id = $2
            AND deactivated_at IS NULL
            AND is_active = true
            AND sync_status::text <> 'disconnected'
            AND plaid_access_token IS NOT NULL
          LIMIT 1
        `,
        [operatingCompanyId, params.data.itemId]
      );
      return hit.rows.length > 0;
    });

    if (!exists) return reply.code(404).send({ error: "plaid_item_not_found" });

    try {
      const result = await syncTransactions(params.data.itemId);
      await withCompanyScope(user.uuid, operatingCompanyId, async (client) => {
        await appendCrudAudit(client, user.uuid, "banking.plaid.item_manual_sync", {
          operating_company_id: operatingCompanyId,
          item_id: params.data.itemId,
          added: result.added,
          modified: result.modified,
          removed: result.removed,
        });
      });

      return reply.code(200).send({
        ok: true,
        item_id: params.data.itemId,
        added: result.added,
        modified: result.modified,
        removed: result.removed,
        has_more: false,
      });
    } catch (error) {
      req.log.error({ err: error }, "plaid_item_sync_failed");
      const plaidErr = extractPlaidApiError(error);
      if (plaidErr?.code) {
        await handleItemError(params.data.itemId, plaidErr.code);
        const mapped = plaidManualSyncErrorResponse(plaidErr.code);
        if (mapped) return reply.code(mapped.statusCode).send(mapped.body);
      }
      if (plaidErr?.code) {
        return reply.code(502).send({
          error: "plaid_error",
          code: plaidErr.code,
          message: plaidErr.message ?? "plaid_error",
        });
      }
      if (error instanceof Error && error.message === "plaid_access_token_missing_for_item") {
        return reply.code(404).send({ error: "plaid_item_not_found" });
      }
      return reply.code(500).send({ error: "internal_error" });
    }
  });
}
