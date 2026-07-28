// MNT-ECON-01 — standalone parts purchase → A/P bill + balanced JE. FINANCIAL-HOLD.
// INERT until PARTS_PURCHASE_GL_POSTING_ENABLED is flipped per entity.
//
// DEFECT: POST /api/v1/maintenance/parts-inventory/purchases only INSERTs
// maintenance.parts_inventory (last_purchase_amount, on_hand_qty). No A/P bill, no JE —
// inventory value / parts expense never reaches the ledger (FOR-CURSOR 4 · MNT-ECON-01).
//
// WRITES ZERO NEW GL MATH. Vendor path: createBill + postSourceTransaction('bill') (same
// CHAIN-03 poster the WO-close path uses). Cash path (no vendor): createJournalEntry with
// Dr maintenance_parts_expense / Cr cash_clearing. Accounts resolve via resolveRoleAccount
// only — never hardcoded numbers/names. Flag OFF => zero bill/JE writes.
//
// POLICY (owner-confirmed direction from MNT-ECON-01 / mod13 design): parts are currently
// expensed (periodic), not capitalized. Role maintenance_parts_expense has NO shape-fallback —
// fails closed until the owner designates. Option B (perpetual inventory_asset) remains a
// separate owner decision (DESIGN-mod13) and is NOT implemented here.

import { withLuciaBypass } from "../../auth/db.js";
import { isEnabled } from "../../lib/feature-flags/service.js";
import { createBill } from "../bills.service.js";
import { createJournalEntry } from "../journal-entries.service.js";
import { postSourceTransaction, PostingEngineError } from "../posting-engine.service.js";
import { resolveRoleAccount } from "../coa-roles/resolver.service.js";
import { appendCrudAudit } from "../../audit/crud-audit.js";

export const PARTS_PURCHASE_GL_POSTING_FLAG = "PARTS_PURCHASE_GL_POSTING_ENABLED";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type PartsPurchasePostResult = {
  posted: boolean;
  reason?:
    | "flag_off"
    | "zero_amount"
    | "already_posted"
    | "parts_row_not_found"
    | "post_failed"
    | "latch_table_missing";
  bill_id?: string;
  journal_entry_id?: string | null;
  memo?: string;
  code?: string;
  message?: string;
};

const FLAG_OFF: PartsPurchasePostResult = { posted: false, reason: "flag_off" };
const PARTS_PURCHASE_LATCH = "accounting.parts_purchase_postings";
const PARTS_PURCHASE_LATCH_MIG = "202609030000_mnt_econ_01_parts_purchase_gl_hop.sql";

/** KR-01 — fail closed until owner Neon-applies the latch mig (KNOWN_RED; not an allowlist). */
async function latchTablePresent(client: DbClient): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(
    `SELECT to_regclass($1::text) IS NOT NULL AS ok`,
    [PARTS_PURCHASE_LATCH]
  );
  return Boolean(res.rows[0]?.ok);
}

export function buildCashPartsPurchasePostings(
  expenseAccountId: string,
  cashAccountId: string,
  amountCents: number,
  memo: string
) {
  return [
    {
      account_id: expenseAccountId,
      debit_or_credit: "debit" as const,
      amount_cents: amountCents,
      description: `${memo} — parts expense`,
    },
    {
      account_id: cashAccountId,
      debit_or_credit: "credit" as const,
      amount_cents: amountCents,
      description: `${memo} — cash paid`,
    },
  ];
}

/** Convert parts_inventory.last_purchase_amount (numeric dollars) to integer cents. */
export function dollarsToCents(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.round(amount * 100);
}

async function postingEnabled(client: DbClient, operatingCompanyId: string): Promise<boolean> {
  return isEnabled(client as never, PARTS_PURCHASE_GL_POSTING_FLAG, {
    operating_company_id: operatingCompanyId,
  });
}

export type PostPartsInventoryPurchaseInput = {
  operating_company_id: string;
  parts_inventory_id: string;
  actor_user_id: string;
  entry_date_iso: string; // YYYY-MM-DD
  part_description: string;
  vendor_id?: string | null;
  vendor_invoice_number?: string | null;
  /** Dollars (matches maintenance.parts_inventory.last_purchase_amount numeric(10,2)). */
  purchase_amount_dollars?: number | null;
};

/**
 * Post the economic hop for a standalone parts purchase.
 * Flag OFF → {posted:false, reason:'flag_off'} — ZERO bill/JE writes (inventory row already committed).
 */
