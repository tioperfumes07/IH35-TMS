import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

const customerIdParamSchema = z.object({ customer_id: z.string().uuid() });
const customerContactParamsSchema = z.object({
  customer_id: z.string().uuid(),
  id: z.string().uuid(),
});

const departmentSchema = z.enum(["sales", "billing", "dispatch", "operations", "owner", "other"]);
const listQuerySchema = z.object({
  include_inactive: z.enum(["true", "false"]).optional(),
});

const createContactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  title: z.string().trim().max(120).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().max(50).optional(),
  mobile: z.string().trim().max(50).optional(),
  department: departmentSchema.default("other"),
  is_primary: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const updateContactSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    title: z.string().trim().max(120).nullable().optional(),
    email: z.string().trim().email().nullable().optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    mobile: z.string().trim().max(50).nullable().optional(),
    department: departmentSchema.optional(),
    is_primary: z.boolean().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: "at least one field is required" });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function canManageContacts(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Manager";
}

function canSeeInactive(role: string) {
  return role === "Owner" || role === "Administrator";
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function ensureCustomerExists(
  client: { query: (sql: string, values: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  customerId: string
) {
  const res = await client.query(
    `
      SELECT id
      FROM mdata.customers
      WHERE id = $1
        AND deactivated_at IS NULL
      LIMIT 1
    `,
    [customerId]
  );
  return res.rows.length > 0;
}

export async function registerCustomerContactRoutes(app: FastifyInstance) {
  app.get<{ Params: { customer_id: string } }>("/api/v1/mdata/customers/:customer_id/contacts", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    const parsedParams = customerIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedQuery = listQuerySchema.safeParse(req.query ?? {});
    if (!parsedQuery.success) return sendValidationError(reply, parsedQuery.error);

    const includeInactive = parsedQuery.data.include_inactive === "true";
    if (includeInactive && !canSeeInactive(authUser.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    return withCurrentUser(authUser.uuid, async (client) => {
      const hasCustomer = await ensureCustomerExists(client, parsedParams.data.customer_id);
      if (!hasCustomer) return reply.code(404).send({ error: "mdata_customer_not_found" });
      const inactiveFilter = includeInactive ? "" : "AND cc.deactivated_at IS NULL";
      const contactsRes = await client.query(
        `
          SELECT
            cc.uuid AS id,
            cc.customer_uuid AS customer_id,
            cc.name,
            cc.title,
            cc.email,
            cc.phone,
            cc.mobile,
            cc.department,
            cc.is_primary,
            cc.notes,
            cc.deactivated_at,
            cc.created_at,
            cc.updated_at,
            cc.created_by_uuid AS created_by_user_id,
            cc.updated_by_uuid AS updated_by_user_id
          FROM mdata.customer_contacts cc
          WHERE cc.customer_uuid = $1
            ${inactiveFilter}
          ORDER BY cc.is_primary DESC, cc.department, cc.name
        `,
        [parsedParams.data.customer_id]
      );
      return { contacts: contactsRes.rows };
    });
  });

  app.post<{ Params: { customer_id: string } }>("/api/v1/mdata/customers/:customer_id/contacts", async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return;
    if (!canManageContacts(authUser.role)) return reply.code(403).send({ error: "forbidden" });
    const parsedParams = customerIdParamSchema.safeParse(req.params ?? {});
    if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
    const parsedBody = createContactSchema.safeParse(req.body ?? {});
    if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

    return withCurrentUser(authUser.uuid, async (client) => {
      const hasCustomer = await ensureCustomerExists(client, parsedParams.data.customer_id);
      if (!hasCustomer) return reply.code(404).send({ error: "mdata_customer_not_found" });

      if (parsedBody.data.is_primary === true) {
        await client.query(
          `
            UPDATE mdata.customer_contacts
            SET is_primary = false,
                updated_at = now(),
                updated_by_uuid = $2
            WHERE customer_uuid = $1
              AND is_primary = true
              AND deactivated_at IS NULL
          `,
          [parsedParams.data.customer_id, authUser.uuid]
        );
      }

      const res = await client.query(
        `
          INSERT INTO mdata.customer_contacts (
            customer_uuid, name, title, email, phone, mobile, department, is_primary, notes, created_by_uuid, updated_by_uuid
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
          RETURNING
            uuid AS id, customer_uuid AS customer_id, name, title, email, phone, mobile, department, is_primary, notes, deactivated_at, created_at, updated_at
        `,
        [
          parsedParams.data.customer_id,
          parsedBody.data.name,
          parsedBody.data.title ?? null,
          parsedBody.data.email ?? null,
          parsedBody.data.phone ?? null,
          parsedBody.data.mobile ?? null,
          parsedBody.data.department,
          parsedBody.data.is_primary ?? false,
          parsedBody.data.notes ?? null,
          authUser.uuid,
        ]
      );
      const contact = res.rows[0];
      await appendCrudAudit(
        client,
        authUser.uuid,
        "mdata.customer_contacts.created",
        {
          resource_id: contact.id,
          resource_type: "mdata.customer_contacts",
          customer_id: parsedParams.data.customer_id,
          department: contact.department,
          is_primary: contact.is_primary,
        },
        "info",
        "BT-1-CUSTOMER-FULL-PROFILE"
      );
      if (contact.is_primary) {
        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.customer_contacts.set_primary",
          {
            resource_id: contact.id,
            resource_type: "mdata.customer_contacts",
            customer_id: parsedParams.data.customer_id,
          },
          "info",
          "BT-1-CUSTOMER-FULL-PROFILE"
        );
      }
      return reply.code(201).send({ contact });
    });
  });

  app.patch<{ Params: { customer_id: string; id: string } }>(
    "/api/v1/mdata/customers/:customer_id/contacts/:id",
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      if (!canManageContacts(authUser.role)) return reply.code(403).send({ error: "forbidden" });
      const parsedParams = customerContactParamsSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);
      const parsedBody = updateContactSchema.safeParse(req.body ?? {});
      if (!parsedBody.success) return sendValidationError(reply, parsedBody.error);

      return withCurrentUser(authUser.uuid, async (client) => {
        const hasCustomer = await ensureCustomerExists(client, parsedParams.data.customer_id);
        if (!hasCustomer) return reply.code(404).send({ error: "mdata_customer_not_found" });

        const existingRes = await client.query(
          `
            SELECT uuid, customer_uuid, is_primary
            FROM mdata.customer_contacts
            WHERE uuid = $1
              AND customer_uuid = $2
            LIMIT 1
          `,
          [parsedParams.data.id, parsedParams.data.customer_id]
        );
        if (existingRes.rows.length === 0) return reply.code(404).send({ error: "mdata_customer_contact_not_found" });

        if (parsedBody.data.is_primary === true) {
          await client.query(
            `
              UPDATE mdata.customer_contacts
              SET is_primary = false,
                  updated_at = now(),
                  updated_by_uuid = $2
              WHERE customer_uuid = $1
                AND is_primary = true
                AND uuid <> $3
                AND deactivated_at IS NULL
            `,
            [parsedParams.data.customer_id, authUser.uuid, parsedParams.data.id]
          );
        }

        const fields: string[] = [];
        const values: unknown[] = [];
        for (const [key, value] of Object.entries(parsedBody.data)) {
          if (value !== undefined) {
            values.push(value);
            fields.push(`${key} = $${values.length}`);
          }
        }
        fields.push("updated_at = now()");
        values.push(authUser.uuid);
        fields.push(`updated_by_uuid = $${values.length}`);
        values.push(parsedParams.data.id);
        values.push(parsedParams.data.customer_id);

        const updatedRes = await client.query(
          `
            UPDATE mdata.customer_contacts
            SET ${fields.join(", ")}
            WHERE uuid = $${values.length - 1}
              AND customer_uuid = $${values.length}
            RETURNING
              uuid AS id, customer_uuid AS customer_id, name, title, email, phone, mobile, department, is_primary, notes, deactivated_at, created_at, updated_at
          `,
          values
        );
        if (updatedRes.rows.length === 0) return reply.code(404).send({ error: "mdata_customer_contact_not_found" });
        const contact = updatedRes.rows[0];

        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.customer_contacts.updated",
          {
            resource_id: contact.id,
            resource_type: "mdata.customer_contacts",
            customer_id: parsedParams.data.customer_id,
            changes: parsedBody.data,
          },
          "info",
          "BT-1-CUSTOMER-FULL-PROFILE"
        );
        if (parsedBody.data.is_primary === true) {
          await appendCrudAudit(
            client,
            authUser.uuid,
            "mdata.customer_contacts.set_primary",
            {
              resource_id: contact.id,
              resource_type: "mdata.customer_contacts",
              customer_id: parsedParams.data.customer_id,
            },
            "info",
            "BT-1-CUSTOMER-FULL-PROFILE"
          );
        }
        return { contact };
      });
    }
  );

  app.delete<{ Params: { customer_id: string; id: string } }>(
    "/api/v1/mdata/customers/:customer_id/contacts/:id",
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      if (!canManageContacts(authUser.role)) return reply.code(403).send({ error: "forbidden" });
      const parsedParams = customerContactParamsSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

      return withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          `
            UPDATE mdata.customer_contacts
            SET deactivated_at = now(),
                is_primary = false,
                updated_at = now(),
                updated_by_uuid = $3
            WHERE uuid = $1
              AND customer_uuid = $2
              AND deactivated_at IS NULL
          `,
          [parsedParams.data.id, parsedParams.data.customer_id, authUser.uuid]
        );
        if ((res.rowCount ?? 0) === 0) return reply.code(404).send({ error: "mdata_customer_contact_not_found" });
        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.customer_contacts.deactivated",
          {
            resource_id: parsedParams.data.id,
            resource_type: "mdata.customer_contacts",
            customer_id: parsedParams.data.customer_id,
          },
          "info",
          "BT-1-CUSTOMER-FULL-PROFILE"
        );
        return { ok: true };
      });
    }
  );

  app.post<{ Params: { customer_id: string; id: string } }>(
    "/api/v1/mdata/customers/:customer_id/contacts/:id/reactivate",
    async (req, reply) => {
      const authUser = currentAuthUser(req, reply);
      if (!authUser) return;
      if (!canManageContacts(authUser.role)) return reply.code(403).send({ error: "forbidden" });
      const parsedParams = customerContactParamsSchema.safeParse(req.params ?? {});
      if (!parsedParams.success) return sendValidationError(reply, parsedParams.error);

      return withCurrentUser(authUser.uuid, async (client) => {
        const res = await client.query(
          `
            UPDATE mdata.customer_contacts
            SET deactivated_at = NULL,
                updated_at = now(),
                updated_by_uuid = $3
            WHERE uuid = $1
              AND customer_uuid = $2
              AND deactivated_at IS NOT NULL
            RETURNING uuid, customer_uuid, is_primary
          `,
          [parsedParams.data.id, parsedParams.data.customer_id, authUser.uuid]
        );
        if (res.rows.length === 0) return reply.code(404).send({ error: "mdata_customer_contact_not_found" });
        await appendCrudAudit(
          client,
          authUser.uuid,
          "mdata.customer_contacts.reactivated",
          {
            resource_id: parsedParams.data.id,
            resource_type: "mdata.customer_contacts",
            customer_id: parsedParams.data.customer_id,
          },
          "info",
          "BT-1-CUSTOMER-FULL-PROFILE"
        );
        return { ok: true };
      });
    }
  );
}
