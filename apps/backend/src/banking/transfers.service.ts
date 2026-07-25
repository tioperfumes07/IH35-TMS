import crypto from "node:crypto";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { enqueueSyncJob } from "../integrations/qbo/qbo-sync.service.js";
import { bankAccountHiddenFilterSql, isBankAccountHideEnabled } from "./bank-account-visibility.js";
import { isEnabled } from "../lib/feature-flags/service.js";
import { postSourceTransaction, reversePostedSourceTransaction, PostingEngineError } from "../accounting/posting-engine.service.js";

// BANKING-GL-COMPLETION — per-entity kill switch (default OFF; migration 202607150000). Resolved
// PER-ENTITY via isEnabled inside the request flow — never a global process.env read — so flipping it
// for one entity can never post transfers for every entity (constitution §1.4 money-posting discipline).
const TRANSFER_GL_POSTING_FLAG_KEY = "TRANSFER_GL_POSTING_ENABLED";

/**
 * Best-effort GL post for a just-committed transfer row. The transfer + cached-balance bump are ALREADY
 * committed by the caller (its own withCurrentUser transaction) before this runs, so a posting failure
 * here NEVER rolls back the transfer — it is logged and surfaced via the return value; the posting-engine
 * backfill (or a retry once the flag flips) can pick it up later. Reuses the shared posting engine
 * end-to-end (idempotency key + transaction_source_links spine) — no new GL math.
 */
async function maybePostTransferGl(
  operatingCompanyId: string,
  transferId: string,
  userId: string,
  purpose: "initial_post" | "reversal"
): Promise<void> {
  try {
    const postingEnabled = await withCurrentUser(userId, async (client) => {
      // RLS on lib.feature_flag_overrides requires app.operating_company_id to match the row's
      // operating_company_id. withCurrentUser alone does not set it — set it explicitly so that
      // company-level flag overrides are visible on this connection.
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
      return isEnabled(client, TRANSFER_GL_POSTING_FLAG_KEY, { operating_company_id: operatingCompanyId, user_uuid: userId });
    });
    if (!postingEnabled) return;

    if (purpose === "initial_post") {
      await postSourceTransaction(
        { operating_company_id: operatingCompanyId, source_transaction_type: "transfer", source_transaction_id: transferId },
        { userId }
      );
    } else {
      await reversePostedSourceTransaction(
        { operating_company_id: operatingCompanyId, source_transaction_type: "transfer", source_transaction_id: transferId },
        { userId }
      );
    }
  } catch (err) {
    if (err instanceof PostingEngineError && err.code === "SOURCE_NOT_FOUND" && purpose === "reversal") {
      // Nothing was ever posted for this transfer (flag was off when it was created) — nothing to reverse.
      return;
    }
    console.error(
      `[transfers] TRANSFER_GL_POSTING ${purpose} failed for transfer ${transferId} (row already committed)`,
      err
    );
  }
}

type AccountKind = "bank" | "cc" | "coa";
type TransferType = "bank_to_bank" | "cc_payment" | "cash_deposit" | "owner_contribution" | "owner_distribution";

type TransferInput = {
  operatingCompanyId: string;
  transferType: TransferType;
  fromAccountId: string;
  fromAccountKind: AccountKind;
  toAccountId: string;
  toAccountKind: AccountKind;
  amountCents: number;
  transferDate: string;
  memo?: string;
  referenceNumber?: string;
};

type TransferRow = {
  id: string;
  operating_company_id: string;
  from_account_id: string;
  from_account_kind: AccountKind;
  to_account_id: string;
  to_account_kind: AccountKind;
  amount_cents: number;
  revoked_at: string | null;
};

function payloadHash(input: Record<string, unknown>) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function validateAccountOwnership(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  operatingCompanyId: string,
  accountId: string,
  accountKind: AccountKind
) {
  if (accountKind === "bank") {
    // BANK-ACCOUNT-HIDE: an account hidden for THIS entity can never be chosen as a NEW transfer
    // leg (flag OFF by default — see docs/accounting/BANK-ACCOUNT-ENTITY-HIDE-DESIGN.md).
    const hideOn = await isBankAccountHideEnabled(client, operatingCompanyId);
    const res = await client.query<{ id: string }>(
      `
        SELECT id
        FROM banking.bank_accounts
        WHERE id = $1
          AND operating_company_id = $2
          AND is_active = true
          ${bankAccountHiddenFilterSql(hideOn, "banking.bank_accounts")}
        LIMIT 1
      `,
      [accountId, operatingCompanyId]
    );
    return Boolean(res.rows[0]?.id);
  }
  const res = await client.query<{ id: string }>(
    `
      SELECT id
      FROM catalogs.accounts
      WHERE id = $1
        AND deactivated_at IS NULL
      LIMIT 1
    `,
    [accountId]
  );
  return Boolean(res.rows[0]?.id);
}

