import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { createJournalEntry } from "../journal-entries.service.js";
import { resolveRoleAccount } from "../coa-roles/resolver.service.js";

type EscrowHolderType = "driver" | "vendor" | "factor" | "other";
type EscrowPurpose = "driver_bond" | "repair_reserve" | "factor_reserve" | "other";
type EscrowPostingType = "deposit" | "release" | "adjustment";
type EscrowSourceType = "driver_settlement" | "factoring_advance" | "vendor_bill" | "manual" | "reconciliation";

type EscrowAccount = {
  id: string;
  operating_company_id: string;
  holder_id: string;
  holder_type: EscrowHolderType;
  purpose: EscrowPurpose;
  coa_account_id: string;
  balance_cents: number;
  status: "active" | "closed";
  created_at: string;
  updated_at: string;
};

type EscrowPosting = {
  id: string;
  operating_company_id: string;
  escrow_account_id: string;
  posting_type: EscrowPostingType;
  amount_cents: number;
  source_type: EscrowSourceType;
  source_id: string | null;
  note: string | null;
  posted_at: string;
  posted_by_user_id: string;
  linked_journal_entry_id: string | null;
  created_at: string;
};

function cents(value: unknown) {
  return Math.round(Number(value ?? 0));
}

async function setCompanyScope(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, operatingCompanyId: string) {
  await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
}

export async function openEscrow(
  input: {
    operating_company_id: string;
    holder_id: string;
    holder_type: EscrowHolderType;
    purpose: EscrowPurpose;
  },
  actor: { userId: string; role: string }
) {
  return withCurrentUser(actor.userId, async (client) => {
    await setCompanyScope(client, input.operating_company_id);
    const escrowLiabilityAccountId = await resolveRoleAccount(client, input.operating_company_id, "escrow_liability_default");
    const existing = await client.query<EscrowAccount>(
      `
        SELECT
          id::text,
          operating_company_id::text,
          holder_id::text,
          holder_type::text,
          purpose::text,
          coa_account_id::text,
          balance_cents::bigint,
          status::text,
          created_at::text,
          updated_at::text
        FROM accounting.escrow_accounts
        WHERE operating_company_id = $1::uuid
          AND holder_id = $2::uuid
          AND purpose = $3
        LIMIT 1
      `,
      [input.operating_company_id, input.holder_id, input.purpose]
    );
    const row = existing.rows[0];
    if (row) return { escrow_account: { ...row, balance_cents: cents(row.balance_cents) }, created: false as const };

    const inserted = await client.query<EscrowAccount>(
      `
        INSERT INTO accounting.escrow_accounts (
          operating_company_id,
          holder_id,
          holder_type,
          purpose,
          coa_account_id,
          balance_cents,
          status
        )
        VALUES ($1::uuid,$2::uuid,$3,$4,$5::uuid,0,'active')
        RETURNING
          id::text,
          operating_company_id::text,
          holder_id::text,
          holder_type::text,
          purpose::text,
          coa_account_id::text,
          balance_cents::bigint,
          status::text,
          created_at::text,
          updated_at::text
      `,
      [input.operating_company_id, input.holder_id, input.holder_type, input.purpose, escrowLiabilityAccountId]
    );
    const escrowAccount = inserted.rows[0];
    if (!escrowAccount) throw new Error("escrow_account_insert_failed");

    await appendCrudAudit(
      client,
      actor.userId,
      "accounting.escrow_account.opened",
      {
        resource_type: "accounting.escrow_accounts",
        resource_id: escrowAccount.id,
        operating_company_id: input.operating_company_id,
        holder_id: input.holder_id,
        purpose: input.purpose,
      },
      "info",
      "Block-23"
    );
    return { escrow_account: { ...escrowAccount, balance_cents: cents(escrowAccount.balance_cents) }, created: true as const };
  });
}

export async function listEscrowAccounts(operatingCompanyId: string, actorUserId: string) {
  return withCurrentUser(actorUserId, async (client) => {
    await setCompanyScope(client, operatingCompanyId);
    const res = await client.query<EscrowAccount>(
      `
        SELECT
          id::text,
          operating_company_id::text,
          holder_id::text,
          holder_type::text,
          purpose::text,
          coa_account_id::text,
          balance_cents::bigint,
          status::text,
          created_at::text,
          updated_at::text
        FROM accounting.escrow_accounts
        WHERE operating_company_id = $1::uuid
        ORDER BY updated_at DESC, created_at DESC
      `,
      [operatingCompanyId]
    );
    return res.rows.map((row) => ({ ...row, balance_cents: cents(row.balance_cents) }));
  });
}

export async function listEscrowPostings(input: { operating_company_id: string; escrow_account_id: string; limit: number }, actorUserId: string) {
  return withCurrentUser(actorUserId, async (client) => {
    await setCompanyScope(client, input.operating_company_id);
    const res = await client.query<EscrowPosting>(
      `
        SELECT
          id::text,
          operating_company_id::text,
          escrow_account_id::text,
          posting_type::text,
          amount_cents::bigint,
          source_type::text,
          source_id::text,
          note,
          posted_at::text,
          posted_by_user_id::text,
          linked_journal_entry_id::text,
          created_at::text
        FROM accounting.escrow_postings
        WHERE operating_company_id = $1::uuid
          AND escrow_account_id = $2::uuid
        ORDER BY posted_at DESC, created_at DESC
        LIMIT $3::int
      `,
      [input.operating_company_id, input.escrow_account_id, input.limit]
    );
    return res.rows.map((row) => ({ ...row, amount_cents: cents(row.amount_cents) }));
  });
}