export async function postPartsInventoryPurchase(
  input: PostPartsInventoryPurchaseInput
): Promise<PartsPurchasePostResult> {
  const amountCents = dollarsToCents(Number(input.purchase_amount_dollars ?? 0));
  if (amountCents <= 0) return { posted: false, reason: "zero_amount" };

  const prepared = await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
      input.operating_company_id,
    ]);
    if (!(await postingEnabled(client, input.operating_company_id))) return { gate: "flag_off" as const };

    // to_regclass('accounting.parts_purchase_postings') — KR-01 fail-closed (mig 202609030000)
    if (!(await latchTablePresent(client))) {
      return {
        gate: "latch_table_missing" as const,
        code: "E_PARTS_PURCHASE_SCHEMA_NOT_APPLIED",
        message: `Owner must Neon-apply ${PARTS_PURCHASE_LATCH_MIG} before parts-purchase GL posting can run.`,
      };
    }

    const row = await client.query<{ id: string }>(
      `SELECT id::text FROM maintenance.parts_inventory
       WHERE operating_company_id = $1::uuid AND id = $2::uuid LIMIT 1`,
      [input.operating_company_id, input.parts_inventory_id]
    );
    if (!row.rows[0]?.id) return { gate: "parts_row_not_found" as const };

    const existing = await client.query<{ id: string; bill_id: string | null; expense_je_id: string | null }>(
      `SELECT id::text, bill_id::text, expense_je_id::text
       FROM accounting.parts_purchase_postings
       WHERE operating_company_id = $1::uuid AND parts_inventory_id = $2::uuid AND is_active
       LIMIT 1`,
      [input.operating_company_id, input.parts_inventory_id]
    );
    if (existing.rows[0]?.id) {
      return {
        gate: "already_posted" as const,
        bill_id: existing.rows[0].bill_id ?? undefined,
        journal_entry_id: existing.rows[0].expense_je_id ?? undefined,
      };
    }

    const expenseAccountId = await resolveRoleAccount(
      client,
      input.operating_company_id,
      "maintenance_parts_expense"
    );
    const entryDate = input.entry_date_iso.slice(0, 10);
    const memo = `Parts purchase — ${input.part_description} [${input.parts_inventory_id}]`;

    return {
      gate: "post" as const,
      expenseAccountId,
      entryDate,
      amountCents,
      memo,
      vendorId: input.vendor_id ?? null,
      vendorInvoice: input.vendor_invoice_number ?? null,
    };
  });

  if (prepared.gate === "flag_off") return FLAG_OFF;
  if (prepared.gate === "latch_table_missing") {
    return {
      posted: false,
      reason: "latch_table_missing",
      code: prepared.code,
      message: prepared.message,
    };
  }
  if (prepared.gate === "parts_row_not_found") return { posted: false, reason: "parts_row_not_found" };
  if (prepared.gate === "already_posted") {
    return {
      posted: false,
      reason: "already_posted",
      bill_id: prepared.bill_id,
      journal_entry_id: prepared.journal_entry_id ?? null,
    };
  }

  let billId: string | undefined;
  let journalEntryId: string | null = null;

  try {
    if (prepared.vendorId) {
      // Vendor path — A/P bill + CHAIN-03 bill poster (reuse; no new GL math).
      const bill = await createBill(
        {
          operatingCompanyId: input.operating_company_id,
          vendorId: prepared.vendorId,
          billNumber: prepared.vendorInvoice ?? undefined,
          billDate: prepared.entryDate,
          amountCents: prepared.amountCents,
          memo: prepared.memo,
          lines: [
            {
              amountCents: prepared.amountCents,
              description: prepared.memo,
              accountId: prepared.expenseAccountId,
            },
          ],
        },
        input.actor_user_id
      );
      billId = bill.id;

      const gl = bill.gl_posting;
      if (gl && gl.posted === true) {
        journalEntryId = gl.result.journal_entry_id ?? null;
      } else {
        // PARTS flag is ON — ensure the bill posts even when BILL_GL_POSTING_ENABLED is still OFF.
        const posting = await postSourceTransaction(
          {
            operating_company_id: input.operating_company_id,
            source_transaction_type: "bill",
            source_transaction_id: bill.id,
          },
          { userId: input.actor_user_id }
        );
        journalEntryId = posting.journal_entry_id ?? null;
      }
    } else {
      // Cash purchase — no vendor → no A/P; Dr expense / Cr cash via shared JE poster.
      const cashAccountId = await withLuciaBypass(async (client: DbClient) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
          input.operating_company_id,
        ]);
        return resolveRoleAccount(client, input.operating_company_id, "cash_clearing");
      });
      const created = await createJournalEntry(
        {
          operating_company_id: input.operating_company_id,
          entry_date: prepared.entryDate,
          memo: prepared.memo,
          source: "auto",
          postings: buildCashPartsPurchasePostings(
            prepared.expenseAccountId,
            cashAccountId,
            prepared.amountCents,
            prepared.memo
          ),
        },
        { userId: input.actor_user_id, role: "system" }
      );
      journalEntryId = created.id;
    }
  } catch (err) {
    if (err instanceof PostingEngineError) {
      return {
        posted: false,
        reason: "post_failed",
        bill_id: billId,
        code: err.code,
        message: err.message,
      };
    }
    throw err;
  }

  await withLuciaBypass(async (client: DbClient) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
      input.operating_company_id,
    ]);
    await client.query(
      `
        INSERT INTO accounting.parts_purchase_postings (
          operating_company_id, parts_inventory_id, bill_id, expense_je_id,
          amount_cents, entry_date, memo, status, created_by_user_id
        )
        VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6::date, $7, 'posted', $8::uuid)
        ON CONFLICT (operating_company_id, parts_inventory_id) WHERE is_active DO NOTHING
      `,
      [
        input.operating_company_id,
        input.parts_inventory_id,
        billId ?? null,
        journalEntryId,
        prepared.amountCents,
        prepared.entryDate,
        prepared.memo,
        input.actor_user_id,
      ]
    );
    await appendCrudAudit(
      client as Parameters<typeof appendCrudAudit>[0],
      input.actor_user_id,
      "accounting.parts_purchase.posted",
      {
        resource_type: "maintenance.parts_inventory",
        resource_id: input.parts_inventory_id,
        operatingCompanyId: input.operating_company_id,
        billId: billId ?? null,
        journalEntryId,
        amount_cents: prepared.amountCents,
        treatment: prepared.vendorId ? "ap_bill" : "cash",
      },
      "warning"
    );
  });

  return {
    posted: true,
    bill_id: billId,
    journal_entry_id: journalEntryId,
    memo: prepared.memo,
  };
}