async function updateBankBalance(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  accountId: string,
  operatingCompanyId: string,
  deltaCents: number
) {
  await client.query(
    `
      UPDATE banking.bank_accounts
      SET current_balance_cents = current_balance_cents + $3,
          updated_at = now()
      WHERE id = $1
        AND operating_company_id = $2
    `,
    [accountId, operatingCompanyId, deltaCents]
  );
}

export async function createTransfer(input: TransferInput, userId: string) {
  if (input.amountCents <= 0) throw new Error("transfer_amount_must_be_positive");
  if (input.fromAccountId === input.toAccountId && input.fromAccountKind === input.toAccountKind) {
    throw new Error("self_transfer_not_allowed");
  }

  const transfer = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
    const fromOwned = await validateAccountOwnership(client, input.operatingCompanyId, input.fromAccountId, input.fromAccountKind);
    const toOwned = await validateAccountOwnership(client, input.operatingCompanyId, input.toAccountId, input.toAccountKind);
    if (!fromOwned || !toOwned) throw new Error("transfer_account_not_accessible");

    const insertRes = await client.query<TransferRow>(
      `
        INSERT INTO banking.transfers (
          operating_company_id,
          transfer_type,
          from_account_id,
          from_account_kind,
          to_account_id,
          to_account_kind,
          amount_cents,
          transfer_date,
          memo,
          reference_number,
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now())
        RETURNING id, operating_company_id, from_account_id, from_account_kind, to_account_id, to_account_kind, amount_cents, revoked_at
      `,
      [
        input.operatingCompanyId,
        input.transferType,
        input.fromAccountId,
        input.fromAccountKind,
        input.toAccountId,
        input.toAccountKind,
        input.amountCents,
        input.transferDate,
        input.memo ?? null,
        input.referenceNumber ?? null,
        userId,
      ]
    );
    if ((insertRes.rowCount ?? 0) === 0 || !insertRes.rows[0]) {
      throw new Error("transfer_insert_failed");
    }
    const created = insertRes.rows[0];

    if (input.fromAccountKind === "bank") {
      await updateBankBalance(client, input.fromAccountId, input.operatingCompanyId, -Math.abs(input.amountCents));
    }
    if (input.toAccountKind === "bank") {
      await updateBankBalance(client, input.toAccountId, input.operatingCompanyId, Math.abs(input.amountCents));
    }

    await appendCrudAudit(
      client,
      userId,
      "banking.transfer.created",
      {
        resource_type: "banking.transfers",
        resource_id: created.id,
        operating_company_id: input.operatingCompanyId,
        transfer_type: input.transferType,
        from_account_id: input.fromAccountId,
        to_account_id: input.toAccountId,
        amount_cents: input.amountCents,
      },
      "info",
      "P5-D1-TRANSFER"
    );
    return created;
  });

  // BANKING-GL-COMPLETION — post the balanced JE (Dr destination / Cr source) AFTER the transfer row is
  // committed above (postSourceTransaction opens its OWN transaction on its own connection; calling it
  // from inside the still-open insert transaction would self-deadlock on the row's own lock). No-ops when
  // TRANSFER_GL_POSTING_ENABLED resolves false for this entity (the default).
  await maybePostTransferGl(transfer.operating_company_id, transfer.id, userId, "initial_post");

  await enqueueSyncJob(
    transfer.operating_company_id,
    "transfer",
    transfer.id,
    payloadHash({
      transfer_id: transfer.id,
      transfer_type: input.transferType,
      amount_cents: input.amountCents,
      transfer_date: input.transferDate,
    }),
    userId
  );

  return transfer;
}

