// R-190 Check Creator — per-bank check stock settings + number allocator.
//
// Spec law (R-154 §3c): next_check_number starts NULL. The owner types the first real number
// (Print Checks screen or Write Check). Never invent a starting number. Once a number is used
// (Write Check with an explicit number, or print-batch assignment), next_check_number advances to
// used+1 so the next Write Check / print batch is gapless.
import type { PoolClient } from "pg";

export class CheckStockError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "CheckStockError";
    this.code = code;
  }
}

export type CheckStockSettings = {
  bank_account_id: string;
  operating_company_id: string;
  next_check_number: string | null;
  check_type: "voucher" | "standard";
  offset_x_mm: string;
  offset_y_mm: string;
  print_company_address: boolean;
};

/**
 * Owner types the starting number (or updates stock). Upserts the row for this bank account.
 * next_check_number may be null (stock row exists but owner has not typed a start yet).
 */
export async function upsertCheckStockSettings(
  client: PoolClient,
  input: {
    operating_company_id: string;
    bank_account_id: string;
    next_check_number: string | null;
    check_type?: "voucher" | "standard";
    /** ROUND 326 queue item 15: print position + company-address toggle, now writable (were SELECT-only). */
    offset_x_mm?: number;
    offset_y_mm?: number;
    print_company_address?: boolean;
    actor_user_id: string;
  }
): Promise<CheckStockSettings> {
  if (input.next_check_number != null) {
    const n = BigInt(input.next_check_number);
    if (n <= 0n) {
      throw new CheckStockError("CHECK_STOCK_NUMBER_INVALID", "Starting check number must be a positive integer.");
    }
  }

  const bankRes = await client.query<{ id: string; account_class: string | null }>(
    `SELECT id::text, account_class
       FROM banking.bank_accounts
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND is_active IS TRUE
        AND deactivated_at IS NULL`,
    [input.bank_account_id, input.operating_company_id]
  );
  if (!bankRes.rows[0]) {
    throw new CheckStockError("BANK_ACCOUNT_NOT_FOUND", "Bank account not found in this company.");
  }
  if (bankRes.rows[0].account_class && bankRes.rows[0].account_class !== "depository") {
    throw new CheckStockError("BANK_ACCOUNT_NOT_DEPOSITORY", "Check stock is only for depository (checking) bank accounts.");
  }

  // ROUND 326 queue item 15: an omitted check_type / offset / toggle KEEPS the stored value (the print page used to
  // overwrite the saved style with 'voucher' on every save of the starting number).
  const res = await client.query<CheckStockSettings>(
    `INSERT INTO banking.check_stock_settings
       (bank_account_id, operating_company_id, next_check_number, check_type, offset_x_mm, offset_y_mm, print_company_address, updated_at, updated_by_user_id)
     VALUES ($1::uuid, $2::uuid, $3::bigint, COALESCE($4, 'voucher'), COALESCE($6::numeric, 0), COALESCE($7::numeric, 0), COALESCE($8::boolean, true), now(), $5::uuid)
     ON CONFLICT (bank_account_id) DO UPDATE SET
       next_check_number = EXCLUDED.next_check_number,
       check_type = COALESCE($4, banking.check_stock_settings.check_type),
       offset_x_mm = COALESCE($6::numeric, banking.check_stock_settings.offset_x_mm),
       offset_y_mm = COALESCE($7::numeric, banking.check_stock_settings.offset_y_mm),
       print_company_address = COALESCE($8::boolean, banking.check_stock_settings.print_company_address),
       updated_at = now(),
       updated_by_user_id = EXCLUDED.updated_by_user_id,
       operating_company_id = EXCLUDED.operating_company_id
     RETURNING bank_account_id::text, operating_company_id::text,
               next_check_number::text AS next_check_number, check_type,
               offset_x_mm::text, offset_y_mm::text, print_company_address`,
    [input.bank_account_id, input.operating_company_id, input.next_check_number, input.check_type ?? null, input.actor_user_id, input.offset_x_mm ?? null, input.offset_y_mm ?? null, input.print_company_address ?? null]
  );
  return res.rows[0];
}

export async function getCheckStockSettings(
  client: PoolClient,
  operating_company_id: string,
  bank_account_id: string
): Promise<CheckStockSettings | null> {
  const res = await client.query<CheckStockSettings>(
    `SELECT bank_account_id::text, operating_company_id::text,
            next_check_number::text AS next_check_number, check_type,
            offset_x_mm::text, offset_y_mm::text, print_company_address
       FROM banking.check_stock_settings
      WHERE bank_account_id = $1::uuid AND operating_company_id = $2::uuid`,
    [bank_account_id, operating_company_id]
  );
  return res.rows[0] ?? null;
}

/**
 * After a check number is issued (Write Check) or assigned (print batch), advance next_check_number
 * to max(current_next, used+1). Creates the stock row if missing so the next Write Check has a hint.
 * The used number itself was typed by the operator (or assigned from a previously typed start) —
 * never invents a starting number from thin air.
 */
export async function advanceCheckStockAfterUse(
  client: PoolClient,
  input: {
    operating_company_id: string;
    bank_account_id: string;
    used_check_number: string;
    actor_user_id: string;
  }
): Promise<void> {
  let used: bigint;
  try {
    used = BigInt(input.used_check_number);
  } catch {
    // Non-numeric manual numbers (legacy) do not drive the allocator.
    return;
  }
  if (used <= 0n) return;
  const next = (used + 1n).toString();

  await client.query(
    `INSERT INTO banking.check_stock_settings
       (bank_account_id, operating_company_id, next_check_number, check_type, updated_at, updated_by_user_id)
     VALUES ($1::uuid, $2::uuid, $3::bigint, 'voucher', now(), $4::uuid)
     ON CONFLICT (bank_account_id) DO UPDATE SET
       next_check_number = GREATEST(
         COALESCE(banking.check_stock_settings.next_check_number, 0),
         EXCLUDED.next_check_number
       ),
       updated_at = now(),
       updated_by_user_id = EXCLUDED.updated_by_user_id
     WHERE banking.check_stock_settings.operating_company_id = $2::uuid`,
    [input.bank_account_id, input.operating_company_id, next, input.actor_user_id]
  );
}
