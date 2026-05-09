import { CountryCode, Products } from "plaid";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import { sendEmail } from "../../notifications/email.service.js";
import type { BankTransaction, TransactionCategoryRule } from "../../banking/types.js";
import { getPlaidClient, getPlaidEnvForAudit } from "./plaid-client.js";

type SyncCounts = { added: number; modified: number; removed: number };

function toCents(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return 0;
  return Math.round(value * 100);
}

function mapPlaidTypeToAccountType(input: string | null | undefined) {
  const normalized = (input ?? "").toLowerCase();
  if (normalized.includes("checking")) return "checking";
  if (normalized.includes("savings")) return "savings";
  if (normalized.includes("credit")) return "credit";
  return normalized || "checking";
}

async function appendSystemAudit(
  eventClass: string,
  payload: Record<string, unknown>,
  severity: "info" | "warning" = "info"
) {
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, NULL, $4)`, [
      eventClass,
      severity,
      JSON.stringify(payload),
      "P5-T1.2-PLAID",
    ]);
  });
}

async function lookupOwnerEmails() {
  return withLuciaBypass(async (client) => {
    const res = await client.query<{ email: string | null }>(
      `
        SELECT DISTINCT lower(u.email) AS email
        FROM identity.users u
        WHERE u.role = 'Owner'
          AND u.deactivated_at IS NULL
          AND u.email IS NOT NULL
      `
    );
    return res.rows.map((row) => row.email).filter((value): value is string => Boolean(value));
  });
}

async function loadCategoryRules(operatingCompanyId: string) {
  return withLuciaBypass(async (client) => {
    const res = await client.query<TransactionCategoryRule>(
      `
        SELECT
          id,
          operating_company_id,
          plaid_category_pattern,
          coa_account_id,
          priority,
          is_active,
          created_at::text,
          updated_at::text
        FROM banking.transaction_categories
        WHERE operating_company_id = $1
          AND is_active = true
        ORDER BY priority ASC, created_at ASC
      `,
      [operatingCompanyId]
    );
    return res.rows;
  });
}

export async function createLinkToken(userId: string, operatingCompanyId: string) {
  const plaid = getPlaidClient();
  const webhookBaseUrl = (process.env.WEBHOOK_BASE_URL ?? "").trim();
  if (!webhookBaseUrl) {
    throw new Error("WEBHOOK_BASE_URL is required for Plaid link token creation");
  }

  const response = await plaid.linkTokenCreate({
    user: { client_user_id: userId },
    client_name: "IH35 TMS",
    products: [Products.Transactions, Products.Auth],
    country_codes: [CountryCode.Us],
    language: "en",
    webhook: `${webhookBaseUrl}/api/v1/webhooks/plaid`,
  });

  await withCurrentUser(userId, async (client) => {
    await appendCrudAudit(
      client,
      userId,
      "banking.plaid.link_token_created",
      {
        operating_company_id: operatingCompanyId,
        plaid_env: getPlaidEnvForAudit(),
        token_expires_at: response.data.expiration,
      },
      "info",
      "P5-T1.2-PLAID"
    );
  });

  return {
    link_token: response.data.link_token,
    expiration: response.data.expiration,
  };
}

export async function exchangePublicToken(publicToken: string, operatingCompanyId: string, actorUserId: string) {
  const plaid = getPlaidClient();
  const exchange = await plaid.itemPublicTokenExchange({ public_token: publicToken });
  const accessToken = exchange.data.access_token;
  const itemId = exchange.data.item_id;
  const accountsResponse = await plaid.accountsGet({ access_token: accessToken });

  let institutionName = "Unknown Institution";
  const institutionId = accountsResponse.data.item?.institution_id;
  if (institutionId) {
    try {
      const institution = await plaid.institutionsGetById({
        institution_id: institutionId,
        country_codes: [CountryCode.Us],
      });
      institutionName = institution.data.institution.name || institutionName;
    } catch {
      institutionName = "Unknown Institution";
    }
  }

  const createdIds: string[] = [];
  await withCurrentUser(actorUserId, async (client) => {
    for (const account of accountsResponse.data.accounts) {
      const accountName = account.name || account.official_name || "Bank Account";
      const accountType = mapPlaidTypeToAccountType(account.subtype || account.type);
      const accountMask = account.mask ?? null;
      const currentBalance = toCents(account.balances.current);
      const availableBalance = toCents(account.balances.available ?? account.balances.current);

      const existing = await client.query<{ id: string }>(
        `
          SELECT id
          FROM banking.bank_accounts
          WHERE plaid_account_id = $1
            AND operating_company_id = $2
          LIMIT 1
        `,
        [account.account_id, operatingCompanyId]
      );

      let accountId = existing.rows[0]?.id ?? null;
      if (accountId) {
        await client.query(
          `
            UPDATE banking.bank_accounts
            SET
              plaid_item_id = $2,
              plaid_access_token = $3,
              institution_name = $4,
              account_name = $5,
              account_type = $6,
              account_mask = $7,
              current_balance_cents = $8,
              available_balance_cents = $9,
              sync_status = 'active',
              is_active = true,
              updated_at = now(),
              deactivated_at = NULL
            WHERE id = $1
          `,
          [accountId, itemId, accessToken, institutionName, accountName, accountType, accountMask, currentBalance, availableBalance]
        );
        await appendCrudAudit(
          client,
          actorUserId,
          "banking.bank_account.updated",
          {
            resource_type: "banking.bank_accounts",
            resource_id: accountId,
            plaid_item_id: itemId,
          },
          "info",
          "P5-T1.2-PLAID"
        );
      } else {
        const inserted = await client.query<{ id: string }>(
          `
            INSERT INTO banking.bank_accounts (
              operating_company_id,
              plaid_item_id,
              plaid_access_token,
              plaid_account_id,
              institution_name,
              account_name,
              account_type,
              account_mask,
              current_balance_cents,
              available_balance_cents,
              currency_code,
              is_active,
              sync_status,
              created_at,
              updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'USD',true,'active',now(),now())
            RETURNING id
          `,
          [operatingCompanyId, itemId, accessToken, account.account_id, institutionName, accountName, accountType, accountMask, currentBalance, availableBalance]
        );
        accountId = inserted.rows[0]?.id ?? null;
        if (accountId) {
          await appendCrudAudit(
            client,
            actorUserId,
            "banking.bank_account.created",
            {
              resource_type: "banking.bank_accounts",
              resource_id: accountId,
              plaid_item_id: itemId,
            },
            "info",
            "P5-T1.2-PLAID"
          );
        }
      }

      if (accountId) createdIds.push(accountId);
    }

    await appendCrudAudit(
      client,
      actorUserId,
      "banking.plaid.token_exchanged",
      {
        operating_company_id: operatingCompanyId,
        plaid_item_id: itemId,
        account_count: createdIds.length,
      },
      "info",
      "P5-T1.2-PLAID"
    );
  });

  return { bankAccountIds: createdIds };
}

export async function autoCategorize(transaction: Pick<BankTransaction, "operating_company_id" | "id" | "plaid_category">) {
  const rules = await loadCategoryRules(transaction.operating_company_id);
  if (rules.length === 0) return null;

  const categories = transaction.plaid_category ?? [];
  const matched = rules.find((rule) => categories.some((category) => category.toLowerCase().includes(rule.plaid_category_pattern.toLowerCase())));
  if (!matched) return null;

  await withLuciaBypass(async (client) => {
    const hasCoaColumn = await client.query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'banking'
            AND table_name = 'bank_transactions'
            AND column_name = 'coa_account_id'
        ) AS exists
      `
    );
    if (hasCoaColumn.rows[0]?.exists) {
      await client.query(`UPDATE banking.bank_transactions SET coa_account_id = $2, updated_at = now() WHERE id = $1`, [
        transaction.id,
        matched.coa_account_id,
      ]);
    }
  });

  return matched;
}