type MarkBankFeedTransferInput = {
  operatingCompanyId: string;
  bankTransactionId: string;
  destinationBankAccountId: string;
  transferKind: "in" | "out";
  pairedTransactionId?: string | null;
  /** When the caller (RecordTransferModal/TransferModal) already minted the transfer via createTransfer,
   *  pass its id here so this call ONLY stamps the linkage — it must never mint a SECOND banking.transfers
   *  row for the same cash movement (that would double the balance bump + double-count the GL). */
  existingTransferId?: string | null;
  userId: string;
};

type BankFeedTransactionRow = {
  id: string;
  operating_company_id: string;
  bank_account_id: string | null;
  amount_cents: string | number | null;
  transaction_date: string;
  categorization_memo: string | null;
  description: string | null;
  matched_transfer_id: string | null;
};

async function loadBankTransactionForTransfer(
  client: { query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }> },
  bankTransactionId: string,
  operatingCompanyId: string
) {
  const res = await client.query<BankFeedTransactionRow>(
    `
      SELECT id, operating_company_id, bank_account_id, amount_cents, transaction_date::text AS transaction_date,
             categorization_memo, description, matched_transfer_id::text AS matched_transfer_id
      FROM banking.bank_transactions
      WHERE id = $1
        AND operating_company_id = $2
      LIMIT 1
    `,
    [bankTransactionId, operatingCompanyId]
  );
  return res.rows[0] ?? null;
}

async function stampBankTransactionTransferLink(
  client: { query: (sql: string, values?: unknown[]) => Promise<unknown> },
  input: {
    bankTransactionId: string;
    operatingCompanyId: string;
    transferId: string;
    destinationBankAccountId: string;
    transferKind: "in" | "out";
    pairedTransactionId: string | null;
  }
) {
  await client.query(
    `
      UPDATE banking.bank_transactions
      SET
        status = 'transfer',
        category = 'transfer',
        category_kind = 'transfer',
        destination_bank_account_id = $2,
        transfer_kind = $3,
        paired_transaction_id = COALESCE($4, paired_transaction_id),
        matched_transfer_id = $5,
        skip_reason = NULL,
        investigate_note = NULL,
        categorized_at = now(),
        updated_at = now()
      WHERE id = $1
        AND operating_company_id = $6
    `,
    [
      input.bankTransactionId,
      input.destinationBankAccountId,
      input.transferKind,
      input.pairedTransactionId,
      input.transferId,
      input.operatingCompanyId,
    ]
  );
}

/**
 * BANK-ECON-03 / BANK-SURF-03 root-cause fix (0285-banking-transfer-gl-gap Option 1, owner-approved
 * #3134) — ROOT CAUSE: the bank-feed "mark as transfer" action tagged banking.bank_transactions with
 * transfer_kind/destination_bank_account_id but never minted a banking.transfers row, so the movement
 * never had a paired ledger entry and TRANSFER_GL_POSTING_ENABLED had nothing to post against. This
 * pairs the feed line to the destination account and mints the transfer via the EXISTING, already-proven
 * createTransfer() poster (Surface A) — NO new GL math, single dedupe key (matched_transfer_id) shared
 * with bank-feed-gl-posting.service.ts's "is_transfer" interlock and bank-recon's match.service.ts.
 *
 * Idempotent + double-mint safe:
 *   - existingTransferId (RecordTransferModal/TransferModal already called createTransfer directly) →
 *     link-only, mints nothing.
 *   - bank txn already carries matched_transfer_id (retry / already marked) → link-only, mints nothing.
 *   - pairedTransactionId already carries a matched_transfer_id (the OTHER leg was marked first) → reuse
 *     that transfer id, mints nothing — both legs end up pointing at the SAME banking.transfers row.
 *   - otherwise → mints exactly ONE new banking.transfers row via createTransfer() using this bank
 *     transaction's own account + amount + date as one leg, destinationBankAccountId as the other.
 */
