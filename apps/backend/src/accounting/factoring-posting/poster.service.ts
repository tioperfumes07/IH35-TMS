import { withLuciaBypass } from "../../auth/db.js";
import { resolveRoleAccount, resolveRoleAccountOptional } from "../coa-roles/resolver.service.js";
import { nextPaymentDisplayId } from "../display-id.js";
import { resolveAccountForCategory } from "../expense-category-map/resolver.service.js";
import { postSourceTransaction } from "../posting-engine.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type FactoringInvoiceRow = {
  invoice_id: string;
  customer_id: string;
  total_cents: number;
};

type CustomerAllocation = {
  customer_id: string;
  total_cents: number;
  by_invoice: Array<{ invoice_id: string; amount_cents: number }>;
};

function allocateByProportion(total: number, lines: Array<{ invoice_id: string; total_cents: number }>) {
  if (total <= 0 || lines.length === 0) return new Map<string, number>();
  const sumBase = lines.reduce((acc, row) => acc + row.total_cents, 0);
  if (sumBase <= 0) return new Map<string, number>();

  const provisional = lines.map((row) => {
    const raw = (row.total_cents / sumBase) * total;
    const floor = Math.floor(raw);
    return { invoice_id: row.invoice_id, floor, remainder: raw - floor };
  });

  let assigned = provisional.reduce((acc, row) => acc + row.floor, 0);
  let remaining = total - assigned;
  provisional.sort((a, b) => b.remainder - a.remainder);
  for (const row of provisional) {
    if (remaining <= 0) break;
    row.floor += 1;
    remaining -= 1;
  }

  const out = new Map<string, number>();
  for (const row of provisional) out.set(row.invoice_id, row.floor);
  return out;
}

function groupByCustomer(invoices: FactoringInvoiceRow[], invoiceAlloc: Map<string, number>): CustomerAllocation[] {
  const grouped = new Map<string, CustomerAllocation>();
  for (const row of invoices) {
    const amount = Number(invoiceAlloc.get(row.invoice_id) ?? 0);
    if (amount <= 0) continue;
    const current = grouped.get(row.customer_id) ?? {
      customer_id: row.customer_id,
      total_cents: 0,
      by_invoice: [],
    };
    current.total_cents += amount;
    current.by_invoice.push({ invoice_id: row.invoice_id, amount_cents: amount });
    grouped.set(row.customer_id, current);
  }
  return Array.from(grouped.values());
}

async function resolveFactoringPostingAccounts(client: DbClient, operatingCompanyId: string, factorFeeCents: number) {
  await resolveRoleAccount(client, operatingCompanyId, "ar_control");
  await resolveRoleAccount(client, operatingCompanyId, "factor_reserve_default");
  await resolveRoleAccountOptional(client, operatingCompanyId, "cash_clearing");
  if (factorFeeCents > 0) {
    try {
      await resolveAccountForCategory(operatingCompanyId, "factoring_fee", "default");
    } catch {
      // Fee posting lands in Block-25; keep this hook non-blocking for Block-24.
    }
  }
}

