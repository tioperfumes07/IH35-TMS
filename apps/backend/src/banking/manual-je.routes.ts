import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { createJournalEntry } from "../accounting/journal-entries.service.js";
import { emitBankingSpineEvent } from "./banking-spine-emit.js";

const manualJeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  memo: z.string().trim().max(500).optional(),
  lines: z
    .array(
      z.object({
        account_id: z.string().uuid(),
        dr_amount: z.number().min(0).default(0),
        cr_amount: z.number().min(0).default(0),
      })
    )
    .min(2),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: {
    query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[]; rowCount?: number }>;
  }) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client);
  });
}

export async function registerBankingManualJeRoutes(app: FastifyInstance) {
  app.post("/api/v1/banking/manual-je", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!["Owner", "Administrator", "Manager", "Accountant"].includes(user.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const body = manualJeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    // H-1 FIX (Tier-1): post through the SAME canonical service the accounting path uses — writes
    // accounting.journal_entry_postings (the GL table the trial balance reads), cents-integer + balance-enforced
    // by ensure_journal_entry_balanced. This REPLACES the prior write to the forbidden orphan lines table
    // (the one verify-accounting-backbone-schema / verify-double-entry-balance-trigger guard against) that the
    // GL never read, so a manual JE booked here did not move the books. One canonical posting path now.
    //
    // Map each banking dollar line {dr_amount|cr_amount} → a canonical posting {debit_or_credit, amount_cents}.
    // Dollars → integer cents (also removes the float balance seam, dr/cr in cents).
    const postings: Array<{ account_id: string; debit_or_credit: "debit" | "credit"; amount_cents: number }> = [];
    for (const line of b.lines) {
      const drCents = Math.round(Number(line.dr_amount || 0) * 100);
      const crCents = Math.round(Number(line.cr_amount || 0) * 100);
      if (drCents > 0) postings.push({ account_id: line.account_id, debit_or_credit: "debit", amount_cents: drCents });
      if (crCents > 0) postings.push({ account_id: line.account_id, debit_or_credit: "credit", amount_cents: crCents });
    }

    let je: { id: string };
    try {
      je = await createJournalEntry(
        {
          operating_company_id: b.operating_company_id,
          entry_date: b.date,
          memo: b.memo ?? null,
          source: "manual",
          postings,
        },
        { userId: String(user.uuid), role: user.role }
      );
    } catch (err) {
      const msg = (err as Error)?.message ?? "journal_entry_error";
      if (
        ["journal_entry_not_balanced", "journal_entry_requires_debit_and_credit", "journal_entry_min_two_lines_required"].includes(
          msg
        )
      ) {
        return reply.code(400).send({ error: msg });
      }
      throw err;
    }

    // Additive (decision c — KEEP the banking signals), now referencing the CANONICAL posted JE id.
    // createJournalEntry already wrote its own canonical audit + WF-064 + QBO sync enqueue; these are the
    // banking-surface-specific signals (audit row + outbox event + banking spine) preserved as-is.
    void withCompanyScope(user.uuid, b.operating_company_id, async (client) => {
      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.manual_je.created",
        {
          resource_type: "accounting.journal_entries",
          resource_id: je.id,
          operating_company_id: b.operating_company_id,
          source: "banking_manual_je",
          posting_count: postings.length,
        },
        "info",
        "BT-3-BANKING-REBUILD"
      );
      await client.query(
        `
          INSERT INTO outbox.outbox_queue (aggregate_type, aggregate_id, event_type, payload)
          VALUES ($1, $2, $3, $4::jsonb)
        `,
        [
          "accounting.journal_entries",
          je.id,
          "accounting.manual_je.created",
          JSON.stringify({ journal_entry_id: je.id, operating_company_id: b.operating_company_id, source: "banking_manual_je" }),
        ]
      );
      await emitBankingSpineEvent(client, {
        operating_company_id: b.operating_company_id,
        actor_user_id: String(user.uuid),
        event_type: "banking.manual_je.created",
        entity_id: je.id,
        entity_type: "journal_entry",
        source_table: "accounting.journal_entries",
        payload: { posting_count: postings.length },
      });
    }).catch(() => undefined);

    return reply.code(201).send(je);
  });
}
