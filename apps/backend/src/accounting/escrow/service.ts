import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { createJournalEntryOnClient } from "../journal-entries.service.js";
import { resolveRoleAccount } from "../coa-roles/resolver.service.js";
import { companyBusinessDate } from "../../lib/company-business-date.js";

type EscrowHolderType = "driver" | "vendor" | "factor" | "other";
type EscrowPurpose = "driver_bond" | "repair_reserve" | "factor_reserve" | "other";
type EscrowPostingType = "deposit" | "release" | "adjustment" | "forfeiture";
export type EscrowSourceType =
  | "driver_settlement"
  | "factoring_advance"
  | "vendor_bill"
  | "manual"
  | "reconciliation"
  | "forfeit";

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
  /** ACCT-F5068 — resolved holder display name (driver/vendor/factor). */
  holder_label?: string | null;
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
  journal_entry_date?: string | null;
  journal_entry_memo?: string | null;
  /** ACCT-F5068 — settlement/bill/advance display id for EntityLink. */
  source_label?: string | null;
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
          ea.id::text,
          ea.operating_company_id::text,
          ea.holder_id::text,
          ea.holder_type::text,
          ea.purpose::text,
          ea.coa_account_id::text,
          ea.balance_cents::bigint,
          ea.status::text,
          ea.created_at::text,
          ea.updated_at::text,
          CASE ea.holder_type
            WHEN 'driver' THEN NULLIF(TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, '')), '')
            WHEN 'vendor' THEN v.vendor_name
            WHEN 'factor' THEN v.vendor_name
            ELSE NULL
          END AS holder_label
        FROM accounting.escrow_accounts ea
        LEFT JOIN mdata.drivers d
          ON ea.holder_type = 'driver'
         AND d.id = ea.holder_id
         AND d.operating_company_id = ea.operating_company_id
        LEFT JOIN mdata.vendors v
          ON ea.holder_type IN ('vendor', 'factor')
         AND v.id = ea.holder_id
         AND v.operating_company_id = ea.operating_company_id
        WHERE ea.operating_company_id = $1::uuid
        ORDER BY ea.updated_at DESC, ea.created_at DESC
      `,
      [operatingCompanyId]
    );
    return res.rows.map((row) => ({ ...row, balance_cents: cents(row.balance_cents) }));
  });
}

/**
 * BLOCK-02 — per-holder escrow balance lookup (e.g. the driver's own escrow balance). Read-only;
 * reuses the same accounting.escrow_accounts row Block-23 already maintains
 * (UNIQUE (operating_company_id, holder_id, purpose) — one row per driver per purpose), so this is a
 * convenience filter, not a new balance source. Returns null when the holder has no escrow account yet
 * (e.g. never had a driver_bond deduction withheld).
 */
export async function getEscrowAccountForHolder(
  input: { operating_company_id: string; holder_id: string; holder_type: EscrowHolderType; purpose: EscrowPurpose },
  actorUserId: string
): Promise<EscrowAccount | null> {
  return withCurrentUser(actorUserId, async (client) => {
    await setCompanyScope(client, input.operating_company_id);
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
          AND holder_id = $2::uuid
          AND holder_type = $3
          AND purpose = $4
        LIMIT 1
      `,
      [input.operating_company_id, input.holder_id, input.holder_type, input.purpose]
    );
    const row = res.rows[0];
    return row ? { ...row, balance_cents: cents(row.balance_cents) } : null;
  });
}

