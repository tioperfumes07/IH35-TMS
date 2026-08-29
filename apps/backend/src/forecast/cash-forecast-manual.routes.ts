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
  entry_id: z.string().uuid().optional(),
  party_ref_kind: z.enum(["customer", "driver", "vendor"]).optional(),
  party_ref_id: z.string().uuid().optional(),
  ref_kind: z.enum(["unit"]).optional(),
  ref_external_id: z.string().uuid().optional(),
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
  // Part B snapshot refs (read-only display copies, no FK): income row = load/unit/customer
  // auto-filled from a picked load; expense row = driver/vendor party.
  load_ref_id: z.string().trim().max(120).nullish(),
  load_ref_label: z.string().trim().max(200).nullish(),
  unit_ref_label: z.string().trim().max(200).nullish(),
  customer_ref_label: z.string().trim().max(200).nullish(),
  party_ref_kind: z.enum(["customer", "driver", "vendor"]).nullish(),
  party_ref_id: z.string().uuid().nullish(),
  party_ref_label: z.string().trim().max(200).nullish(),
});
const entryPatch = entryBody.partial().extend({ operating_company_id: z.string().uuid() });
const openingBalanceBody = z.object({
  operating_company_id: z.string().uuid(),
  amount_cents: z.number().int(),
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});