export async function syncTransactions(itemId: string) {
  const plaid = getPlaidClient();
  const accountRows = await withLuciaBypass(async (client) => {
    const res = await client.query<{
      id: string;
      operating_company_id: string;
      plaid_account_id: string | null;
      plaid_access_token: string | null;
    }>(
      `
        SELECT id, operating_company_id, plaid_account_id, plaid_access_token
        FROM banking.bank_accounts
        WHERE plaid_item_id = $1
          AND is_active = true
      `,
      [itemId]
    );
    return res.rows;
  });

  if (accountRows.length === 0) return { added: 0, modified: 0, removed: 0 } satisfies SyncCounts;
  const accessToken = accountRows.find((row) => row.plaid_access_token)?.plaid_access_token;
  if (!accessToken) throw new Error("plaid_access_token_missing_for_item");

  const accountByPlaidId = new Map<string, { id: string; operating_company_id: string }>();
  for (const account of accountRows) {
    if (account.plaid_account_id) {
      accountByPlaidId.set(account.plaid_account_id, { id: account.id, operating_company_id: account.operating_company_id });
    }
  }

  let hasMore = true;
  let cursor: string | undefined;
  const counts: SyncCounts = { added: 0, modified: 0, removed: 0 };

  while (hasMore) {
    const syncRes = await plaid.transactionsSync({
      access_token: accessToken,
      cursor,
      count: 200,
    });
    hasMore = syncRes.data.has_more;
    cursor = syncRes.data.next_cursor;

    await withLuciaBypass(async (client) => {
      for (const transaction of syncRes.data.added) {
        const bankAccount = accountByPlaidId.get(transaction.account_id);
        if (!bankAccount) continue;
        const insert = await client.query(
          `
            INSERT INTO banking.bank_transactions (
              bank_account_id,
              operating_company_id,
              plaid_transaction_id,
              transaction_date,
              posted_date,
              amount_cents,
              description,
              merchant_name,
              plaid_category,
              pending,
              is_credit,
              created_at,
              updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10,$11,now(),now())
            ON CONFLICT (plaid_transaction_id) DO NOTHING
            RETURNING id, operating_company_id, plaid_category
          `,
          [
            bankAccount.id,
            bankAccount.operating_company_id,
            transaction.transaction_id,
            transaction.date,
            transaction.authorized_date ?? null,
            toCents(transaction.amount),
            transaction.name ?? null,
            transaction.merchant_name ?? null,
            transaction.personal_finance_category
              ? [
                  transaction.personal_finance_category.primary,
                  ...(transaction.personal_finance_category.detailed ? [transaction.personal_finance_category.detailed] : []),
                ]
              : [],
            Boolean(transaction.pending),
            transaction.amount < 0,
          ]
        );
        if ((insert.rowCount ?? 0) > 0) {
          counts.added += 1;
          const row = insert.rows[0] as { id: string; operating_company_id: string; plaid_category: string[] } | undefined;
          if (row) {
            await autoCategorize({
              id: row.id,
              operating_company_id: row.operating_company_id,
              plaid_category: row.plaid_category ?? [],
            });
          }
        }
      }

      for (const transaction of syncRes.data.modified) {
        const update = await client.query(
          `
            UPDATE banking.bank_transactions
            SET
              transaction_date = $2,
              posted_date = $3,
              amount_cents = $4,
              description = $5,
              merchant_name = $6,
              plaid_category = $7::text[],
              pending = $8,
              is_credit = $9,
              updated_at = now()
            WHERE plaid_transaction_id = $1
          `,
          [
            transaction.transaction_id,
            transaction.date,
            transaction.authorized_date ?? null,
            toCents(transaction.amount),
            transaction.name ?? null,
            transaction.merchant_name ?? null,
            transaction.personal_finance_category
              ? [
                  transaction.personal_finance_category.primary,
                  ...(transaction.personal_finance_category.detailed ? [transaction.personal_finance_category.detailed] : []),
                ]
              : [],
            Boolean(transaction.pending),
            transaction.amount < 0,
          ]
        );
        counts.modified += Number(update.rowCount ?? 0);
      }

      for (const transaction of syncRes.data.removed) {
        const update = await client.query(
          `
            UPDATE banking.bank_transactions
            SET
              notes = trim(BOTH ';' FROM concat_ws(';', notes, 'removed_by_plaid_sync')),
              updated_at = now()
            WHERE plaid_transaction_id = $1
          `,
          [transaction.transaction_id]
        );
        counts.removed += Number(update.rowCount ?? 0);
      }
    });
  }

  await appendSystemAudit(
    "banking.transaction.imported",
    {
      plaid_item_id: itemId,
      counts,
    },
    "info"
  );

  return counts;
}