export async function markBankFeedLineAsTransfer(input: MarkBankFeedTransferInput) {
  const { operatingCompanyId, bankTransactionId, destinationBankAccountId, transferKind, userId } = input;
  const pairedTransactionId = input.pairedTransactionId ?? null;

  const txn = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    return loadBankTransactionForTransfer(client, bankTransactionId, operatingCompanyId);
  });
  if (!txn) throw new Error("bank_txn_not_found");

  // Idempotent: already linked (a retry, or a second call for a row already marked) — never re-mint.
  if (txn.matched_transfer_id) {
    return { transfer_id: txn.matched_transfer_id, minted: false as const };
  }

  let transferId: string;
  let minted: boolean;

  if (input.existingTransferId) {
    // Caller already minted the transfer directly (RecordTransferModal/TransferModal path) — validate
    // ownership, then link-only. Reusing createTransfer's own read-path keeps ONE validation rule.
    const owned = await withCurrentUser(userId, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      const res = await client.query<{ id: string }>(
        `SELECT id FROM banking.transfers WHERE id = $1 AND operating_company_id = $2 AND revoked_at IS NULL LIMIT 1`,
        [input.existingTransferId, operatingCompanyId]
      );
      return res.rows[0]?.id ?? null;
    });
    if (!owned) throw new Error("transfer_not_found");
    transferId = owned;
    minted = false;
  } else if (pairedTransactionId) {
    const paired = await withCurrentUser(userId, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
      return loadBankTransactionForTransfer(client, pairedTransactionId, operatingCompanyId);
    });
    if (paired?.matched_transfer_id) {
      // The other leg was already marked first — reuse ITS transfer so both legs point at one row.
      transferId = paired.matched_transfer_id;
      minted = false;
    } else {
      const created = await mintTransferForBankFeedLine(input, txn);
      transferId = created.id;
      minted = true;
    }
  } else {
    const created = await mintTransferForBankFeedLine(input, txn);
    transferId = created.id;
    minted = true;
  }

  await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    await stampBankTransactionTransferLink(client, {
      bankTransactionId,
      operatingCompanyId,
      transferId,
      destinationBankAccountId,
      transferKind,
      pairedTransactionId,
    });
    if (pairedTransactionId) {
      await client.query(
        `
          UPDATE banking.bank_transactions
          SET
            status = 'transfer',
            category = 'transfer',
            category_kind = 'transfer',
            paired_transaction_id = $1,
            matched_transfer_id = $2,
            categorized_at = now(),
            updated_at = now()
          WHERE id = $3
            AND operating_company_id = $4
            AND matched_transfer_id IS NULL
        `,
        [bankTransactionId, transferId, pairedTransactionId, operatingCompanyId]
      );
    }
    await appendCrudAudit(
      client,
      userId,
      "banking.transaction.transfer.linked",
      {
        resource_type: "banking.bank_transactions",
        resource_id: bankTransactionId,
        operating_company_id: operatingCompanyId,
        transfer_id: transferId,
        minted,
        paired_transaction_id: pairedTransactionId,
      },
      "info",
      "BANK-ECON-03-MARK-TRANSFER"
    );
  });

  return { transfer_id: transferId, minted };
}

async function mintTransferForBankFeedLine(input: MarkBankFeedTransferInput, txn: BankFeedTransactionRow) {
  if (!txn.bank_account_id) throw new Error("transfer_account_not_accessible");
  const amountCents = Math.abs(Number(txn.amount_cents ?? 0));
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error("transfer_amount_must_be_positive");

  const fromAccountId = input.transferKind === "out" ? txn.bank_account_id : input.destinationBankAccountId;
  const toAccountId = input.transferKind === "out" ? input.destinationBankAccountId : txn.bank_account_id;
  const memo = txn.categorization_memo?.trim() || txn.description?.trim() || undefined;

  return createTransfer(
    {
      operatingCompanyId: input.operatingCompanyId,
      transferType: "bank_to_bank",
      fromAccountId,
      fromAccountKind: "bank",
      toAccountId,
      toAccountKind: "bank",
      amountCents,
      transferDate: txn.transaction_date,
      memo,
    },
    input.userId
  );
}