export async function listEscrowPostings(input: { operating_company_id: string; escrow_account_id: string; limit: number }, actorUserId: string) {
  return withCurrentUser(actorUserId, async (client) => {
    await setCompanyScope(client, input.operating_company_id);
    const res = await client.query<EscrowPosting>(
      `
        SELECT
          ep.id::text,
          ep.operating_company_id::text,
          ep.escrow_account_id::text,
          ep.posting_type::text,
          ep.amount_cents::bigint,
          ep.source_type::text,
          ep.source_id::text,
          ep.note,
          ep.posted_at::text,
          ep.posted_by_user_id::text,
          ep.linked_journal_entry_id::text,
          je.entry_date::text AS journal_entry_date,
          je.memo AS journal_entry_memo,
          CASE ep.source_type
            WHEN 'driver_settlement' THEN ds.display_id
            WHEN 'vendor_bill' THEN b.bill_number
            WHEN 'factoring_advance' THEN fa.display_id
            ELSE NULL
          END AS source_label,
          ep.created_at::text
        FROM accounting.escrow_postings ep
        LEFT JOIN accounting.journal_entries je
          ON je.id = ep.linked_journal_entry_id
         AND je.operating_company_id = ep.operating_company_id
        LEFT JOIN driver_finance.driver_settlements ds
          ON ep.source_type = 'driver_settlement'
         AND ds.id = ep.source_id
         AND ds.operating_company_id = ep.operating_company_id
        LEFT JOIN accounting.bills b
          ON ep.source_type = 'vendor_bill'
         AND b.id = ep.source_id
         AND b.operating_company_id = ep.operating_company_id
        LEFT JOIN accounting.factoring_advances fa
          ON ep.source_type = 'factoring_advance'
         AND fa.id = ep.source_id
         AND fa.operating_company_id = ep.operating_company_id
        WHERE ep.operating_company_id = $1::uuid
          AND ep.escrow_account_id = $2::uuid
        ORDER BY ep.posted_at DESC, ep.created_at DESC
        LIMIT $3::int
      `,
      [input.operating_company_id, input.escrow_account_id, input.limit]
    );
    return res.rows.map((row) => ({ ...row, amount_cents: cents(row.amount_cents) }));
  });
}

/**
 * ACCT-F5644 — the caller's own client, atomic with any outer transaction/row-lock the caller already
 * holds. `postEscrowTransaction` below used to run this ENTIRE body inside its own `withCurrentUser`
 * connection (call it connection A) and then post the journal entry via `createJournalEntry` — a
 * DIFFERENT, connection-opening function that opens its OWN, SECOND connection (connection B)
 * internally and commits independently. Even a standalone call had two connections mid-flight
 * simultaneously: the JE could commit on connection B while a later failure on connection A (the
 * escrow_postings INSERT, the audit write, the balance re-read) rolled connection A back — leaving an
 * orphan, committed journal entry with NO escrow_postings row ever backing it, permanently
 * un-reconcilable against the escrow subledger. On top of that, any caller that already held its own
 * open transaction (escrow-separation.service.ts's releaseDriverEscrowSeparation, ACCT-F5643's own
 * REMAINING note) could never post atomically with this function at all, since it always opened yet
 * another independent connection regardless of caller context.
 *
 * Exported so a caller with its own already-open, row-locked client (mirroring
 * createJournalEntryOnClient's own client-taking convention, and this file's own pre-existing
 * recordEscrowPostingOnly(client, ...) primitive) can post atomically with its own transaction — no
 * new GL math, same postings this function has always computed.
 */