async function postEscrowTransaction(
  input: {
    operating_company_id: string;
    escrow_account_id: string;
    posting_type: EscrowPostingType;
    amount_cents: number;
    source_type: EscrowSourceType;
    source_id?: string | null;
    note?: string | null;
  },
  actor: { userId: string; role: string }
) {
  if (input.amount_cents <= 0) throw new Error("escrow_amount_must_be_positive");
  return withCurrentUser(actor.userId, async (client) => {
    await setCompanyScope(client, input.operating_company_id);
    const accountRes = await client.query<EscrowAccount>(
      `
        SELECT
          id::text,
          operating_company_id::text,
          holder_id::text,
          holder_type::text,
          purpose::text,
          coa_account_id::text,
          balance_cents::bigint,
          status::text,
          created_at::text,
          updated_at::text
        FROM accounting.escrow_accounts
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
        LIMIT 1
        FOR UPDATE
      `,
      [input.escrow_account_id, input.operating_company_id]
    );
    const escrowAccount = accountRes.rows[0];
    if (!escrowAccount) throw new Error("escrow_account_not_found");
    if (escrowAccount.status !== "active") throw new Error("escrow_account_not_active");
    if (input.posting_type === "release" && cents(escrowAccount.balance_cents) < input.amount_cents) {
      throw new Error("escrow_release_exceeds_balance");
    }

    const cashAccountId = await resolveRoleAccount(client, input.operating_company_id, "cash_clearing");
    const memoPrefix = input.posting_type === "deposit" ? "Escrow deposit" : input.posting_type === "release" ? "Escrow release" : "Escrow adjustment";
    const postingDate = new Date().toISOString().slice(0, 10);
    const journalEntry = await createJournalEntry(
      {
        operating_company_id: input.operating_company_id,
        entry_date: postingDate,
        memo: `${memoPrefix} ${input.escrow_account_id}`,
        source: "auto",
        postings:
          input.posting_type === "release"
            ? [
                {
                  account_id: escrowAccount.coa_account_id,
                  debit_or_credit: "debit",
                  amount_cents: input.amount_cents,
                  description: "Escrow liability release",
                },
                {
                  account_id: cashAccountId,
                  debit_or_credit: "credit",
                  amount_cents: input.amount_cents,
                  description: "Escrow cash release",
                },
              ]
            : [
                {
                  account_id: cashAccountId,
                  debit_or_credit: "debit",
                  amount_cents: input.amount_cents,
                  description: "Escrow cash deposit",
                },
                {
                  account_id: escrowAccount.coa_account_id,
                  debit_or_credit: "credit",
                  amount_cents: input.amount_cents,
                  description: "Escrow liability deposit",
                },
              ],
      },
      actor
    );

    const postingRes = await client.query<EscrowPosting>(
      `
        INSERT INTO accounting.escrow_postings (
          operating_company_id,
          escrow_account_id,
          posting_type,
          amount_cents,
          source_type,
          source_id,
          note,
          posted_at,
          posted_by_user_id,
          linked_journal_entry_id
        )
        VALUES ($1::uuid,$2::uuid,$3,$4::bigint,$5,$6::uuid,$7,now(),$8::uuid,$9::uuid)
        RETURNING
          id::text,
          operating_company_id::text,
          escrow_account_id::text,
          posting_type::text,
          amount_cents::bigint,
          source_type::text,
          source_id::text,
          note,
          posted_at::text,
          posted_by_user_id::text,
          linked_journal_entry_id::text,
          created_at::text
      `,
      [
        input.operating_company_id,
        input.escrow_account_id,
        input.posting_type,
        input.amount_cents,
        input.source_type,
        input.source_id ?? null,
        input.note ?? null,
        actor.userId,
        journalEntry.id,
      ]
    );
    const posting = postingRes.rows[0];
    if (!posting) throw new Error("escrow_posting_insert_failed");

    await appendCrudAudit(
      client,
      actor.userId,
      `accounting.escrow_posting.${input.posting_type}`,
      {
        resource_type: "accounting.escrow_postings",
        resource_id: posting.id,
        operating_company_id: input.operating_company_id,
        escrow_account_id: input.escrow_account_id,
        amount_cents: input.amount_cents,
        source_type: input.source_type,
        source_id: input.source_id ?? null,
        linked_journal_entry_id: journalEntry.id,
      },
      "info",
      "Block-23"
    );

    const refreshed = await client.query<{ balance_cents: number }>(
      `
        SELECT balance_cents::bigint
        FROM accounting.escrow_accounts
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
      `,
      [input.escrow_account_id, input.operating_company_id]
    );
    return {
      posting: { ...posting, amount_cents: cents(posting.amount_cents) },
      balance_cents: cents(refreshed.rows[0]?.balance_cents),
      linked_journal_entry_id: journalEntry.id,
    };
  });
}

export async function depositEscrow(
  input: {
    operating_company_id: string;
    escrow_account_id: string;
    amount_cents: number;
    source_type: EscrowSourceType;
    source_id?: string | null;
    note?: string | null;
  },
  actor: { userId: string; role: string }
) {
  return postEscrowTransaction({ ...input, posting_type: "deposit" }, actor);
}

export async function releaseEscrow(
  input: {
    operating_company_id: string;
    escrow_account_id: string;
    amount_cents: number;
    source_type: EscrowSourceType;
    source_id?: string | null;
    note?: string | null;
  },
  actor: { userId: string; role: string }
) {
  return postEscrowTransaction({ ...input, posting_type: "release" }, actor);
}