export async function registerCashForecastManualRoutes(app: FastifyInstance) {
  const auth = (req: FastifyRequest, reply: FastifyReply) => {
    if (!requireAuth(req, reply)) return reply;
    const user = req.user as { uuid: string; role: string };
    if (!officeRole(String(user.role ?? ""))) {
      reply.code(403).send({ error: "forbidden" });
      return null;
    }
    return user;
  };

  // List entries (date-range optional), entity-scoped.
  app.get("/api/v1/forecast/cash-entries", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      if (q.data.entry_id) { values.push(q.data.entry_id); filters.push(`id = $${values.length}::uuid`); }
      if (q.data.party_ref_kind) { values.push(q.data.party_ref_kind); filters.push(`party_ref_kind = $${values.length}`); }
      // party_ref_id is a snapshot identity stored as TEXT (migration 202606170100), even
      // though the API validates canonical entity ids as UUIDs. Keep the request contract
      // strict, but bind the SQL parameter as text so customer/vendor/driver reverse reads
      // do not ask Postgres to evaluate `text = uuid` (42883).
      if (q.data.party_ref_id) { values.push(q.data.party_ref_id); filters.push(`party_ref_id = $${values.length}::text`); }
      if (q.data.ref_kind) { values.push(q.data.ref_kind); filters.push(`ref_kind = $${values.length}`); }
      if (q.data.ref_external_id) { values.push(q.data.ref_external_id); filters.push(`ref_external_id = $${values.length}`); }
      const res = await client.query(
        `SELECT id, entry_date, direction, amount_cents, party_name, invoice_no, category, memo,
                ref_kind, ref_label, ref_external_id,
                load_ref_id, load_ref_label, unit_ref_label, customer_ref_label,
                party_ref_kind, party_ref_id, party_ref_label,
                created_at, updated_at
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
  app.post("/api/v1/forecast/cash-entries", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const b = entryBody.safeParse(req.body ?? {});
    if (!b.success) return sendZodValidation(reply, b.error);
    await assertCompanyMembership(user.uuid, b.data.operating_company_id);
    const row = await withOperatingCompanyScope(user.uuid, b.data.operating_company_id, async (client) => {
      let refLabel = b.data.ref_label ?? null;
      if (b.data.ref_kind === "unit") {
        if (!b.data.ref_external_id) throw Object.assign(new Error("Select a unit."), { statusCode: 400 });
        const unit = await client.query<{ label: string }>(
          `SELECT unit_number AS label FROM mdata.units WHERE id = $1::uuid AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid LIMIT 1`,
          [b.data.ref_external_id, b.data.operating_company_id],
        );
        if (!unit.rows[0]) throw Object.assign(new Error("Unit does not belong to this operating company."), { statusCode: 400 });
        refLabel = unit.rows[0].label;
      }
      let partyName = b.data.party_name ?? null;
      let partyRefLabel = b.data.party_ref_label ?? null;
      if (b.data.party_ref_kind === "driver") {
        if (!b.data.party_ref_id) throw Object.assign(new Error("Select a driver."), { statusCode: 400 });
        const driver = await client.query<{ label: string }>(
          `SELECT trim(concat_ws(' ', first_name, last_name)) AS label
             FROM mdata.drivers
            WHERE id = $1::uuid AND operating_company_id = $2::uuid
            LIMIT 1`,
          [b.data.party_ref_id, b.data.operating_company_id],
        );
        if (!driver.rows[0]) throw Object.assign(new Error("Driver does not belong to this operating company."), { statusCode: 400 });
        partyName = driver.rows[0].label;
        partyRefLabel = driver.rows[0].label;
      } else if (b.data.party_ref_kind === "customer") {
        if (!b.data.party_ref_id) throw Object.assign(new Error("Select a customer."), { statusCode: 400 });
        const customer = await client.query<{ label: string }>(
          `SELECT customer_name AS label FROM mdata.customers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
          [b.data.party_ref_id, b.data.operating_company_id],
        );
        if (!customer.rows[0]) throw Object.assign(new Error("Customer does not belong to this operating company."), { statusCode: 400 });
        partyName = customer.rows[0].label;
        partyRefLabel = customer.rows[0].label;
      } else if (b.data.party_ref_kind === "vendor") {
        if (!b.data.party_ref_id) throw Object.assign(new Error("Select a vendor."), { statusCode: 400 });
        const vendor = await client.query<{ label: string }>(
          `SELECT vendor_name AS label FROM mdata.vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
          [b.data.party_ref_id, b.data.operating_company_id],
        );
        if (!vendor.rows[0]) throw Object.assign(new Error("Vendor does not belong to this operating company."), { statusCode: 400 });
        partyName = vendor.rows[0].label;
        partyRefLabel = vendor.rows[0].label;
      }
      const res = await client.query(
        `INSERT INTO forecast.cash_entries
           (operating_company_id, entry_date, direction, amount_cents, party_name, invoice_no,
            category, memo, ref_kind, ref_label, ref_external_id,
            load_ref_id, load_ref_label, unit_ref_label, customer_ref_label,
            party_ref_kind, party_ref_id, party_ref_label,
            created_by_user_id, updated_by_user_id)
         VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::uuid,$19::uuid)
         RETURNING *`,
        [b.data.operating_company_id, b.data.entry_date, b.data.direction, b.data.amount_cents,
         partyName, b.data.invoice_no ?? null, b.data.category ?? null, b.data.memo ?? null,
         b.data.ref_kind ?? null, refLabel, b.data.ref_external_id ?? null,
         b.data.load_ref_id ?? null, b.data.load_ref_label ?? null, b.data.unit_ref_label ?? null,
         b.data.customer_ref_label ?? null, b.data.party_ref_kind ?? null, b.data.party_ref_id ?? null,
         partyRefLabel, user.uuid]
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
  app.patch("/api/v1/forecast/cash-entries/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
      load_ref_id: b.data.load_ref_id, load_ref_label: b.data.load_ref_label,
      unit_ref_label: b.data.unit_ref_label, customer_ref_label: b.data.customer_ref_label,
      party_ref_kind: b.data.party_ref_kind, party_ref_id: b.data.party_ref_id,
      party_ref_label: b.data.party_ref_label,
    };
    const sets: string[] = [];
    const values: unknown[] = [];
    for (const [k, v] of Object.entries(col)) {
      if (v !== undefined) { values.push(v); sets.push(`${k} = $${values.length}`); }
    }
    if (sets.length === 0) return reply.code(400).send({ error: "no_fields" });
    const updated = await withOperatingCompanyScope(user.uuid, b.data.operating_company_id, async (client) => {
      if (b.data.ref_kind === "unit") {
        if (!b.data.ref_external_id) throw Object.assign(new Error("Select a unit."), { statusCode: 400 });
        const unit = await client.query<{ label: string }>(
          `SELECT unit_number AS label FROM mdata.units WHERE id = $1::uuid AND COALESCE(currently_leased_to_company_id, owner_company_id) = $2::uuid LIMIT 1`,
          [b.data.ref_external_id, b.data.operating_company_id],
        );
        if (!unit.rows[0]) throw Object.assign(new Error("Unit does not belong to this operating company."), { statusCode: 400 });
        const labelIndex = sets.findIndex((set) => set.startsWith("ref_label ="));
        if (labelIndex >= 0) values[labelIndex] = unit.rows[0].label;
        else { values.push(unit.rows[0].label); sets.push(`ref_label = $${values.length}`); }
      }
      if (b.data.party_ref_kind === "driver") {
        if (!b.data.party_ref_id) throw Object.assign(new Error("Select a driver."), { statusCode: 400 });
        const driver = await client.query<{ label: string }>(
          `SELECT trim(concat_ws(' ', first_name, last_name)) AS label
             FROM mdata.drivers
            WHERE id = $1::uuid AND operating_company_id = $2::uuid
            LIMIT 1`,
          [b.data.party_ref_id, b.data.operating_company_id],
        );
        if (!driver.rows[0]) throw Object.assign(new Error("Driver does not belong to this operating company."), { statusCode: 400 });
        const label = driver.rows[0].label;
        const refLabelIndex = sets.findIndex((set) => set.startsWith("party_ref_label ="));
        if (refLabelIndex >= 0) values[refLabelIndex] = label;
        else { values.push(label); sets.push(`party_ref_label = $${values.length}`); }
        const partyNameIndex = sets.findIndex((set) => set.startsWith("party_name ="));
        if (partyNameIndex >= 0) values[partyNameIndex] = label;
        else { values.push(label); sets.push(`party_name = $${values.length}`); }
      } else if (b.data.party_ref_kind === "customer") {
        if (!b.data.party_ref_id) throw Object.assign(new Error("Select a customer."), { statusCode: 400 });
        const customer = await client.query<{ label: string }>(
          `SELECT customer_name AS label FROM mdata.customers WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
          [b.data.party_ref_id, b.data.operating_company_id],
        );
        if (!customer.rows[0]) throw Object.assign(new Error("Customer does not belong to this operating company."), { statusCode: 400 });
        const label = customer.rows[0].label;
        const refLabelIndex = sets.findIndex((set) => set.startsWith("party_ref_label ="));
        if (refLabelIndex >= 0) values[refLabelIndex] = label;
        else { values.push(label); sets.push(`party_ref_label = $${values.length}`); }
        const partyNameIndex = sets.findIndex((set) => set.startsWith("party_name ="));
        if (partyNameIndex >= 0) values[partyNameIndex] = label;
        else { values.push(label); sets.push(`party_name = $${values.length}`); }
      } else if (b.data.party_ref_kind === "vendor") {
        if (!b.data.party_ref_id) throw Object.assign(new Error("Select a vendor."), { statusCode: 400 });
        const vendor = await client.query<{ label: string }>(
          `SELECT vendor_name AS label FROM mdata.vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1`,
          [b.data.party_ref_id, b.data.operating_company_id],
        );
        if (!vendor.rows[0]) throw Object.assign(new Error("Vendor does not belong to this operating company."), { statusCode: 400 });
        const label = vendor.rows[0].label;
        const refLabelIndex = sets.findIndex((set) => set.startsWith("party_ref_label ="));
        if (refLabelIndex >= 0) values[refLabelIndex] = label;
        else { values.push(label); sets.push(`party_ref_label = $${values.length}`); }
        const partyNameIndex = sets.findIndex((set) => set.startsWith("party_name ="));
        if (partyNameIndex >= 0) values[partyNameIndex] = label;
        else { values.push(label); sets.push(`party_name = $${values.length}`); }
      }
      values.push(user.uuid); sets.push(`updated_by_user_id = $${values.length}`);
      sets.push("updated_at = now()");
      values.push(p.data.id);
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
  app.delete("/api/v1/forecast/cash-entries/:id", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
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
  app.get("/api/v1/forecast/opening-balance", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
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