export async function getAccountBalance(bankAccountId: string) {
  const plaid = getPlaidClient();
  const account = await withLuciaBypass(async (client) => {
    const res = await client.query<{
      id: string;
      plaid_access_token: string | null;
      plaid_account_id: string | null;
    }>(
      `
        SELECT id, plaid_access_token, plaid_account_id
        FROM banking.bank_accounts
        WHERE id = $1
        LIMIT 1
      `,
      [bankAccountId]
    );
    return res.rows[0] ?? null;
  });
  if (!account || !account.plaid_access_token || !account.plaid_account_id) {
    throw new Error("bank_account_not_linked");
  }

  const response = await plaid.accountsBalanceGet({
    access_token: account.plaid_access_token,
    options: { account_ids: [account.plaid_account_id] },
  });
  const plaidAccount = response.data.accounts[0];
  if (!plaidAccount) throw new Error("plaid_account_not_found");

  const updated = await withLuciaBypass(async (client) => {
    const res = await client.query(
      `
        UPDATE banking.bank_accounts
        SET
          current_balance_cents = $2,
          available_balance_cents = $3,
          last_synced_at = now(),
          updated_at = now()
        WHERE id = $1
        RETURNING *
      `,
      [bankAccountId, toCents(plaidAccount.balances.current), toCents(plaidAccount.balances.available ?? plaidAccount.balances.current)]
    );
    return res.rows[0] ?? null;
  });

  await appendSystemAudit(
    "banking.bank_account.updated",
    {
      bank_account_id: bankAccountId,
      source: "plaid.accounts.balance.get",
    },
    "info"
  );

  return updated;
}

