import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { applyFaroCollectionInClientTx, CollectionApplyError } from "./collection-apply.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

const replayBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  daily_import_id: z.string().uuid().optional(),
});

export async function registerCollectionReplayRoutes(app: FastifyInstance) {
  // POST /api/v1/factoring/collection/replay
  // Idempotent replay: runs applyFaroCollectionInClientTx over every factor.faro_invoice_lines row
  // that does not yet have a matching accounting.payment (payment_source_kind='factoring_collection',
  // reference=invoice_number). Skips rows already applied (service-layer idempotency).
  // Secured-borrowing posting: Dr 2150 factoring_advance_liability / Cr 1100 ar_control.
  app.post(
    "/api/v1/factoring/collection/replay",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentAuthUser(req, reply);
      if (!user) return;

      const ALLOWED_ROLES = new Set(["Owner", "Administrator", "Accountant"]);
      if (!ALLOWED_ROLES.has(user.role)) {
        return reply.code(403).send({ error: "collection_replay_role_required" });
      }

      const body = replayBodySchema.safeParse(req.body ?? {});
      if (!body.success) return validationError(reply, body.error);

      const { operating_company_id: oci, daily_import_id: dailyImportId } = body.data;

      const result = await withCompanyScope(user.uuid, oci, async (client) => {
        // Fetch faro_invoice_lines rows — optionally filtered by daily_import_id
        const params: (string | undefined)[] = [oci];
        let importFilter = "";
        if (dailyImportId) {
          params.push(dailyImportId);
          importFilter = `AND fil.daily_import_id = $${params.length}::uuid`;
        }

        const linesRes = await (client as DbClient).query<{
          invoice_number: string;
          gross_amount_cents: string;
          daily_import_id: string;
          due_on: string | null;
        }>(
          `SELECT fil.invoice_number,
                  fil.gross_amount_cents::bigint AS gross_amount_cents,
                  fil.daily_import_id::text AS daily_import_id,
                  fil.due_on::text AS due_on
             FROM factor.faro_invoice_lines fil
            WHERE fil.operating_company_id = $1::uuid
              AND fil.superseded_at IS NULL
              ${importFilter}
            ORDER BY fil.due_on ASC NULLS LAST, fil.invoice_number ASC`,
          params
        );

        const lines = linesRes.rows;
        const beforeCount = await countPayments(client as DbClient, oci);
        const beforePaid = await countPaidInvoices(client as DbClient, oci);

        const applied: string[] = [];
        const skipped: string[] = [];
        const errors: Array<{ invoice_number: string; error: string }> = [];

        for (const line of lines) {
          // Find the invoice by display_id = invoice_number
          const invRes = await (client as DbClient).query<{
            id: string;
            customer_id: string;
            factoring_status: string;
            amount_open_cents: string;
            voided_at: string | null;
          }>(
            `SELECT id::text, customer_id::text, factoring_status,
                    amount_open_cents::bigint AS amount_open_cents, voided_at::text
               FROM accounting.invoices
              WHERE operating_company_id = $1::uuid
                AND display_id = $2
                AND voided_at IS NULL
              LIMIT 1`,
            [oci, line.invoice_number]
          );
          const inv = invRes.rows[0];
          if (!inv) {
            errors.push({ invoice_number: line.invoice_number, error: "invoice_not_found" });
            continue;
          }
          if (!["advanced", "reserve_held"].includes(inv.factoring_status)) {
            skipped.push(line.invoice_number);
            continue;
          }

          const payDate = line.due_on ?? new Date().toISOString().slice(0, 10);
          const remittanceRef = `faro-${line.daily_import_id.slice(0, 8)}-${line.invoice_number}`;

          try {
            const r = await applyFaroCollectionInClientTx(client as DbClient, {
              operating_company_id: oci,
              invoice_id: inv.id,
              amount_paid_cents: Number(line.gross_amount_cents),
              date_paid: payDate,
              remittance_ref: remittanceRef,
              actor_user_id: user.uuid,
              actor_role: user.role,
            });
            if (r.already_applied) {
              skipped.push(line.invoice_number);
            } else {
              applied.push(line.invoice_number);
            }
          } catch (err) {
            const code = err instanceof CollectionApplyError ? err.code : String(err);
            errors.push({ invoice_number: line.invoice_number, error: code });
          }
        }

        const afterCount = await countPayments(client as DbClient, oci);
        const afterPaid = await countPaidInvoices(client as DbClient, oci);

        return {
          total_lines: lines.length,
          applied_count: applied.length,
          skipped_count: skipped.length,
          error_count: errors.length,
          payments_before: beforeCount,
          payments_after: afterCount,
          invoices_paid_before: beforePaid,
          invoices_paid_after: afterPaid,
          applied,
          errors,
        };
      });

      return reply.code(200).send(result);
    }
  );
}

async function countPayments(client: DbClient, oci: string): Promise<number> {
  const r = await client.query<{ cnt: string }>(
    `SELECT COUNT(*)::bigint AS cnt FROM accounting.payments
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND payment_source_kind = 'factoring_collection'`,
    [oci]
  );
  return Number(r.rows[0]?.cnt ?? 0);
}

async function countPaidInvoices(client: DbClient, oci: string): Promise<number> {
  const r = await client.query<{ cnt: string }>(
    `SELECT COUNT(*)::bigint AS cnt FROM accounting.invoices
      WHERE operating_company_id = $1::uuid AND voided_at IS NULL AND factoring_status = 'collected'`,
    [oci]
  );
  return Number(r.rows[0]?.cnt ?? 0);
}