async function getOrCreatePayment(
  client: DbClient,
  input: {
    operating_company_id: string;
    customer_id: string;
    payment_method: "factoring_advance" | "factoring_reserve";
    payment_date: string;
    reference: string;
    amount_cents: number;
    notes: string;
    actor_user_id: string;
  }
) {
  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM accounting.payments
      WHERE operating_company_id = $1::uuid
        AND customer_id = $2::uuid
        AND payment_method = $3
        AND reference = $4
        AND amount_cents = $5
        AND voided_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [
      input.operating_company_id,
      input.customer_id,
      input.payment_method,
      input.reference,
      input.amount_cents,
    ]
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;

  const displayId = await nextPaymentDisplayId(client, input.operating_company_id, new Date(`${input.payment_date}T00:00:00.000Z`));
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.payments (
        operating_company_id,
        customer_id,
        display_id,
        payment_method,
        payment_date,
        reference,
        amount_cents,
        deposited_to_account_id,
        notes,
        created_by_user_id
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,'ops_checking',$8,$9)
      RETURNING id::text
    `,
    [
      input.operating_company_id,
      input.customer_id,
      displayId,
      input.payment_method,
      input.payment_date,
      input.reference,
      input.amount_cents,
      input.notes,
      input.actor_user_id,
    ]
  );
  const paymentId = inserted.rows[0]?.id;
  if (!paymentId) throw new Error("factoring_payment_create_failed");
  return paymentId;
}

async function applyPaymentToInvoices(
  client: DbClient,
  input: {
    operating_company_id: string;
    payment_id: string;
    actor_user_id: string;
    allocations: Array<{ invoice_id: string; amount_cents: number }>;
  }
) {
  for (const allocation of input.allocations) {
    if (allocation.amount_cents <= 0) continue;
    await client.query(
      `
        INSERT INTO accounting.payment_applications (
          operating_company_id,
          payment_id,
          invoice_id,
          target_kind,
          target_id,
          amount_cents,
          amount_applied,
          applied_by_user_id,
          applied_by_user_uuid
        )
        VALUES ($1,$2,$3,'invoice',$3,$4,$5,$6,$6)
        ON CONFLICT (payment_id, target_kind, target_id) DO NOTHING
      `,
      [
        input.operating_company_id,
        input.payment_id,
        allocation.invoice_id,
        allocation.amount_cents,
        allocation.amount_cents / 100,
        input.actor_user_id,
      ]
    );
  }
}

type PostFactoringAdvanceInput = {
  operating_company_id: string;
  factoring_advance_id: string;
  actor_user_id: string;
  advanced_at_iso?: string | null;
};

export async function postFactoringAdvanceEvent(input: PostFactoringAdvanceInput) {
  const paymentIds = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const advanceRes = await client.query<{
      id: string;
      display_id: string;
      advance_amount_cents: number;
      submitted_at: string;
      advanced_at: string | null;
    }>(
      `
        SELECT
          id::text,
          display_id,
          advance_amount_cents::int,
          submitted_at::text,
          advanced_at::text
        FROM accounting.factoring_advances
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [input.factoring_advance_id, input.operating_company_id]
    );
    const advance = advanceRes.rows[0];
    if (!advance) throw new Error("factoring_advance_not_found");
    if (Number(advance.advance_amount_cents ?? 0) <= 0) return [] as string[];

    await resolveFactoringPostingAccounts(client, input.operating_company_id, 0);

    const invoicesRes = await client.query<{
      invoice_id: string;
      customer_id: string;
      total_cents: number;
    }>(
      `
        SELECT
          i.id::text AS invoice_id,
          i.customer_id::text AS customer_id,
          i.total_cents::int AS total_cents
        FROM accounting.invoices i
        WHERE i.factoring_advance_id = $1::uuid
        ORDER BY i.issue_date ASC, i.created_at ASC
      `,
      [input.factoring_advance_id]
    );
    const invoices = invoicesRes.rows.map((row) => ({
      invoice_id: row.invoice_id,
      customer_id: row.customer_id,
      total_cents: Number(row.total_cents ?? 0),
    }));
    if (invoices.length === 0) return [] as string[];

    const invoiceAlloc = allocateByProportion(Number(advance.advance_amount_cents ?? 0), invoices);
    const byCustomer = groupByCustomer(invoices, invoiceAlloc);
    const paymentDate = (input.advanced_at_iso ?? advance.advanced_at ?? advance.submitted_at).slice(0, 10);
    const createdPaymentIds: string[] = [];

    for (const customer of byCustomer) {
      const paymentId = await getOrCreatePayment(client, {
        operating_company_id: input.operating_company_id,
        customer_id: customer.customer_id,
        payment_method: "factoring_advance",
        payment_date: paymentDate,
        reference: `FAC:${advance.display_id}:ADVANCE`,
        amount_cents: customer.total_cents,
        notes: `Auto-created from factoring advance ${advance.display_id}`,
        actor_user_id: input.actor_user_id,
      });
      await applyPaymentToInvoices(client, {
        operating_company_id: input.operating_company_id,
        payment_id: paymentId,
        actor_user_id: input.actor_user_id,
        allocations: customer.by_invoice,
      });
      createdPaymentIds.push(paymentId);
    }

    return createdPaymentIds;
  });

  for (const paymentId of paymentIds) {
    await postSourceTransaction(
      {
        operating_company_id: input.operating_company_id,
        source_transaction_type: "customer_payment",
        source_transaction_id: paymentId,
      },
      { userId: input.actor_user_id }
    );
  }
  return paymentIds;
}

