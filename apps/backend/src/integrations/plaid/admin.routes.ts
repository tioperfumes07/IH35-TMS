import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { syncTransactions } from "./plaid.service.js";

const bodySchema = z.object({
  bank_account_id: z.string().uuid(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isOwnerOrAdmin(role: string) {
  return role === "Owner" || role === "Administrator";
}

async function loadBankAccountContext(bankAccountId: string) {
  return withLuciaBypass(async (client) => {
    const res = await client.query<{ id: string; operating_company_id: string; plaid_item_id: string | null }>(
      `
        SELECT id, operating_company_id, plaid_item_id
        FROM banking.bank_accounts
        WHERE id = $1
        LIMIT 1
      `,
      [bankAccountId]
    );
    return res.rows[0] ?? null;
  });
}

export async function registerPlaidAdminRoutes(app: FastifyInstance) {
  app.post("/api/v1/admin/plaid/sync-account", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!isOwnerOrAdmin(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const account = await loadBankAccountContext(parsed.data.bank_account_id);
    if (!account) return reply.code(404).send({ error: "bank_account_not_found" });
    if (!account.plaid_item_id) return reply.code(400).send({ error: "bank_account_not_linked_to_plaid_item" });

    const result = await syncTransactions(account.plaid_item_id);

    await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [account.operating_company_id]);
      await appendCrudAudit(
        client,
        user.uuid,
        "banking.plaid.manual_sync",
        {
          resource_type: "banking.bank_accounts",
          resource_id: account.id,
          operating_company_id: account.operating_company_id,
          counts: result,
        },
        "info",
        "P5-T1.2-PLAID"
      );
    });

    return { ok: true, ...result };
  });
}

