import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError } from "./shared.js";
import {
  createJournalEntry,
  getJournalEntryDetail,
  listJournalEntries,
  voidJournalEntry,
} from "./journal-entries.service.js";

const sourceSchema = z.enum(["manual", "auto"]);
const statusSchema = z.enum(["posted", "voided"]);

const postingSchema = z.object({
  account_id: z.string().uuid(),
  class_id: z.string().uuid().nullable().optional(),
  entity_uuid: z.string().uuid().nullable().optional(),
  debit_or_credit: z.enum(["debit", "credit"]),
  amount_cents: z.coerce.number().int().positive(),
  description: z.string().trim().max(500).nullable().optional(),
});

const createJournalEntryBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: z.string().trim().max(2000).nullable().optional(),
  source: sourceSchema.optional().default("manual"),
  postings: z.array(postingSchema).min(2),
});

const listQuerySchema = companyQuerySchema.extend({
  source: sourceSchema.optional(),
  status: statusSchema.optional(),
  account_id: z.string().uuid().optional(),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const idParamSchema = z.object({ id: z.string().uuid() });

const voidBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  reason: z.string().trim().min(3).max(1000),
});

function canAccessAccounting(role: string) {
  return role === "Owner" || role === "Administrator" || role === "Accountant";
}

export async function registerJournalEntryRoutes(app: FastifyInstance) {
  app.post("/api/v1/accounting/journal-entries", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(user.role)) return reply.code(403).send({ error: "forbidden" });
    const body = createJournalEntryBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const created = await createJournalEntry(body.data, { userId: user.uuid, role: user.role });
      return reply.code(201).send(created);
    } catch (error) {
      const message = String((error as Error)?.message ?? "journal_entry_create_failed");
      if (
        message === "journal_entry_min_two_lines_required" ||
        message === "journal_entry_requires_debit_and_credit" ||
        message === "journal_entry_not_balanced"
      ) {
        return reply.code(400).send({ error: message });
      }
      throw error;
    }
  });

  app.get("/api/v1/accounting/journal-entries", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const items = await listJournalEntries({
      userId: user.uuid,
      operating_company_id: query.data.operating_company_id,
      source: query.data.source,
      status: query.data.status,
      account_id: query.data.account_id,
      from_date: query.data.from_date,
      to_date: query.data.to_date,
      limit: query.data.limit,
      offset: query.data.offset,
    });
    return { journal_entries: items };
  });

  app.get("/api/v1/accounting/journal-entries/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!canAccessAccounting(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    try {
      const item = await getJournalEntryDetail(user.uuid, query.data.operating_company_id, params.data.id);
      return item;
    } catch (error) {
      const message = String((error as Error)?.message ?? "journal_entry_not_found");
      if (message === "journal_entry_not_found") return reply.code(404).send({ error: message });
      throw error;
    }
  });

  app.post("/api/v1/accounting/journal-entries/:id/void", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);
    try {
      const result = await voidJournalEntry(body.data.operating_company_id, params.data.id, body.data.reason, {
        userId: user.uuid,
        role: user.role,
      });
      return result;
    } catch (error) {
      const message = String((error as Error)?.message ?? "journal_entry_void_failed");
      if (message === "forbidden_owner_only") return reply.code(403).send({ error: message });
      if (message === "journal_entry_not_found") return reply.code(404).send({ error: message });
      if (message === "journal_entry_already_voided") return reply.code(409).send({ error: message });
      throw error;
    }
  });
}


export default fp(async (app) => {
  await registerJournalEntryRoutes(app);
}, { name: "accounting.registerJournalEntryRoutes" });