export async function postEscrowTransactionOnClient(
  client: Parameters<typeof createJournalEntryOnClient>[0],
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
  {
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
    const postingDate = companyBusinessDate();
    const journalEntry = await createJournalEntryOnClient(
      client,
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
  }
}

/** Thin wrapper preserving the exact pre-existing external behavior for callers with no open transaction of their own. */
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
  return withCurrentUser(actor.userId, (client) => postEscrowTransactionOnClient(client, input, actor));
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

/**
 * ACCT-R-01 (0007-pattern-5 escrow split-brain finding) — record a GL-linked escrow posting WITHOUT
 * creating a second journal entry. Use this when the JE already exists (e.g. the settlement pay-run's
 * OWN composite JE already carries the escrow-liability credit leg via
 * driver-finance/escrow-resolver.service.ts's resolveDriverEscrowLiabilityAccount) or when the caller
 * intentionally posts no JE (e.g. the D1 per-line approval flow's escrow_for_claims hold).
 *
 * ROOT CAUSE this closes: driver_finance.escrow_balances / escrow_ledger (the operational per-driver
 * running-balance store settlement-payrun-close.service.ts and settlements/approval.service.ts write on
 * every contribution/hold) and accounting.escrow_accounts.balance_cents (the GL-linked liability balance
 * driver-finance/escrow-separation.service.ts's releaseDriverEscrowSeparation() reads as authoritative
 * before calling releaseEscrow()) were NEVER kept in sync — every contribution landed only in
 * driver_finance.*, so accounting.escrow_accounts.balance_cents stayed at 0 and a real driver's escrow
 * would release as $0 (or throw escrow_release_exceeds_balance) on separation, despite the JE having
 * correctly credited the liability account all along. This does NOT redirect or stop the
 * driver_finance.* writes (Rule 07 — they remain the live operational ledger multiple UI surfaces read:
 * banking escrow visualizer, driver escrow history tab, pre-settlements deductions queue, the $2,000-cap
 * check). It ONLY keeps accounting.escrow_accounts.balance_cents in sync by inserting the append-only
 * accounting.escrow_postings row — the AFTER INSERT trigger accounting.apply_escrow_posting_delta()
 * (migration 0234; sign-fixed by 202608070000) atomically applies the balance delta:
 * deposit +, release −, forfeiture −; unknown posting_type RAISE. NO new GL math.
 *
 * Fails loud if the driver has no provisioned accounting.escrow_accounts bridge (should never happen on
 * the settlement pay-run path — resolveDriverEscrowLiabilityAccount already asserts it upstream) UNLESS
 * opts.failSoft=true (used by the legacy D1 per-line approval path, which can run before a driver's
 * bridge is provisioned).
 */
export async function recordEscrowPostingOnly(
  client: { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> },
  input: {
    operating_company_id: string;
    driver_id: string;
    posting_type: "deposit" | "release" | "forfeiture";
    amount_cents: number;
    source_type: EscrowSourceType;
    source_id?: string | null;
    note?: string | null;
    posted_by_user_id: string;
    linked_journal_entry_id?: string | null;
  },
  opts?: { failSoft?: boolean }
): Promise<{ posted: boolean; escrow_account_id: string | null; posting_id: string | null }> {
  const amount = cents(input.amount_cents);
  if (amount <= 0) return { posted: false, escrow_account_id: null, posting_id: null };

  const bridge = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM accounting.escrow_accounts
      WHERE operating_company_id = $1::uuid
        AND holder_id = $2::uuid
        AND holder_type = 'driver'
      LIMIT 1
    `,
    [input.operating_company_id, input.driver_id]
  );
  const escrowAccountId = bridge.rows[0]?.id ?? null;
  if (!escrowAccountId) {
    if (opts?.failSoft) return { posted: false, escrow_account_id: null, posting_id: null };
    throw new Error(
      `escrow_account_bridge_missing: driver ${input.driver_id} has no accounting.escrow_accounts bridge (holder_type='driver') — ` +
        `cannot sync the canonical GL liability balance (ACCT-R-01)`
    );
  }

  const posting = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.escrow_postings (
        operating_company_id, escrow_account_id, posting_type, amount_cents,
        source_type, source_id, note, posted_at, posted_by_user_id, linked_journal_entry_id
      )
      VALUES ($1::uuid, $2::uuid, $3, $4::bigint, $5, $6::uuid, $7, now(), $8::uuid, $9::uuid)
      RETURNING id::text
    `,
    [
      input.operating_company_id,
      escrowAccountId,
      input.posting_type,
      amount,
      input.source_type,
      input.source_id ?? null,
      input.note ?? null,
      input.posted_by_user_id,
      input.linked_journal_entry_id ?? null,
    ]
  );
  return { posted: true, escrow_account_id: escrowAccountId, posting_id: posting.rows[0]?.id ?? null };
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

/**
 * ACCT-F5644 — client-taking sibling of releaseEscrow, for a caller that already holds its own open,
 * row-locked transaction (e.g. escrow-separation.service.ts's releaseDriverEscrowSeparation) and needs
 * the release atomic with its own status flip/balance stamp, not committed on a second connection.
 */
export async function releaseEscrowOnClient(
  client: Parameters<typeof createJournalEntryOnClient>[0],
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
  return postEscrowTransactionOnClient(client, { ...input, posting_type: "release" }, actor);
}
