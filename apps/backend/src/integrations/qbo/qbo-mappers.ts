import { withLuciaBypass } from "../../auth/db.js";

type BankTxnInput = {
  transactionDate: string;
  amountCents: number;
  description: string | null;
  vendorQboId?: string | null;
  expenseAccountQboId: string;
  classQboId?: string | null;
};

function sanitizeSegment(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .replace(/--+/g, "-")
    .replace(/^-|-$/g, "");
}

export function deriveQboClass(driverLastName?: string | null, unitNumber?: string | null) {
  const unit = sanitizeSegment(unitNumber || "UNKNOWN");
  const last = sanitizeSegment(driverLastName || "UNASSIGNED");
  return `${unit}-${last}`.slice(0, 100);
}

export function mapBankTxnToExpense(input: BankTxnInput) {
  const amount = Math.abs(Number(input.amountCents) / 100);
  const detail: Record<string, unknown> = {
    AccountRef: { value: input.expenseAccountQboId },
  };
  if (input.classQboId) {
    detail.ClassRef = { value: input.classQboId };
  }
  return {
    TxnDate: input.transactionDate,
    PaymentType: "Cash",
    PrivateNote: input.description ?? "Bank transaction sync",
    ...(input.vendorQboId ? { EntityRef: { value: input.vendorQboId, type: "Vendor" } } : {}),
    Line: [
      {
        Amount: amount,
        Description: input.description ?? "Bank transaction sync",
        DetailType: "AccountBasedExpenseLineDetail",
        AccountBasedExpenseLineDetail: detail,
      },
    ],
  };
}

export function mapBankTxnToBill(input: BankTxnInput) {
  const amount = Math.abs(Number(input.amountCents) / 100);
  const detail: Record<string, unknown> = {
    AccountRef: { value: input.expenseAccountQboId },
  };
  if (input.classQboId) detail.ClassRef = { value: input.classQboId };
  return {
    TxnDate: input.transactionDate,
    PrivateNote: input.description ?? "Bank transaction sync",
    VendorRef: input.vendorQboId ? { value: input.vendorQboId } : undefined,
    Line: [
      {
        Amount: amount,
        Description: input.description ?? "Bank transaction sync",
        DetailType: "AccountBasedExpenseLineDetail",
        AccountBasedExpenseLineDetail: detail,
      },
    ],
  };
}

export async function extractVendorIdFromForensic(operatingCompanyId: string, vendorName: string) {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const res = await client.query<{ qbo_entity_id: string }>(
      `
        SELECT qbo_entity_id
        FROM qbo_archive.entities_snapshot
        WHERE operating_company_id = $1
          AND qbo_entity_type = 'Vendor'
          AND (
            LOWER(raw_snapshot->>'DisplayName') = LOWER($2)
            OR LOWER(raw_snapshot->>'FullyQualifiedName') = LOWER($2)
            OR LOWER(raw_snapshot->>'PrintOnCheckName') = LOWER($2)
          )
        ORDER BY snapshot_taken_at DESC
        LIMIT 1
      `,
      [operatingCompanyId, vendorName]
    );
    return res.rows[0]?.qbo_entity_id ?? null;
  });
}

