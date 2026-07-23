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
          ta.account_name AS to_coa_name,
          je.journal_entry_id
        FROM banking.transfers t
        LEFT JOIN banking.bank_accounts fb ON fb.id = t.from_account_id
        LEFT JOIN banking.bank_accounts tb ON tb.id = t.to_account_id
        LEFT JOIN catalogs.accounts fa ON fa.id = t.from_account_id
        LEFT JOIN catalogs.accounts ta ON ta.id = t.to_account_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(
            (
              SELECT jep.journal_entry_uuid::text
              FROM accounting.journal_entry_postings jep
              WHERE jep.operating_company_id = t.operating_company_id
                AND jep.source_transaction_type = 'transfer'
                AND jep.source_transaction_id = t.id::text
              ORDER BY jep.line_sequence ASC
              LIMIT 1
            ),
            (
              SELECT jep.journal_entry_uuid::text
              FROM accounting.transaction_source_links tsl
              JOIN accounting.journal_entry_postings jep ON jep.id = tsl.journal_entry_posting_id
              WHERE tsl.operating_company_id = t.operating_company_id
                AND tsl.linked_object_type = 'transfer'
                AND tsl.linked_object_id = t.id::text
              ORDER BY tsl.created_at ASC
              LIMIT 1
            )
          ) AS journal_entry_id
        ) je ON TRUE
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
        SELECT
          t.*,
          je.journal_entry_id
        FROM banking.transfers t
        LEFT JOIN LATERAL (
          SELECT COALESCE(
            (
              SELECT jep.journal_entry_uuid::text
              FROM accounting.journal_entry_postings jep
              WHERE jep.operating_company_id = t.operating_company_id
                AND jep.source_transaction_type = 'transfer'
                AND jep.source_transaction_id = t.id::text
              ORDER BY jep.line_sequence ASC
              LIMIT 1
            ),
            (
              SELECT jep.journal_entry_uuid::text
              FROM accounting.transaction_source_links tsl
              JOIN accounting.journal_entry_postings jep ON jep.id = tsl.journal_entry_posting_id
              WHERE tsl.operating_company_id = t.operating_company_id
                AND tsl.linked_object_type = 'transfer'
                AND tsl.linked_object_id = t.id::text
              ORDER BY tsl.created_at ASC
              LIMIT 1
            )
          ) AS journal_entry_id
        ) je ON TRUE
        WHERE t.id = $1
          AND t.operating_company_id = $2
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

