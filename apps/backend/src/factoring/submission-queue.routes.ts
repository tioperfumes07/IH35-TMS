import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { listSubmissionQueueInvoices, listWorkqueueInvoices } from "./submission-queue.service.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

// LINK-F5171/LINK-F5181: reverse_link -- optional filters so a customer/load's own reverse section
// can query its own submission-queue rows server-side.
const submissionQueueQuerySchema = companyQuerySchema.extend({
  customer_id: z.string().uuid().optional(),
  load_id: z.string().uuid().optional(),
});

export async function registerSubmissionQueueRoutes(app: FastifyInstance) {
  // GET /api/v1/factoring/submission-queue
  // Lists invoices eligible for factoring WITH doc-gate status per invoice.
  // An invoice is_submittable only when both POD (approved) + Rate Confirmation are present.
  app.get("/api/v1/factoring/submission-queue", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = submissionQueueQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const items = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      listSubmissionQueueInvoices(query.data.operating_company_id, {
        client,
        customerId: query.data.customer_id,
        loadId: query.data.load_id,
      })
    );
    return { items };
  });

  // GET /api/v1/factoring/workqueue
  // McLeod-parity clerk board: per-invoice factoring status, advance/reserve/fee/chargeback context,
  // recourse expiry days for risk awareness.
  app.get("/api/v1/factoring/workqueue", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const items = await withCompanyScope(user.uuid, query.data.operating_company_id, (client) =>
      listWorkqueueInvoices(query.data.operating_company_id, { client })
    );
    return { items };
  });

  // POST /api/v1/factoring/submission-queue/submit-batch
  // Validates doc-gate on each selected invoice BEFORE creating the batch.
  // Blocks with docs_missing_error if any invoice fails the gate.
  // On success: creates draft batch, submits it, and writes an audit row.
  app.post("/api/v1/factoring/submission-queue/submit-batch", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const allowed = ["Owner", "Administrator", "Manager", "Accountant"];
    if (!allowed.includes(user.role)) return reply.code(403).send({ error: "forbidden" });

    const body = z
      .object({
        operating_company_id: z.string().uuid(),
        invoice_ids: z.array(z.string().uuid()).min(1),
      })
      .safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const { operating_company_id, invoice_ids } = body.data;

    type DocError = { ok: false; code: string; items: Array<{ invoice_id: string; display_id: string | null; missing_docs: string[] }> };
    type BatchOk = { ok: true; batch: unknown };

    const result = await withCompanyScope(user.uuid, operating_company_id, async (client): Promise<DocError | BatchOk> => {
      // Re-validate doc gate for every selected invoice
      const queueItems = await listSubmissionQueueInvoices(operating_company_id, { client });
      const queueById = new Map(queueItems.map((item) => [item.invoice_id, item]));

      const docErrors: Array<{ invoice_id: string; display_id: string | null; missing_docs: string[] }> = [];
      for (const id of invoice_ids) {
        const item = queueById.get(id);
        if (!item || !item.is_submittable) {
          docErrors.push({
            invoice_id: id,
            display_id: item?.display_id ?? null,
            missing_docs: item?.missing_docs ?? ["Invoice not found or not eligible"],
          });
        }
      }

      if (docErrors.length > 0) {
        return { ok: false, code: "docs_missing", items: docErrors };
      }

      // Create draft batch using the existing batch service
      const { createDraftBatch, submitBatch } = await import("./batch.service.js");
      const draft = await createDraftBatch(operating_company_id, invoice_ids, { client });
      const submitted = await submitBatch(draft.id, operating_company_id, { client });

      // Audit: every submission writes one audit row per FACT-PAR-1
      await appendCrudAudit(
        client,
        user.uuid,
        "factoring.batch.submitted",
        {
          resource_type: "factoring.batch",
          resource_id: submitted.id,
          operating_company_id,
          batch_number: submitted.batch_number,
          invoice_count: invoice_ids.length,
          invoice_ids,
          channel: "manual_download",
        },
        "info",
        "FACT-PAR-1"
      );

      return { ok: true, batch: submitted };
    });

    if (!result.ok) {
      return reply.code(422).send({ error: result.code, items: result.items });
    }
    return reply.code(201).send(result.batch);
  });
}
