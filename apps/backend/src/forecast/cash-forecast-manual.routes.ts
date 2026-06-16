import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { withOperatingCompanyScope } from "../auth/operating-company-scope.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { sendZodValidation } from "../lib/zod-http-error.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

// FIREWALL: this module is the hand-entered cash projection. It must NEVER import
// accounting/finance/reports, post to the GL, or FK into another schema. Enforced by
// scripts/verify-cash-forecast-firewall.mjs.

function officeRole(role: string) {
  return ["Owner", "Administrator", "SuperAdmin", "Manager", "Accountant", "Dispatcher", "Safety", "Mechanic"].includes(role);
}

const companyQuery = z.object({ operating_company_id: z.string().uuid() });
const dateRangeQuery = companyQuery.extend({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
const idParams = z.object({ id: z.string().uuid() });

const entryBody = z.object({
  operating_company_id: z.string().uuid(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  direction: z.enum(["income", "expense"]),
  amount_cents: z.number().int().min(0),
  party_name: z.string().trim().max(200).nullish(),
  invoice_no: z.string().trim().max(120).nullish(),
  category: z.string().trim().max(120).nullish(),
  memo: z.string().trim().max(2000).nullish(),
  ref_kind: z.enum(["account", "unit", "driver", "truck", "trailer"]).nullish(),
  ref_label: z.string().trim().max(200).nullish(),
  ref_external_id: z.string().trim().max(120).nullish(),
});
const entryPatch = entryBody.partial().extend({ operating_company_id: z.string().uuid() });
const openingBalanceBody = z.object({
  operating_company_id: z.string().uuid(),
  amount_cents: z.number().int(),
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

export async function registerCashForecastManualRoutes(app: FastifyInstance) {
  const auth = (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return null;
    const user = req.user as { uuid: string; role: string };
    if (!officeRole(String(user.role ?? ""))) {
      reply.code(403).send({ error: "forbidden" });
      return null;
    }
    return user;
  };

  // List entries (date-range optional), entity-scoped.
  app.get("/api/v1/forecast/cash-entries", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const q = dateRangeQuery.safeParse(req.query ?? {});
    if (!q.success) return sendZodValidation(reply, q.error);
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const rows = await withOperatingCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const values: unknown[] = [];
      const filters = ["deactivated_at IS NULL"];
      if (q.data.from) { values.push(q.data.from); filters.push(`entry_date >= $${values.length}`); }
      if (q.data.to) { values.push(q.data.to); filters.push(`entry_date <= $${values.length}`); }
      const res = await client.query(
        `SELECT id, entry_date, direction, amount_cents, party_name, invoice_no, category, memo,
                ref_kind, ref_label, ref_external_id, created_at, updated_at
           FROM forecast.cash_entries
          WHERE ${filters.join(" AND ")}
          ORDER BY entry_date ASC, created_at ASC`,
        values
      );
      return res.rows;
    });
    return { entries: rows };
  });

  // Create entry.
  app.post("/api/v1/forecast/cash-entries", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const b = entryBody.safeParse(req.body ?? {});
    if (!b.success) return sendZodValidation(reply, b.error);
    await assertCompanyMembership(user.uuid, b.data.operating_company_id);
    const row = await withOperatingCompanyScope(user.uuid, b.data.operating_company_id, async (client) => {
      const res = await client.query(
        `INSERT INTO forecast.cash_entries
           (operating_company_id, entry_date, direction, amount_cents, party_name, invoice_no,
            category, memo, ref_kind, ref_label, ref_external_id, created_by_user_id, updated_by_user_id)
         VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::uuid,$12::uuid)
         RETURNING *`,
        [b.data.operating_company_id, b.data.entry_date, b.data.direction, b.data.amount_cents,
         b.data.party_name ?? null, b.data.invoice_no ?? null, b.data.category ?? null, b.data.memo ?? null,
         b.data.ref_kind ?? null, b.data.ref_label ?? null, b.data.ref_external_id ?? null, user.uuid]
      );
      const created = res.rows[0];
      await appendCrudAudit(client, user.uuid, "forecast.cash_entry.created", {
        resource_id: created?.id,
        resource_type: "forecast.cash_entries",
      });
      return created;
    });
    return reply.code(201).send(row);
  });

  // Update entry.
  app.patch("/api/v1/forecast/cash-entries/:id", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const p = idParams.safeParse(req.params ?? {});
    if (!p.success) return sendZodValidation(reply, p.error);
    const b = entryPatch.safeParse(req.body ?? {});
    if (!b.success) return sendZodValidation(reply, b.error);
    await assertCompanyMembership(user.uuid, b.data.operating_company_id);
    const col: Record<string, unknown> = {
      entry_date: b.data.entry_date, direction: b.data.direction, amount_cents: b.data.amount_cents,
      party_name: b.data.party_name, invoice_no: b.data.invoice_no, category: b.data.category, memo: b.data.memo,
      ref_kind: b.data.ref_kind, ref_label: b.data.ref_label, ref_external_id: b.data.ref_external_id,
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [k, v] of Object.entries(col)) {
      if (v !== undefined) { values.push(v); sets.push(`${k} = $${values.length}`); }
    }
    if (sets.length === 0) return reply.code(400).send({ error: "no_fields" });
    values.push(user.uuid); sets.push(`updated_by_user_id = $${values.length}`);
    sets.push("updated_at = now()");
    values.push(p.data.id);
    const updated = await withOperatingCompanyScope(user.uuid, b.data.operating_company_id, async (client) => {
      const res = await client.query(
        `UPDATE forecast.cash_entries SET ${sets.join(", ")}
          WHERE id = $${values.length} AND deactivated_at IS NULL RETURNING *`,
        values
      );
      const row = res.rows[0] ?? null;
      if (row) {
        await appendCrudAudit(client, user.uuid, "forecast.cash_entry.updated", {
          resource_id: p.data.id,
          resource_type: "forecast.cash_entries",
        });
      }
      return row;
    });
    if (!updated) return reply.code(404).send({ error: "not_found" });
    return updated;
  });

  // Soft-delete entry (void-not-delete).
  app.delete("/api/v1/forecast/cash-entries/:id", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const p = idParams.safeParse(req.params ?? {});
    if (!p.success) return sendZodValidation(reply, p.error);
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return sendZodValidation(reply, q.error);
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const deleted = await withOperatingCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const res = await client.query(
        `UPDATE forecast.cash_entries SET deactivated_at = now(), updated_by_user_id = $2::uuid
          WHERE id = $1 AND deactivated_at IS NULL RETURNING id`,
        [p.data.id, user.uuid]
      );
      const row = res.rows[0] ?? null;
      if (row) {
        await appendCrudAudit(client, user.uuid, "forecast.cash_entry.deleted", {
          resource_id: p.data.id,
          resource_type: "forecast.cash_entries",
        });
      }
      return row;
    });
    if (!deleted) return reply.code(404).send({ error: "not_found" });
    return { ok: true };
  });

  // Get opening balance.
  app.get("/api/v1/forecast/opening-balance", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const q = companyQuery.safeParse(req.query ?? {});
    if (!q.success) return sendZodValidation(reply, q.error);
    await assertCompanyMembership(user.uuid, q.data.operating_company_id);
    const row = await withOperatingCompanyScope(user.uuid, q.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT operating_company_id, amount_cents, as_of_date, updated_at
           FROM forecast.opening_balance WHERE operating_company_id = $1::uuid LIMIT 1`,
        [q.data.operating_company_id]
      );
      return res.rows[0] ?? { operating_company_id: q.data.operating_company_id, amount_cents: 0, as_of_date: null };
    });
    return row;
  });

  // Upsert opening balance.
  app.put("/api/v1/forecast/opening-balance", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const b = openingBalanceBody.safeParse(req.body ?? {});
    if (!b.success) return sendZodValidation(reply, b.error);
    await assertCompanyMembership(user.uuid, b.data.operating_company_id);
    const row = await withOperatingCompanyScope(user.uuid, b.data.operating_company_id, async (client) => {
      const res = await client.query(
        `INSERT INTO forecast.opening_balance (operating_company_id, amount_cents, as_of_date, created_by_user_id, updated_by_user_id)
         VALUES ($1::uuid, $2, $3, $4::uuid, $4::uuid)
         ON CONFLICT (operating_company_id)
         DO UPDATE SET amount_cents = EXCLUDED.amount_cents, as_of_date = EXCLUDED.as_of_date,
                       updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()
         RETURNING operating_company_id, amount_cents, as_of_date, updated_at`,
        [b.data.operating_company_id, b.data.amount_cents, b.data.as_of_date ?? null, user.uuid]
      );
      await appendCrudAudit(client, user.uuid, "forecast.opening_balance.updated", {
        resource_id: b.data.operating_company_id,
        resource_type: "forecast.opening_balance",
      });
      return res.rows[0];
    });
    return row;
  });
}