type PostFactoringReleaseInput = {
  operating_company_id: string;
  factoring_advance_id: string;
  actor_user_id: string;
  released_at_iso?: string | null;
  release_amount_cents: number;
  factor_fee_cents: number;
};

export async function postFactoringReleaseEvent(input: PostFactoringReleaseInput) {
  if (input.release_amount_cents <= 0) return [] as string[];

  const paymentIds = await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);

    const advanceRes = await client.query<{
      id: string;
      display_id: string;
      released_at: string | null;
    }>(
      `
        SELECT id::text, display_id, released_at::text
        FROM accounting.factoring_advances
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
      `,
      [input.factoring_advance_id, input.operating_company_id]
    );
    const advance = advanceRes.rows[0];
    if (!advance) throw new Error("factoring_advance_not_found");

    await resolveFactoringPostingAccounts(client, input.operating_company_id, input.factor_fee_cents);

    const invoicesRes = await client.query<{
      invoice_id: string;
      customer_id: string;
      total_cents: number;
    }>(
      `
        SELECT
          i.id::text AS invoice_id,
          i.customer_id::text AS customer_id,
          i.total_cents::int AS total_cents
        FROM accounting.invoices i
        WHERE i.factoring_advance_id = $1::uuid
        ORDER BY i.issue_date ASC, i.created_at ASC
      `,
      [input.factoring_advance_id]
    );
    const invoices = invoicesRes.rows.map((row) => ({
      invoice_id: row.invoice_id,
      customer_id: row.customer_id,
      total_cents: Number(row.total_cents ?? 0),
    }));
    if (invoices.length === 0) return [] as string[];

    const invoiceAlloc = allocateByProportion(input.release_amount_cents, invoices);
    const byCustomer = groupByCustomer(invoices, invoiceAlloc);
    const paymentDate = (input.released_at_iso ?? advance.released_at ?? new Date().toISOString()).slice(0, 10);
    const createdPaymentIds: string[] = [];

    for (const customer of byCustomer) {
      const paymentId = await getOrCreatePayment(client, {
        operating_company_id: input.operating_company_id,
        customer_id: customer.customer_id,
        payment_method: "factoring_reserve",
        payment_date: paymentDate,
        reference: `FAC:${advance.display_id}:RELEASE`,
        amount_cents: customer.total_cents,
        notes: `Auto-created from factoring release ${advance.display_id} (release ${input.release_amount_cents}; fee ${input.factor_fee_cents})`,
        actor_user_id: input.actor_user_id,
      });
      await applyPaymentToInvoices(client, {
        operating_company_id: input.operating_company_id,
        payment_id: paymentId,
        actor_user_id: input.actor_user_id,
        allocations: customer.by_invoice,
      });
      createdPaymentIds.push(paymentId);
    }

    return createdPaymentIds;
  });

  for (const paymentId of paymentIds) {
    await postSourceTransaction(
      {
        operating_company_id: input.operating_company_id,
        source_transaction_type: "customer_payment",
        source_transaction_id: paymentId,
      },
      { userId: input.actor_user_id }
    );
  }
  return paymentIds;
}
