/**
 * ROUND 326 item 3 — LEGAL ECONOMIC WIRING.
 *
 * Matter / contract money posts ONLY through the existing bill (AP / expense) and invoice (AR)
 * engines — never handwritten journal lines, never a new GL math path.
 *
 * - Reserve increase / legal fee / retainer → accounting.createBill (+ legal_matter_id)
 * - Reserve release → accounting.voidBill (reversible)
 * - Insurance recovery / judgment / settlement-in → createExpandedInvoice (AR document)
 *
 * No Neon seed. No Chrome. Engines only.
 */
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { createBill, voidBill } from "../accounting/bills.service.js";
import { createExpandedInvoice } from "../accounting/invoices.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

const RESERVE_MEMO_MARK = "LEGAL-RESERVE:";

export const matterReserveSchema = z.object({
  /** Expense / legal-cost GL account the bill line posts to (createBill coaAccountId). */
  expense_account_id: z.string().uuid(),
  /**
   * ROUND 316 FE still sends liability_account_id. ROUND 326: AP is the bill engine's credit —
   * this field is accepted for back-compat and must differ from expense_account_id, but is NOT
   * used to hand-write a JE.
   */
  liability_account_id: z.string().uuid(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reserve_cents: z.number().int().nonnegative().optional(),
});

export const matterLegalFeeSchema = z.object({
  kind: z.enum(["legal_fee", "retainer"]),
  expense_account_id: z.string().uuid(),
  amount_cents: z.number().int().positive(),
  bill_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  vendor_id: z.string().uuid().optional(),
  memo: z.string().trim().max(500).optional(),
  bill_number: z.string().trim().max(80).optional(),
});

export const matterRecoverySchema = z.object({
  kind: z.enum(["insurance_recovery", "judgment", "settlement"]),
  amount_cents: z.number().int().positive(),
  issue_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  customer_id: z.string().uuid().optional(),
  notes: z.string().trim().max(2000).optional(),
});

/** Pure: the reserve change to post. */
export function reserveDelta(targetCents: number, postedCents: number | null): number {
  return targetCents - (postedCents ?? 0);
}

function reserveMemo(matterNumber: string, matterId: string): string {
  return `Legal reserve — matter ${matterNumber} · ${RESERVE_MEMO_MARK}${matterId}`;
}

async function appendMatterEvent(
  client: DbClient,
  args: {
    operatingCompanyId: string;
    matterId: string;
    eventType: string;
    eventBody: Record<string, unknown>;
    createdByUserId: string;
  }
) {
  await client.query(
    `INSERT INTO legal.matter_events (
       operating_company_id, matter_id, event_type, event_body, created_by_user_id
     ) VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5::uuid)`,
    [args.operatingCompanyId, args.matterId, args.eventType, JSON.stringify(args.eventBody), args.createdByUserId]
  );
}

async function loadMatterForMoney(
  client: DbClient,
  operatingCompanyId: string,
  matterId: string
): Promise<{
  id: string;
  matter_number: string;
  financial_reserve_cents: number | null;
  reserve_posted_cents: number | null;
  vendor_id: string | null;
  customer_id: string | null;
  unit_id: string | null;
  related_driver_id: string | null;
  load_id: string | null;
} | null> {
  const row = (
    await client.query<{
      id: string;
      matter_number: string;
      financial_reserve_cents: number | null;
      reserve_posted_cents: number | null;
      vendor_id: string | null;
      customer_id: string | null;
      unit_id: string | null;
      related_driver_id: string | null;
      load_id: string | null;
    }>(
      `SELECT id::text, matter_number, financial_reserve_cents, reserve_posted_cents,
              vendor_id::text, customer_id::text, unit_id::text, related_driver_id::text, load_id::text
         FROM legal.matters
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
        FOR UPDATE`,
      [matterId, operatingCompanyId]
    )
  ).rows[0];
  return row ?? null;
}

/** Live reserve bills for a matter (engine-posted, not handwritten). */
export async function listMatterReserveBills(
  client: DbClient,
  operatingCompanyId: string,
  matterId: string
): Promise<Array<{ id: string; amount_cents: number; created_at: string }>> {
  const hasCol = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema='accounting' AND table_name='bills' AND column_name='legal_matter_id' LIMIT 1`
  );
  if (!hasCol.rows.length) return [];
  const res = await client.query<{ id: string; amount_cents: string; created_at: string }>(
    `SELECT b.id::text,
            COALESCE(b.amount_cents, ROUND(COALESCE(b.total_amount, 0) * 100))::bigint::text AS amount_cents,
            b.created_at::text
       FROM accounting.bills b
      WHERE b.operating_company_id = $1::uuid
        AND b.legal_matter_id = $2::uuid
        AND b.voided_at IS NULL AND b.revoked_at IS NULL
        AND coalesce(b.memo, '') LIKE $3
      ORDER BY b.created_at DESC`,
    [operatingCompanyId, matterId, `%${RESERVE_MEMO_MARK}${matterId}%`]
  );
  return res.rows.map((r) => ({ id: r.id, amount_cents: Number(r.amount_cents), created_at: r.created_at }));
}

/**
 * Post or adjust the matter's financial reserve through createBill / voidBill.
 * Increase → unpaid vendor bill (Dr expense / Cr AP via bill GL poster).
 * Release → void prior reserve bills LIFO (reversible; void-not-delete on the bill register).
 */
export async function postMatterReserve(args: {
  operatingCompanyId: string;
  actor: { userId: string; role: string };
  matterId: string;
  body: z.infer<typeof matterReserveSchema>;
}) {
  const input = matterReserveSchema.parse(args.body);
  if (!["Owner", "Administrator", "Accountant"].includes(args.actor.role)) {
    throw new Error("legal_matter_reserve_forbidden");
  }
  if (input.expense_account_id === input.liability_account_id) {
    throw new Error("legal_matter_reserve_accounts_must_differ");
  }

  const planned = await withCurrentUser(args.actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [args.operatingCompanyId]);
    const m = await loadMatterForMoney(client as DbClient, args.operatingCompanyId, args.matterId);
    if (!m) throw new Error("legal_matter_not_found");
    if (!m.vendor_id) throw new Error("legal_matter_reserve_requires_vendor");

    for (const acct of [input.expense_account_id, input.liability_account_id]) {
      const ok = await client.query(
        `SELECT 1 FROM catalogs.accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [acct, args.operatingCompanyId]
      );
      if (!ok.rows.length) throw new Error("legal_matter_reserve_account_not_in_company");
    }

    const bills = await listMatterReserveBills(client as DbClient, args.operatingCompanyId, m.id);
    const postedFromBills = bills.reduce((s, b) => s + b.amount_cents, 0);
    const target = input.reserve_cents ?? Number(m.financial_reserve_cents ?? 0);
    const delta = reserveDelta(target, postedFromBills);
    return { m, bills, postedFromBills, target, delta };
  });

  if (planned.delta === 0) {
    return {
      posted: false,
      reason: "reserve already posted at this amount",
      reserve_cents: planned.target,
      engine: "bill" as const,
    };
  }

  const createdBillIds: string[] = [];
  const voidedBillIds: string[] = [];
  let lastJournalEntryId: string | null = null;

  if (planned.delta > 0) {
    const amount = planned.delta;
    const bill = await createBill(
      {
        operatingCompanyId: args.operatingCompanyId,
        vendorId: planned.m.vendor_id as string,
        billNumber: `LR-${planned.m.matter_number}-${Date.now().toString(36).slice(-6)}`,
        billDate: input.entry_date,
        amountCents: amount,
        memo: reserveMemo(planned.m.matter_number, planned.m.id),
        coaAccountId: input.expense_account_id,
        legalMatterId: planned.m.id,
        unitId: planned.m.unit_id,
        driverId: planned.m.related_driver_id,
        duplicateOverrideReason: "legal_matter_reserve_delta",
      },
      args.actor.userId
    );
    createdBillIds.push(String((bill as { id: string }).id));
    lastJournalEntryId = (bill as { journal_entry_id?: string | null }).journal_entry_id ?? null;
  } else {
    let remaining = Math.abs(planned.delta);
    for (const b of planned.bills) {
      if (remaining <= 0) break;
      if (b.amount_cents > remaining) {
        throw new Error(
          `legal_matter_reserve_release_partial_bill:${b.id}:${b.amount_cents}:${remaining}`
        );
      }
      await voidBill(args.operatingCompanyId, b.id, `Legal reserve release — matter ${planned.m.matter_number}`, args.actor.userId, {
        role: args.actor.role,
      });
      voidedBillIds.push(b.id);
      remaining -= b.amount_cents;
    }
    if (remaining > 0) throw new Error(`legal_matter_reserve_release_insufficient_bills:${remaining}`);
  }

  await withCurrentUser(args.actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [args.operatingCompanyId]);
    await client.query(
      `UPDATE legal.matters
          SET reserve_journal_entry_id = COALESCE($3::uuid, reserve_journal_entry_id),
              reserve_posted_cents = $4,
              reserve_posted_at = now(),
              financial_reserve_cents = COALESCE(financial_reserve_cents, $4),
              updated_by_user_id = $5::uuid,
              updated_at = now()
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [planned.m.id, args.operatingCompanyId, lastJournalEntryId, planned.target, args.actor.userId]
    );
    await appendMatterEvent(client as DbClient, {
      operatingCompanyId: args.operatingCompanyId,
      matterId: planned.m.id,
      eventType: "reserve_posted",
      eventBody: {
        engine: "bill",
        reserve_cents: planned.target,
        delta_cents: planned.delta,
        created_bill_ids: createdBillIds,
        voided_bill_ids: voidedBillIds,
        journal_entry_id: lastJournalEntryId,
      },
      createdByUserId: args.actor.userId,
    });
    await appendCrudAudit(
      client,
      args.actor.userId,
      "legal.matter.reserve_posted",
      {
        matter_id: planned.m.id,
        engine: "bill",
        reserve_cents: planned.target,
        delta_cents: planned.delta,
        created_bill_ids: createdBillIds,
        voided_bill_ids: voidedBillIds,
        journal_entry_id: lastJournalEntryId,
        operating_company_id: args.operatingCompanyId,
      },
      "info",
      "ROUND-326-LEGAL-ECONOMIC"
    );
  });

  return {
    posted: true,
    engine: "bill" as const,
    bill_id: createdBillIds[0] ?? voidedBillIds[0] ?? null,
    created_bill_ids: createdBillIds,
    voided_bill_ids: voidedBillIds,
    journal_entry_id: lastJournalEntryId,
    reserve_cents: planned.target,
    delta_cents: planned.delta,
  };
}

/** Legal fee or retainer — unpaid AP via createBill, stamped to the matter. */
export async function postMatterLegalFee(args: {
  operatingCompanyId: string;
  actor: { userId: string; role: string };
  matterId: string;
  body: z.infer<typeof matterLegalFeeSchema>;
}) {
  const input = matterLegalFeeSchema.parse(args.body);
  if (!["Owner", "Administrator", "Accountant"].includes(args.actor.role)) {
    throw new Error("legal_matter_fee_forbidden");
  }

  const m = await withCurrentUser(args.actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [args.operatingCompanyId]);
    const row = await loadMatterForMoney(client as DbClient, args.operatingCompanyId, args.matterId);
    if (!row) throw new Error("legal_matter_not_found");
    const vendorId = input.vendor_id ?? row.vendor_id;
    if (!vendorId) throw new Error("legal_matter_fee_requires_vendor");
    const ok = await client.query(
      `SELECT 1 FROM catalogs.accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [input.expense_account_id, args.operatingCompanyId]
    );
    if (!ok.rows.length) throw new Error("legal_matter_fee_account_not_in_company");
    return { ...row, vendor_id: vendorId };
  });

  const label = input.kind === "retainer" ? "Retainer" : "Legal fee";
  const bill = await createBill(
    {
      operatingCompanyId: args.operatingCompanyId,
      vendorId: m.vendor_id as string,
      billNumber: input.bill_number?.trim() || `LF-${m.matter_number}-${Date.now().toString(36).slice(-6)}`,
      billDate: input.bill_date,
      dueDate: input.due_date,
      amountCents: input.amount_cents,
      memo: input.memo?.trim() || `${label} — matter ${m.matter_number}`,
      coaAccountId: input.expense_account_id,
      legalMatterId: m.id,
      unitId: m.unit_id,
      driverId: m.related_driver_id,
      duplicateOverrideReason: `legal_matter_${input.kind}`,
    },
    args.actor.userId
  );

  await withCurrentUser(args.actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [args.operatingCompanyId]);
    await appendMatterEvent(client as DbClient, {
      operatingCompanyId: args.operatingCompanyId,
      matterId: m.id,
      eventType: input.kind === "retainer" ? "retainer_billed" : "legal_fee_billed",
      eventBody: {
        engine: "bill",
        bill_id: (bill as { id: string }).id,
        amount_cents: input.amount_cents,
        kind: input.kind,
      },
      createdByUserId: args.actor.userId,
    });
    await appendCrudAudit(
      client,
      args.actor.userId,
      "legal.matter.fee_posted",
      {
        matter_id: m.id,
        bill_id: (bill as { id: string }).id,
        kind: input.kind,
        amount_cents: input.amount_cents,
        operating_company_id: args.operatingCompanyId,
      },
      "info",
      "ROUND-326-LEGAL-ECONOMIC"
    );
  });

  return {
    posted: true,
    engine: "bill" as const,
    bill_id: (bill as { id: string }).id,
    journal_entry_id: (bill as { journal_entry_id?: string | null }).journal_entry_id ?? null,
    kind: input.kind,
    amount_cents: input.amount_cents,
  };
}