export async function handleItemError(itemId: string, errorCode: string) {
  const needsReauthCodes = new Set(["ITEM_LOGIN_REQUIRED", "ITEM_LOCKED", "INVALID_CREDENTIALS"]);
  const nextStatus = needsReauthCodes.has(errorCode) ? "needs_reauth" : "error";

  const affected = await withLuciaBypass(async (client) => {
    const res = await client.query<{ id: string; institution_name: string | null }>(
      `
        UPDATE banking.bank_accounts
        SET
          sync_status = $2,
          updated_at = now()
        WHERE plaid_item_id = $1
          AND is_active = true
        RETURNING id, institution_name
      `,
      [itemId, nextStatus]
    );
    return res.rows;
  });

  if (nextStatus === "needs_reauth" && affected.length > 0) {
    const recipients = await lookupOwnerEmails();
    if (recipients.length > 0) {
      const institution = affected[0]?.institution_name ?? "Connected bank";
      await sendEmail({
        to: recipients,
        subject: `[IH 35 TMS] Bank connection needs re-authentication: ${institution}`,
        html: `<p>The bank connection for ${institution} needs re-authentication.</p><p>Error code: ${errorCode}</p>`,
        text: `The bank connection for ${institution} needs re-authentication. Error code: ${errorCode}`,
        sender: "dispatch",
        eventClass: "banking.plaid.error",
        tags: [{ name: "type", value: "plaid_alert" }],
      });
    }
  }

  await appendSystemAudit(
    "banking.plaid.error",
    {
      plaid_item_id: itemId,
      error_code: errorCode,
      status_set_to: nextStatus,
      affected_accounts: affected.length,
    },
    "warning"
  );
}

