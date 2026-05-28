import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { enforcePseSelection, type PseEnforcementInput } from "./pse-mirror.service.js";
import { companyQuerySchema, currentAuthUser, withCompanyScope } from "./shared.js";

export class PseEnforcementError extends Error {
  constructor(
    readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = "PseEnforcementError";
  }
}

export type EnforcedPseSelection = {
  ps_category_qbo_id: string;
  ps_item_qbo_id: string;
  qbo_account_id: string | null;
  category_coa_account_id: string | null;
  item_coa_account_id: string | null;
  resolved_coa_account_id: string | null;
};

export async function enforcePsePostingSelection(
  userId: string,
  operatingCompanyId: string,
  input: PseEnforcementInput
): Promise<EnforcedPseSelection> {
  try {
    return await enforcePseSelection(userId, operatingCompanyId, input);
  } catch (error) {
    const message = String((error as Error)?.message ?? "pse_enforcement_failed");
    throw new PseEnforcementError(message, message);
  }
}

async function isEnforcementEnabled(userId: string, operatingCompanyId: string) {
  return withCompanyScope(userId, operatingCompanyId, async (client) => {
    const res = await client.query(
      `
        SELECT enforce_posting
        FROM accounting.pse_posting_policy
        WHERE tenant_id = $1::uuid
        LIMIT 1
      `,
      [operatingCompanyId]
    );
    const row = res.rows[0] as { enforce_posting?: boolean } | undefined;
    if (!row) return true;
    return Boolean(row.enforce_posting);
  });
}

export async function assertBillPsePostingEnforced(userId: string, operatingCompanyId: string, billId: string) {
  if (!(await isEnforcementEnabled(userId, operatingCompanyId))) {
    return { enforced: false, skipped: true };
  }

  return withCompanyScope(userId, operatingCompanyId, async (client) => {
    const billRes = await client.query(
      `
        SELECT
          ps_category_qbo_id,
          ps_item_qbo_id
        FROM accounting.bills
        WHERE operating_company_id = $1::uuid
          AND id = $2::uuid
        LIMIT 1
      `,
      [operatingCompanyId, billId]
    );
    const bill = billRes.rows[0] as { ps_category_qbo_id: string | null; ps_item_qbo_id: string | null } | undefined;
    if (!bill) throw new PseEnforcementError("bill_not_found", "Bill not found");

    const linesRes = await client.query(
      `
        SELECT line_sequence, ps_category_qbo_id, ps_item_qbo_id, amount::text
        FROM accounting.bill_lines
        WHERE bill_id = $1::uuid
        ORDER BY line_sequence ASC
      `,
      [billId]
    );

    const lines = linesRes.rows as Array<{
      line_sequence: number;
      ps_category_qbo_id: string | null;
      ps_item_qbo_id: string | null;
      amount: string;
    }>;

    if (lines.length === 0) {
      return { enforced: true, skipped: false, validated_lines: 0 };
    }

    for (const line of lines) {
      if (Number(line.amount ?? "0") <= 0) continue;
      const category = (line.ps_category_qbo_id ?? bill.ps_category_qbo_id)?.trim();
      const item = (line.ps_item_qbo_id ?? bill.ps_item_qbo_id)?.trim();
      if (!category || !item) {
        throw new PseEnforcementError(
          "pse_posting_required",
          `Bill line ${line.line_sequence} requires ps_category_qbo_id and ps_item_qbo_id`
        );
      }
      await enforcePseSelection(userId, operatingCompanyId, {
        psCategoryQboId: category,
        psItemQboId: item,
      });
    }

    return { enforced: true, skipped: false, validated_lines: lines.length };
  });
}

const postBodySchema = z.object({
  source_transaction_type: z.enum(["invoice", "bill", "customer_payment", "bill_payment"]),
  source_transaction_id: z.string().trim().min(1),
});

export function mapPseEnforcementHttpError(error: PseEnforcementError) {
  const code = error.code;
  if (
    code === "pse_category_not_found" ||
    code === "pse_item_not_found" ||
    code === "pse_item_category_mismatch" ||
    code === "pse_account_not_found" ||
    code === "pse_account_mismatch" ||
    code === "pse_posting_required"
  ) {
    return { statusCode: 409 as const, body: { error: code, message: error.message } };
  }
  return { statusCode: 400 as const, body: { error: code, message: error.message } };
}

export async function enforcePsePostingOnBillPost(req: FastifyRequest, reply: FastifyReply) {
  const user = currentAuthUser(req, reply);
  if (!user) return false;

  const query = companyQuerySchema.safeParse(req.query ?? {});
  if (!query.success) return true;

  const body = postBodySchema.safeParse(req.body ?? {});
  if (!body.success) return true;
  if (body.data.source_transaction_type !== "bill") return true;

  try {
    await assertBillPsePostingEnforced(String(user.uuid), query.data.operating_company_id, body.data.source_transaction_id);
    return true;
  } catch (error) {
    if (error instanceof PseEnforcementError) {
      const mapped = mapPseEnforcementHttpError(error);
      reply.code(mapped.statusCode).send(mapped.body);
      return false;
    }
    throw error;
  }
}