/**
 * Insurance recovery / judgment / settlement-in — AR via createExpandedInvoice.
 * accounting.invoices has no legal_matter_id column yet; linkage is matter_events + internal_notes
 * (CREATE-only migration for the FK is a later Cursor-window follow-up).
 */
export async function postMatterRecovery(args: {
  operatingCompanyId: string;
  actor: { userId: string; role: string };
  matterId: string;
  body: z.infer<typeof matterRecoverySchema>;
}) {
  const input = matterRecoverySchema.parse(args.body);
  if (!["Owner", "Administrator", "Accountant"].includes(args.actor.role)) {
    throw new Error("legal_matter_recovery_forbidden");
  }

  const result = await withCurrentUser(args.actor.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [args.operatingCompanyId]);
    const m = await loadMatterForMoney(client as DbClient, args.operatingCompanyId, args.matterId);
    if (!m) throw new Error("legal_matter_not_found");
    const customerId = input.customer_id ?? m.customer_id;
    if (!customerId) throw new Error("legal_matter_recovery_requires_customer");

    const label =
      input.kind === "judgment" ? "Judgment" : input.kind === "settlement" ? "Settlement" : "Insurance recovery";
    const notes = [
      `${label} — matter ${m.matter_number}`,
      `LEGAL-MATTER:${m.id}`,
      `AMOUNT_CENTS:${input.amount_cents}`,
      input.notes?.trim() || null,
    ]
      .filter(Boolean)
      .join(" · ");

    const inv = await createExpandedInvoice(client as DbClient, {
      operatingCompanyId: args.operatingCompanyId,
      userId: args.actor.userId,
      invoiceType: "customer_adjustment",
      customerId,
      billToEntityType: "customer",
      billToEntityId: customerId,
      issueDate: input.issue_date,
      dueDate: input.due_date,
      internalNotes: notes,
      customerNotes: `${label} linked to legal matter ${m.matter_number}`,
    });

    // Stamp expected amount on a draft line when invoice_lines exists — amount is carried in notes
    // until the operator completes the invoice on the AR surface (document engine owns lines).
    await appendMatterEvent(client as DbClient, {
      operatingCompanyId: args.operatingCompanyId,
      matterId: m.id,
      eventType: `${input.kind}_invoiced`,
      eventBody: {
        engine: "invoice",
        invoice_id: inv.id,
        display_id: inv.display_id,
        amount_cents: input.amount_cents,
        kind: input.kind,
      },
      createdByUserId: args.actor.userId,
    });
    await appendCrudAudit(
      client,
      args.actor.userId,
      "legal.matter.recovery_posted",
      {
        matter_id: m.id,
        invoice_id: inv.id,
        display_id: inv.display_id,
        kind: input.kind,
        amount_cents: input.amount_cents,
        operating_company_id: args.operatingCompanyId,
      },
      "info",
      "ROUND-326-LEGAL-ECONOMIC"
    );

    return {
      posted: true,
      engine: "invoice" as const,
      invoice_id: inv.id,
      display_id: inv.display_id,
      kind: input.kind,
      amount_cents: input.amount_cents,
    };
  });

  return result;
}
