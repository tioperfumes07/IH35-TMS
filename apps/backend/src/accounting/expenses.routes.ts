import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { reassignDraftAttachments } from "../documents/attachments.service.js";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { attributeExpenseToLoad } from "../expense-attribution/attribute.service.js";
import { generateExpenseNumber } from "../expense-attribution/expense-number.js";
import { emitAccountingSpineEvent } from "./accounting-spine-emit.js";
import { postSourceTransaction, reversePostedSourceTransaction, PostingEngineError } from "./posting-engine.service.js";
import { canVoid, isVoidEnforcementEnabled } from "./void.service.js";
import { isEnabled } from "../lib/feature-flags/service.js";

export const EXPENSE_GL_POSTING_FLAG_KEY = "EXPENSE_GL_POSTING_ENABLED";

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

async function relationExists(client: any, fqName: string): Promise<boolean> {
  const res = await client.query(`SELECT to_regclass($1::text) IS NOT NULL AS ok`, [fqName]);
  return Boolean(res.rows[0]?.ok);
}

async function columnExists(client: any, schema: string, table: string, column: string): Promise<boolean> {
  const res = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = $3
      ) AS ok
    `,
    [schema, table, column]
  );
  return Boolean(res.rows[0]?.ok);
}

async function emitOutbox(client: any, eventType: string, payload: Record<string, unknown>) {
  /* outbox-handler-parity: literal-types=["expense.created.attributed","expense.created.unattributed","expense.reattributed"] */
  await client.query(`INSERT INTO outbox.events (event_type, payload, next_retry_at) VALUES ($1, $2::jsonb, now())`, [
    eventType,
    JSON.stringify(payload),
  ]);
}

async function insertUnattributedAlert(client: any, operatingCompanyId: string, expenseId: string) {
  const ok = await relationExists(client, "qbo.sync_alerts");
  if (!ok) return;

  await client.query(
    `
      INSERT INTO qbo.sync_alerts (
        operating_company_id,
        entity_type,
        entity_id,
        operation,
        error_message,
        severity,
        replay_hint,
        error_payload
      )
      VALUES (
        $1,
        'expense_unattributed',
        $2::uuid,
        'sync',
        'Could not auto-attribute expense to a load',
        'warning',
        NULL,
        jsonb_build_object('reason', 'auto_attribute_miss')
      )
    `,
    [operatingCompanyId, expenseId]
  );
}

const createExpenseBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  // Draft id used by UploadZone for create-time receipts; reconciled onto the real expense id in the
  // same txn (Option B — docs/specs/ATTACHMENT-DRAFT-LINKAGE-FIX.md).
  attachment_draft_id: z.string().uuid().optional().nullable(),
  driver_id: z.string().uuid(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount_cents: z.coerce.number().int().positive(),
  vendor_uuid: z.string().uuid().optional(),
  memo: z.string().trim().max(2000).optional(),
  payment_account_uuid: z.string().uuid().optional(),
  location_lat: z.number().finite().optional(),
  location_lng: z.number().finite().optional(),
});

const reattributeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  new_load_id: z.string().uuid(),
  reason: z.string().trim().min(5).max(500),
});

export async function registerExpenseRoutes(app: FastifyInstance) {
  app.post("/api/v1/expenses", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const parsed = createExpenseBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    try {
      const payload = await withCompanyScope(user.uuid, body.operating_company_id, async (client) => {
        if (!(await relationExists(client, "accounting.expenses"))) {
          return { unavailable: true as const };
        }

        // Money stays on the integer-cents spine (Gate 2 / GAP-EXPENSES Phase 1):
        // store amount_cents directly into accounting.expenses.total_amount_cents.
        // No floating dollars on the money path.

        const hasVendor = await columnExists(client, "accounting", "expenses", "vendor_uuid");
        const driverColumn = (await columnExists(client, "accounting", "expenses", "driver_uuid"))
          ? "driver_uuid"
          : (await columnExists(client, "accounting", "expenses", "driver_id"))
            ? "driver_id"
            : null;
        const hasMemo = await columnExists(client, "accounting", "expenses", "memo");
        const hasExpenseNumber = await columnExists(client, "accounting", "expenses", "expense_number");
        const hasLoadId = await columnExists(client, "accounting", "expenses", "load_id");
        const hasPaymentAccount = await columnExists(client, "accounting", "expenses", "payment_account_uuid");

        const columns: string[] = ["operating_company_id", "status", "transaction_date", "total_amount_cents"];
        const values: unknown[] = [body.operating_company_id, "posted", body.expense_date, body.amount_cents];

        if (hasVendor) {
          columns.push(`vendor_uuid`);
          values.push(body.vendor_uuid ?? null);
        }

        if (driverColumn) {
          columns.push(driverColumn);
          values.push(body.driver_id);
        }

        if (hasMemo) {
          columns.push(`memo`);
          values.push(body.memo ?? null);
        }

        if (hasPaymentAccount) {
          columns.push(`payment_account_uuid`);
          values.push(body.payment_account_uuid ?? null);
        }

        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
        const insertSql = `
          INSERT INTO accounting.expenses (${columns.join(", ")})
          VALUES (${placeholders})
          RETURNING id
        `;

        const inserted = await client.query(insertSql, values);
        const expenseId = String((inserted.rows[0] as { id?: string } | undefined)?.id ?? "");
        if (!expenseId) throw new Error("expense_insert_failed");

        // Option B: link create-time draft receipts to the real expense id, atomically with the insert.
        await reassignDraftAttachments(client, {
          operatingCompanyId: body.operating_company_id,
          entityType: "expense",
          draftId: body.attachment_draft_id,
          newId: expenseId,
        });

        const attribution = await attributeExpenseToLoad(client, {
          driverId: body.driver_id,
          operatingCompanyId: body.operating_company_id,
          expenseTimestamp: new Date(`${body.expense_date}T12:00:00.000Z`),
          expenseLocation:
            body.location_lat != null && body.location_lng != null
              ? { lat: body.location_lat, lng: body.location_lng }
              : undefined,
        });

        let expenseNumber: string | null = null;

        if (attribution) {
          const numbered = await generateExpenseNumber(client, attribution.loadId);

          await client.query(
            `
              INSERT INTO expense_attribution.expense_load_links (
                operating_company_id,
                expense_id,
                expense_source,
                load_id,
                load_number,
                expense_seq,
                expense_number,
                attribution_method,
                attribution_confidence,
                attribution_reason,
                attributed_by_user_id
              )
              VALUES ($1,$2,'accounting',$3,$4,$5,$6,$7,$8,$9,$10)
            `,
            [
              body.operating_company_id,
              expenseId,
              attribution.loadId,
              numbered.loadNumber,
              numbered.seq,
              numbered.number,
              attribution.method,
              attribution.confidence,
              attribution.reason,
              user.uuid,
            ]
          );

          expenseNumber = numbered.number;

          if (hasExpenseNumber) {
            await client.query(`UPDATE accounting.expenses SET expense_number = $2 WHERE id = $1`, [expenseId, numbered.number]);
          }
          if (hasLoadId) {
            await client.query(`UPDATE accounting.expenses SET load_id = $2 WHERE id = $1`, [expenseId, attribution.loadId]);
          }

          await emitOutbox(client, "expense.created.attributed", {
            expense_id: expenseId,
            operating_company_id: body.operating_company_id,
            load_id: attribution.loadId,
            expense_number: numbered.number,
          });

          await appendCrudAudit(client, user.uuid, "expense.created", { expense_id: expenseId, attributed: true }, "info", "P6-T11176");
        } else {
          await insertUnattributedAlert(client, body.operating_company_id, expenseId);
          await emitOutbox(client, "expense.created.unattributed", {
            expense_id: expenseId,
            operating_company_id: body.operating_company_id,
            driver_id: body.driver_id,
          });
          await appendCrudAudit(client, user.uuid, "expense.created", { expense_id: expenseId, attributed: false }, "warning", "P6-T11176");
        }

        return { expense_id: expenseId, expense_number: expenseNumber };
      });

      if ("unavailable" in payload) return reply.code(501).send({ error: "accounting_expenses_schema_missing" });
      void withCompanyScope(user.uuid, (payload as { operating_company_id?: string })?.operating_company_id ?? body.operating_company_id, (client) =>
        emitAccountingSpineEvent(client, {
          operating_company_id: body.operating_company_id,
          actor_user_id: String(user.uuid),
          event_type: "expense.created",
          entity_id: (payload as { id?: string })?.id ?? "",
          entity_type: "expense",
          source_table: "accounting.expenses",
        })
      ).catch(() => undefined);
      return reply.code(201).send(payload);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      if (code === "23505") return reply.code(409).send({ error: "expense_conflict" });
      throw error;
    }
  });

  app.post("/api/v1/expenses/:expenseId/reattribute", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(String(user.role ?? ""))) return reply.code(403).send({ error: "forbidden" });

    const params = z.object({ expenseId: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const parsed = reattributeBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    try {
      const payload = await withCompanyScope(user.uuid, body.operating_company_id, async (client) => {
        if (!(await relationExists(client, "accounting.expenses"))) {
          return { unavailable: true as const };
        }

        const linkRes = await client.query(
          `
            SELECT id, expense_number
            FROM expense_attribution.expense_load_links
            WHERE expense_source = 'accounting'
              AND expense_id = $1
              AND operating_company_id = $2
            LIMIT 1
          `,
          [params.data.expenseId, body.operating_company_id]
        );

        const existingLink = (linkRes.rows[0] as { id: string; expense_number: string | null } | undefined) ?? null;
        const priorNumber = existingLink?.expense_number ?? null;

        const numbered = await generateExpenseNumber(client, body.new_load_id);

        if (existingLink?.id) {
          await client.query(
            `
              UPDATE expense_attribution.expense_load_links
              SET load_id = $2,
                  load_number = $3,
                  expense_seq = $4,
                  expense_number = $5,
                  attribution_method = 'manual_override',
                  attribution_confidence = 'high',
                  attribution_reason = $6,
                  attributed_at = now(),
                  attributed_by_user_id = $7,
                  overridden_from_expense_number = COALESCE(overridden_from_expense_number, $8)
              WHERE id = $1
            `,
            [
              existingLink.id,
              body.new_load_id,
              numbered.loadNumber,
              numbered.seq,
              numbered.number,
              body.reason,
              user.uuid,
              priorNumber,
            ]
          );
        } else {
          await client.query(
            `
              INSERT INTO expense_attribution.expense_load_links (
                operating_company_id,
                expense_id,
                expense_source,
                load_id,
                load_number,
                expense_seq,
                expense_number,
                attribution_method,
                attribution_confidence,
                attribution_reason,
                attributed_by_user_id,
                overridden_from_expense_number
              )
              VALUES ($1,$2,'accounting',$3,$4,$5,$6,'manual_override','high',$7,$8,$9)
            `,
            [
              body.operating_company_id,
              params.data.expenseId,
              body.new_load_id,
              numbered.loadNumber,
              numbered.seq,
              numbered.number,
              body.reason,
              user.uuid,
              priorNumber,
            ]
          );
        }

        if (await columnExists(client, "accounting", "expenses", "expense_number")) {
          await client.query(`UPDATE accounting.expenses SET expense_number = $2 WHERE id = $1`, [
            params.data.expenseId,
            numbered.number,
          ]);
        }
        if (await columnExists(client, "accounting", "expenses", "load_id")) {
          await client.query(`UPDATE accounting.expenses SET load_id = $2 WHERE id = $1`, [params.data.expenseId, body.new_load_id]);
        }

        await emitOutbox(client, "expense.reattributed", {
          expense_id: params.data.expenseId,
          operating_company_id: body.operating_company_id,
          new_load_id: body.new_load_id,
          expense_number: numbered.number,
          prior_expense_number: priorNumber,
        });

        await appendCrudAudit(
          client,
          user.uuid,
          "expense.reattributed",
          {
            expense_id: params.data.expenseId,
            new_load_id: body.new_load_id,
            expense_number: numbered.number,
            prior_expense_number: priorNumber,
          },
          "info",
          "P6-T11176"
        );

        return { expense_number: numbered.number };
      });

      if ("unavailable" in payload) return reply.code(501).send({ error: "accounting_expenses_schema_missing" });
      void withCompanyScope(user.uuid, body.operating_company_id, (client) =>
        emitAccountingSpineEvent(client, {
          operating_company_id: body.operating_company_id,
          actor_user_id: String(user.uuid),
          event_type: "expense.reattributed",
          entity_id: params.data.expenseId,
          entity_type: "expense",
          source_table: "accounting.expenses",
          payload: { new_load_id: body.new_load_id },
        })
      ).catch(() => undefined);
      return reply.code(200).send(payload);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "23503") return reply.code(400).send({ error: "invalid_foreign_key" });
      throw error;
    }
  });

  // GAP-EXPENSES Phase 2 Step 3 — explicit "Post to GL" (gated EXPENSE_GL_POSTING_ENABLED, default OFF).
  app.post("/api/v1/expenses/:expenseId/post", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ expenseId: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const body = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const oci = body.data.operating_company_id;
    const expenseId = params.data.expenseId;

    // Step A (own tx): flag + role + eligibility; synthesize the uncategorized line for a direct
    // (line-less) expense so total_amount_cents = SUM(expense_lines.amount_cents) holds at the flip.
    const pre = await withCompanyScope(user.uuid, oci, async (client) => {
      if (!(await isEnabled(client, EXPENSE_GL_POSTING_FLAG_KEY, { operating_company_id: oci, user_uuid: String(user.uuid) }))) {
        return { kind: "disabled" as const };
      }
      if (!canVoid(String(user.role ?? ""))) return { kind: "forbidden" as const }; // post = Owner + Accountant (decision 4)
      const r = await client.query(
        `SELECT e.posting_status, e.status, e.total_amount_cents::text, e.payment_account_uuid::text, e.vendor_uuid::text,
                (SELECT count(*) FROM accounting.expense_lines l WHERE l.expense_id = e.id)::int AS line_count
         FROM accounting.expenses e WHERE e.id = $1::uuid AND e.operating_company_id = $2::uuid LIMIT 1`,
        [expenseId, oci]
      );
      const exp = r.rows[0] as
        | { posting_status: string; status: string; total_amount_cents: string; payment_account_uuid: string | null; vendor_uuid: string | null; line_count: number }
        | undefined;
      if (!exp) return { kind: "not_found" as const };
      if (exp.status === "void") return { kind: "not_eligible" as const };
      if (exp.posting_status !== "unposted") return { kind: "already_posted" as const };
      // orphan guard (decision 3): no payment account AND no vendor → reject (no orphan payable). Clean 409 here;
      // buildExpenseLines keeps the same guard as the engine-level backstop.
      if (!exp.payment_account_uuid && !exp.vendor_uuid) return { kind: "orphan" as const };
      if (exp.line_count === 0) {
        const cents = Number(exp.total_amount_cents);
        await client.query(
          `INSERT INTO accounting.expense_lines (expense_id, line_sequence, amount_cents, amount, description)
           VALUES ($1::uuid, 1, $2, $3, 'Uncategorized')`,
          [expenseId, cents, cents / 100]
        );
      }
      return { kind: "ok" as const };
    });
    if (pre.kind === "disabled") return reply.code(409).send({ error: "expense_posting_not_enabled" });
    if (pre.kind === "forbidden") return reply.code(403).send({ error: "forbidden_owner_or_accountant_only" });
    if (pre.kind === "not_found") return reply.code(404).send({ error: "expense_not_found" });
    if (pre.kind === "not_eligible") return reply.code(409).send({ error: "expense_not_posting_eligible" });
    if (pre.kind === "already_posted") return reply.code(409).send({ error: "expense_already_posted" });
    if (pre.kind === "orphan") return reply.code(409).send({ error: "expense_orphan_no_payment_account_or_vendor" });

    // Step B: post the balanced JE (own tx, idempotent — re-post returns the existing batch).
    let journalEntryId: string;
    try {
      const posting = await postSourceTransaction(
        { operating_company_id: oci, source_transaction_type: "expense", source_transaction_id: expenseId },
        { userId: String(user.uuid) }
      );
      journalEntryId = posting.journal_entry_id;
    } catch (err) {
      if (err instanceof PostingEngineError) {
        if (err.code === "ACCOUNT_MAPPING_MISSING") return reply.code(409).send({ error: "expense_account_mapping_missing", detail: err.message });
        if (err.code === "PERIOD_LOCKED") return reply.code(409).send({ error: "period_locked" });
        if (err.code === "EXPENSE_NOT_POSTING_ELIGIBLE") return reply.code(409).send({ error: "expense_not_posting_eligible" });
      }
      throw err;
    }

    // Step C: flip the header to posted — Phase-1.5 gate passes (total = sum after synthesis).
    await withCompanyScope(user.uuid, oci, async (client) => {
      await client.query(
        `UPDATE accounting.expenses
         SET posting_status='posted', posted_at=now(), journal_entry_id=$2::uuid, updated_at=now()
         WHERE id=$1::uuid AND operating_company_id=$3::uuid`,
        [expenseId, journalEntryId, oci]
      );
      await appendCrudAudit(client, user.uuid, "expense.posted", { expense_id: expenseId, journal_entry_id: journalEntryId }, "info");
    });
    return reply.code(200).send({ expense_id: expenseId, posting_status: "posted", journal_entry_id: journalEntryId });
  });

  // VOID = reversing JE (posted) / status flip (unposted). Gated VOID_ENFORCEMENT_ENABLED, Owner+Accountant, reason required.
  app.post("/api/v1/expenses/:expenseId/void", async (req: FastifyRequest, reply: FastifyReply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ expenseId: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error" });
    const body = z.object({ operating_company_id: z.string().uuid(), reason: z.string().trim().min(1) }).safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const oci = body.data.operating_company_id;
    const expenseId = params.data.expenseId;

    const pre = await withCompanyScope(user.uuid, oci, async (client) => {
      if (!(await isVoidEnforcementEnabled(client, oci, String(user.uuid)))) return { kind: "disabled" as const };
      if (!canVoid(String(user.role ?? ""))) return { kind: "forbidden" as const };
      const r = await client.query(
        `SELECT posting_status, status FROM accounting.expenses WHERE id=$1::uuid AND operating_company_id=$2::uuid LIMIT 1`,
        [expenseId, oci]
      );
      const exp = r.rows[0] as { posting_status: string; status: string } | undefined;
      if (!exp) return { kind: "not_found" as const };
      if (exp.status === "void" || exp.posting_status === "reversed") return { kind: "already_void" as const };
      return { kind: "ok" as const, posting_status: exp.posting_status };
    });
    if (pre.kind === "disabled") return reply.code(409).send({ error: "void_not_enabled" });
    if (pre.kind === "forbidden") return reply.code(403).send({ error: "forbidden_owner_or_accountant_only" });
    if (pre.kind === "not_found") return reply.code(404).send({ error: "expense_not_found" });
    if (pre.kind === "already_void") return reply.code(409).send({ error: "expense_already_void" });

    let reversingJeId: string | null = null;
    if (pre.posting_status === "posted") {
      try {
        const rev = await reversePostedSourceTransaction(
          { operating_company_id: oci, source_transaction_type: "expense", source_transaction_id: expenseId },
          { userId: String(user.uuid) }
        );
        reversingJeId = rev.journal_entry_id;
      } catch (err) {
        if (err instanceof PostingEngineError && err.code === "PERIOD_LOCKED") return reply.code(409).send({ error: "period_locked" });
        throw err;
      }
    }

    await withCompanyScope(user.uuid, oci, async (client) => {
      await client.query(
        `UPDATE accounting.expenses
         SET status='void',
             posting_status = CASE WHEN posting_status='posted' THEN 'reversed' ELSE posting_status END,
             reversed_by_je_id = COALESCE($2::uuid, reversed_by_je_id),
             voided_at=now(), voided_by_user_id=$3::uuid, void_reason=$4, updated_at=now()
         WHERE id=$1::uuid AND operating_company_id=$5::uuid`,
        [expenseId, reversingJeId, user.uuid, body.data.reason, oci]
      );
      await appendCrudAudit(client, user.uuid, "expense.voided",
        { expense_id: expenseId, reversing_journal_entry_id: reversingJeId, reason: body.data.reason }, "warning");
    });
    return reply.code(200).send({ expense_id: expenseId, status: "void", reversing_journal_entry_id: reversingJeId });
  });
}


export default fp(async (app) => {
  await registerExpenseRoutes(app);
}, { name: "accounting.registerExpenseRoutes" });