export async function revokeTransfer(transferId: string, operatingCompanyId: string, reason: string, userId: string) {
  const transfer = await withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const currentRes = await client.query<TransferRow>(
      `
        SELECT id, operating_company_id, from_account_id, from_account_kind, to_account_id, to_account_kind, amount_cents, revoked_at
        FROM banking.transfers
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
      `,
      [transferId, operatingCompanyId]
    );
    const current = currentRes.rows[0];
    if (!current) throw new Error("transfer_not_found");
    if (current.revoked_at) throw new Error("transfer_already_revoked");

    const updateRes = await client.query<TransferRow>(
      `
        UPDATE banking.transfers
        SET revoked_at = now(),
            revoked_by_user_id = $3,
            revoked_reason = $4,
            updated_at = now()
        WHERE id = $1
          AND operating_company_id = $2
        RETURNING id, operating_company_id, from_account_id, from_account_kind, to_account_id, to_account_kind, amount_cents, revoked_at
      `,
      [transferId, operatingCompanyId, userId, reason]
    );
    const revoked = updateRes.rows[0];
    if (!revoked) throw new Error("transfer_revoke_failed");

    if (revoked.from_account_kind === "bank") {
      await updateBankBalance(client, revoked.from_account_id, operatingCompanyId, Math.abs(revoked.amount_cents));
    }
    if (revoked.to_account_kind === "bank") {
      await updateBankBalance(client, revoked.to_account_id, operatingCompanyId, -Math.abs(revoked.amount_cents));
    }

    await appendCrudAudit(
      client,
      userId,
      "banking.transfer.revoked",
      {
        resource_type: "banking.transfers",
        resource_id: transferId,
        operating_company_id: operatingCompanyId,
        reason,
      },
      "warning",
      "P5-D1-TRANSFER"
    );
    return revoked;
  });

  // BANKING-GL-COMPLETION — reverse any posted transfer JE (idempotent no-op if the flag was off when the
  // transfer was created / nothing was ever posted).
  await maybePostTransferGl(transfer.operating_company_id, transfer.id, userId, "reversal");

  await enqueueSyncJob(
    transfer.operating_company_id,
    "transfer",
    transfer.id,
    payloadHash({
      transfer_id: transfer.id,
      revoked: true,
      reason,
    }),
    userId
  );

  return transfer;
}

export async function listTransfers(input: {
  userId: string;
  operatingCompanyId: string;
  fromDate?: string;
  toDate?: string;
  type?: TransferType;
  accountId?: string;
  status?: "active" | "revoked";
  limit: number;
  offset: number;
}) {
  return withCurrentUser(input.userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operatingCompanyId]);
    const values: unknown[] = [input.operatingCompanyId];
    const where: string[] = ["t.operating_company_id = $1"];
    if (input.fromDate) {
      values.push(input.fromDate);
      where.push(`t.transfer_date >= $${values.length}`);
    }
    if (input.toDate) {
      values.push(input.toDate);
      where.push(`t.transfer_date <= $${values.length}`);
    }
    if (input.type) {
      values.push(input.type);
      where.push(`t.transfer_type = $${values.length}`);
    }
    if (input.accountId) {
      values.push(input.accountId);
      where.push(`(t.from_account_id = $${values.length} OR t.to_account_id = $${values.length})`);
    }
    if (input.status === "active") where.push("t.revoked_at IS NULL");
    if (input.status === "revoked") where.push("t.revoked_at IS NOT NULL");
    values.push(input.limit, input.offset);
    const whereSql = where.join(" AND ");

    const res = await client.query(
      `
        SELECT
          t.*,
          fb.account_name AS from_bank_name,
          tb.account_name AS to_bank_name,
          fa.account_name AS from_coa_name,
          ta.account_name AS to_coa_name
        FROM banking.transfers t
        LEFT JOIN banking.bank_accounts fb ON fb.id = t.from_account_id
        LEFT JOIN banking.bank_accounts tb ON tb.id = t.to_account_id
        LEFT JOIN catalogs.accounts fa ON fa.id = t.from_account_id
        LEFT JOIN catalogs.accounts ta ON ta.id = t.to_account_id
        WHERE ${whereSql}
        ORDER BY t.transfer_date DESC, t.created_at DESC
        LIMIT $${values.length - 1} OFFSET $${values.length}
      `,
      values
    );
    return res.rows;
  });
}

export async function getTransferDetail(transferId: string, operatingCompanyId: string, userId: string) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
    const transferRes = await client.query(
      `
        SELECT *
        FROM banking.transfers
        WHERE id = $1
          AND operating_company_id = $2
        LIMIT 1
      `,
      [transferId, operatingCompanyId]
    );
    const transfer = transferRes.rows[0] ?? null;
    if (!transfer) return null;

    const auditRes = await withLuciaBypass(async (auditClient) => {
      const rows = await auditClient.query(
        `
          SELECT *
          FROM audit.audit_events
          WHERE payload->>'resource_type' = 'banking.transfers'
            AND payload->>'resource_id' = $1
          ORDER BY created_at DESC
          LIMIT 50
        `,
        [transferId]
      );
      return rows.rows;
    });

    return { transfer, audit_events: auditRes };
  });
}

