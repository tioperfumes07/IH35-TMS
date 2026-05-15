import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { putObjectBytes, isR2Configured } from "../storage/r2-client.js";
import { computeBankTransactionDedupHash, normalizeBankTransactionDescription } from "../banking/bank-tx-dedup.js";
import { requireDriverSession } from "./auth.js";

const fieldSchema = z.object({
  truck_id: z.string().uuid(),
  odometer: z.coerce.number().int().min(0).max(9_999_999),
  amount: z.coerce.number().positive().max(9_999),
  station_name: z.string().trim().min(1).max(200),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerDriverFuelReceiptRoutes(app: FastifyInstance) {
  app.post("/api/v1/driver/fuel/upload-receipt", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    const user = req.user;
    if (!driver || !user) return reply.code(403).send({ error: "forbidden" });

    let imageBuf: Buffer | null = null;
    let contentType = "image/jpeg";
    const fields: Record<string, string> = {};
    const parts = req.parts();
    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "image") {
        imageBuf = await part.toBuffer();
        contentType = part.mimetype || contentType;
      } else if (part.type === "field") {
        fields[part.fieldname] = String(part.value ?? "").trim();
      }
    }

    const parsed = fieldSchema.safeParse(fields);
    if (!parsed.success) return sendValidationError(reply, parsed.error);
    if (!imageBuf || imageBuf.length < 32) return reply.code(400).send({ error: "image_required" });
    if (imageBuf.length > 8 * 1024 * 1024) return reply.code(413).send({ error: "image_too_large" });
    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });

    try {
      const result = await withCurrentUser(user.uuid, async (client) => {
        const driverCtx = await client.query<{ operating_company_id: string | null }>(
          `SELECT operating_company_id FROM mdata.drivers WHERE id = $1 LIMIT 1`,
          [driver.id]
        );
        const operatingCompanyId = driverCtx.rows[0]?.operating_company_id ?? null;
        if (!operatingCompanyId) throw new Error("driver_company_missing");

        const truckOk = await client.query(
          `
            SELECT 1 FROM mdata.units
            WHERE id = $1::uuid
              AND deactivated_at IS NULL
              AND (assigned_driver_id IS NULL OR assigned_driver_id = $2::uuid)
            LIMIT 1
          `,
          [parsed.data.truck_id, driver.id]
        );
        if (truckOk.rows.length === 0) throw new Error("truck_not_allowed");

        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

        const acct = await client.query<{ id: string }>(
          `
            SELECT id
            FROM banking.bank_accounts
            WHERE operating_company_id = $1::uuid
            ORDER BY (plaid_item_id IS NULL), created_at ASC
            LIMIT 1
          `,
          [operatingCompanyId]
        );
        const bankAccountId = acct.rows[0]?.id ?? null;
        if (!bankAccountId) throw new Error("no_bank_account");

        const txnDate = new Date().toISOString().slice(0, 10);
        const amountCents = Math.round(parsed.data.amount * 100);
        const desc = `${parsed.data.station_name} — fuel receipt (driver ${driver.id.slice(0, 8)})`;
        const normalizedDescription = normalizeBankTransactionDescription(desc);
        const dedupHash = computeBankTransactionDedupHash({
          bank_account_id: bankAccountId,
          transaction_date: txnDate,
          amount_cents: amountCents,
          normalized_description: normalizedDescription,
        });

        const fileId = randomUUID();
        const r2Key = `receipts/${driver.id}/${txnDate}/${fileId}.jpg`;
        await putObjectBytes(r2Key, imageBuf, contentType);

        const txnId = randomUUID();
        await client.query(
          `
            INSERT INTO banking.bank_transactions (
              id,
              bank_account_id,
              operating_company_id,
              transaction_date,
              posted_date,
              amount_cents,
              description,
              merchant_name,
              plaid_category,
              pending,
              is_credit,
              notes,
              source,
              normalized_description,
              dedup_hash,
              receipt_evidence_r2_key,
              status,
              created_at,
              updated_at
            )
            VALUES (
              $1::uuid,
              $2::uuid,
              $3::uuid,
              $4::date,
              $4::date,
              $5::bigint,
              $6::text,
              $7::text,
              '{}',
              false,
              false,
              $8::text,
              'manual',
              $9::text,
              $10::text,
              $11::text,
              'pending_categorization',
              now(),
              now()
            )
          `,
          [
            txnId,
            bankAccountId,
            operatingCompanyId,
            txnDate,
            amountCents,
            desc,
            parsed.data.station_name,
            `odometer=${parsed.data.odometer}; truck_id=${parsed.data.truck_id}`,
            normalizedDescription,
            dedupHash,
            r2Key,
          ]
        );

        await appendCrudAudit(
          client,
          user.uuid,
          "driver.fuel_receipt.uploaded",
          {
            bank_transaction_id: txnId,
            r2_key: r2Key,
            truck_id: parsed.data.truck_id,
            amount_cents: amountCents,
          },
          "info",
          "P7-BLOCK-K-FUEL"
        );

        return { bank_transaction_id: txnId, receipt_r2_key: r2Key };
      });

      return reply.code(201).send(result);
    } catch (err) {
      const msg = String((err as Error).message ?? "");
      if (msg === "driver_company_missing") return reply.code(404).send({ error: "driver_company_not_found" });
      if (msg === "truck_not_allowed") return reply.code(403).send({ error: "truck_not_allowed" });
      if (msg === "no_bank_account") return reply.code(409).send({ error: "no_bank_account_for_company" });
      throw err;
    }
  });
}
