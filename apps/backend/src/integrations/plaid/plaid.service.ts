import { CountryCode } from "plaid";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import type { BankTransaction, TransactionCategoryRule } from "../../banking/types.js";
import {
  computeBankTransactionDedupHash,
  mergeManualBankTransactionStub,
  normalizeBankTransactionDescription,
} from "../../banking/bank-tx-dedup.js";
import { applyBankingRulesForTransaction } from "../../banking/banking-rules.engine.js";
import { dispatchNotification, listCompanyUserIdsByRoles } from "../../notifications/dispatcher.js";
import { sendEmail } from "../../notifications/email.service.js";
import {
  buildLinkTokenCreateCore,
  buildLinkTokenCreateRequestBase,
  resolvePlaidLinkAccountType,
  type PlaidLinkAccountType,
} from "./link-token-config.js";
import { withCircuitBreaker } from "../../lib/circuit-breaker/index.js";
import { getPlaidClient, getPlaidEnvForAudit } from "./plaid-client.js";
import { markPlaidItemSyncSucceeded } from "./plaid-sync-state.js";

type SyncCounts = {
  added: number;
  modified: number;
  removed: number;
  autoCategorizeTotal: number;
  autoCategorizeMatched: number;
  autoCategorizeUnmatched: number;
};

async function withPlaidCircuit<T>(fn: () => Promise<T>) {
  return withCircuitBreaker("plaid", fn);
}

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

export function mapPlaidAccountClass(plaidAccountType: string | null | undefined): "depository" | "credit" | "investment" | "other" {
  const t = String(plaidAccountType ?? "").toLowerCase();
  if (t === "depository") return "depository";
  if (t === "credit") return "credit";
  if (t === "investment") return "investment";
  return "other";
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
    await client.query(`SELECT set_config('app.operating_company_id', $1, false)`, [operatingCompanyId]);
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

function normalizeCategoryToken(input: string) {
  return input
    .trim()
    .toUpperCase()
    .replace(/[.\s/-]+/g, "_")
    .replace(/[^A-Z0-9_*]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function compileWildcardPattern(pattern: string) {
  const escaped = pattern
    .split("*")
    .map((segment) => segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`, "i");
}

function matchesRule(patternRaw: string, categories: string[]) {
  const normalizedPattern = normalizeCategoryToken(patternRaw);
  if (!normalizedPattern) return false;
  const normalizedCategories = categories.map((category) => normalizeCategoryToken(category)).filter(Boolean);
  if (normalizedCategories.length === 0) return false;
  if (normalizedPattern.includes("*")) {
    const matcher = compileWildcardPattern(normalizedPattern);
    return normalizedCategories.some((category) => matcher.test(category));
  }
  return normalizedCategories.some((category) => category === normalizedPattern || category.includes(normalizedPattern));
}

export async function createLinkToken(
  userId: string,
  operatingCompanyId: string,
  accountTypeInput: string | undefined = "bank"
) {
  const plaid = getPlaidClient();
  const webhookUrl =
    process.env.PLAID_WEBHOOK_URL?.trim() || "https://api.ih35dispatch.com/api/v1/banking/plaid/webhook";

  const accountType: PlaidLinkAccountType = resolvePlaidLinkAccountType(accountTypeInput);
  const core = buildLinkTokenCreateCore(accountType);

  const response = await withPlaidCircuit(() =>
    plaid.linkTokenCreate({
      user: { client_user_id: userId },
      ...buildLinkTokenCreateRequestBase(webhookUrl),
      products: core.products,
      ...(core.account_filters ? { account_filters: core.account_filters } : {}),
    })
  );

  await withCurrentUser(userId, async (client) => {
    await appendCrudAudit(
      client,
      userId,
      "banking.plaid.link_token_created",
      {
        operating_company_id: operatingCompanyId,
        plaid_env: getPlaidEnvForAudit(),
        token_expires_at: response.data.expiration,
        link_account_type: accountType,
        plaid_products: core.products,
        plaid_account_filters: core.account_filters ?? null,
      },
      "info",
      "P5-T1.2-PLAID"
    );
  });

  return {
    link_token: response.data.link_token,
    expiration: response.data.expiration,
    accountType,
    products: core.products,
    account_filters: core.account_filters ?? null,
  };
}

export async function createUpdateModeLinkToken(userId: string, operatingCompanyId: string, plaidItemId: string) {
  const accessToken = await withLuciaBypass(async (client) => {
    const res = await client.query<{ t: string | null }>(
      `
        SELECT plaid_access_token AS t
        FROM banking.bank_accounts
        WHERE operating_company_id = $1::uuid
          AND plaid_item_id = $2
          AND plaid_access_token IS NOT NULL
        LIMIT 1
      `,
      [operatingCompanyId, plaidItemId]
    );
    return res.rows[0]?.t ?? null;
  });

  if (!accessToken) {
    throw new Error("E_PLAID_UPDATE_TOKEN: Plaid item not found or missing access token for this company");
  }

  const plaid = getPlaidClient();
  const webhookUrl =
    process.env.PLAID_WEBHOOK_URL?.trim() || "https://api.ih35dispatch.com/api/v1/banking/plaid/webhook";

  const response = await withPlaidCircuit(() =>
    plaid.linkTokenCreate({
      user: { client_user_id: userId },
      ...buildLinkTokenCreateRequestBase(webhookUrl),
      access_token: accessToken,
    })
  );

  await withCurrentUser(userId, async (client) => {
    await appendCrudAudit(
      client,
      userId,
      "banking.plaid.update_link_token_created",
      {
        operating_company_id: operatingCompanyId,
        plaid_item_id: plaidItemId,
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
  const exchange = await withPlaidCircuit(() => plaid.itemPublicTokenExchange({ public_token: publicToken }));
  const accessToken = exchange.data.access_token;
  const itemId = exchange.data.item_id;
  const accountsResponse = await withPlaidCircuit(() => plaid.accountsGet({ access_token: accessToken }));

  let institutionName = "Unknown Institution";
  const institutionId = accountsResponse.data.item?.institution_id;
  if (institutionId) {
    try {
      const institution = await withPlaidCircuit(() =>
        plaid.institutionsGetById({
          institution_id: institutionId,
          country_codes: [CountryCode.Us],
        })
      );
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
      const accountClass = mapPlaidAccountClass(account.type);
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
              account_class = $7,
              account_mask = $8,
              current_balance_cents = $9,
              available_balance_cents = $10,
              sync_status = 'active',
              is_active = true,
              updated_at = now(),
              deactivated_at = NULL
            WHERE id = $1
          `,
          [
            accountId,
            itemId,
            accessToken,
            institutionName,
            accountName,
            accountType,
            accountClass,
            accountMask,
            currentBalance,
            availableBalance,
          ]
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
              account_class,
              account_mask,
              current_balance_cents,
              available_balance_cents,
              currency_code,
              is_active,
              sync_status,
              created_at,
              updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'USD',true,'active',now(),now())
            RETURNING id
          `,
          [
            operatingCompanyId,
            itemId,
            accessToken,
            account.account_id,
            institutionName,
            accountName,
            accountType,
            accountClass,
            accountMask,
            currentBalance,
            availableBalance,
          ]
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

  return { bankAccountIds: createdIds, item_id: itemId };
}

export async function autoCategorize(transaction: Pick<BankTransaction, "operating_company_id" | "id" | "plaid_category">) {
  const rules = await loadCategoryRules(transaction.operating_company_id);
  if (rules.length === 0) return null;

  const categories = transaction.plaid_category ?? [];
  const matched = rules.find((rule) => matchesRule(rule.plaid_category_pattern, categories));
  if (!matched) return null;

  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, false)`, [transaction.operating_company_id]);
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
      const updated = await client.query(
        `UPDATE banking.bank_transactions SET coa_account_id = $2, updated_at = now() WHERE id = $1 AND operating_company_id = $3 AND coa_account_id IS NULL`,
        [
        transaction.id,
        matched.coa_account_id,
        transaction.operating_company_id,
      ]);
      if ((updated.rowCount ?? 0) === 0) return;
      console.info("[PLAID_CATEGORIZE_RULE_MATCH]", {
        operatingCompanyId: transaction.operating_company_id,
        transactionId: transaction.id,
        ruleId: matched.id,
        matchedPattern: matched.plaid_category_pattern,
        coaAccountId: matched.coa_account_id,
      });
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

  if (accountRows.length === 0) {
    return {
      added: 0,
      modified: 0,
      removed: 0,
      autoCategorizeTotal: 0,
      autoCategorizeMatched: 0,
      autoCategorizeUnmatched: 0,
    } satisfies SyncCounts;
  }
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
  const counts: SyncCounts = {
    added: 0,
    modified: 0,
    removed: 0,
    autoCategorizeTotal: 0,
    autoCategorizeMatched: 0,
    autoCategorizeUnmatched: 0,
  };

  while (hasMore) {
    const syncRes = await withPlaidCircuit(() =>
      plaid.transactionsSync({
        access_token: accessToken,
        cursor,
        count: 200,
      })
    );
    hasMore = syncRes.data.has_more;
    cursor = syncRes.data.next_cursor;

    await withLuciaBypass(async (client) => {
      for (const transaction of syncRes.data.added) {
        const bankAccount = accountByPlaidId.get(transaction.account_id);
        if (!bankAccount) continue;
        const descParts = [transaction.name, transaction.merchant_name].filter(Boolean).join(" ");
        const normalizedDescription = normalizeBankTransactionDescription(descParts);
        const dedupHash = computeBankTransactionDedupHash({
          bank_account_id: bankAccount.id,
          transaction_date: transaction.date,
          amount_cents: Math.abs(toCents(transaction.amount)),
          normalized_description: normalizedDescription,
        });
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
              normalized_description,
              dedup_hash,
              source,
              created_at,
              updated_at
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::text[],$10,$11,$12,$13,'plaid',now(),now())
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
            normalizedDescription,
            dedupHash,
          ]
        );
        if ((insert.rowCount ?? 0) > 0) {
          counts.added += 1;
          const row = insert.rows[0] as { id: string; operating_company_id: string; plaid_category: string[] } | undefined;
          if (row) {
            await applyBankingRulesForTransaction(client, row.id, row.operating_company_id);
            await mergeManualBankTransactionStub(client, {
              plaidRowId: row.id,
              operatingCompanyId: row.operating_company_id,
              bankAccountId: bankAccount.id,
              transactionDate: transaction.date,
              amountCents: Math.abs(toCents(transaction.amount)),
              normalizedDescription,
            });
            counts.autoCategorizeTotal += 1;
            const matched = await autoCategorize({
              id: row.id,
              operating_company_id: row.operating_company_id,
              plaid_category: row.plaid_category ?? [],
            });
            if (matched) counts.autoCategorizeMatched += 1;
            else counts.autoCategorizeUnmatched += 1;
          }
        }
      }

      for (const transaction of syncRes.data.modified) {
        const bankAccount = accountByPlaidId.get(transaction.account_id);
        if (!bankAccount) continue;
        const modDescParts = [transaction.name, transaction.merchant_name].filter(Boolean).join(" ");
        const modNormalized = normalizeBankTransactionDescription(modDescParts);
        const modDedupHash = computeBankTransactionDedupHash({
          bank_account_id: bankAccount.id,
          transaction_date: transaction.date,
          amount_cents: Math.abs(toCents(transaction.amount)),
          normalized_description: modNormalized,
        });
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
              normalized_description = $10,
              dedup_hash = $11,
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
            modNormalized,
            modDedupHash,
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

  await markPlaidItemSyncSucceeded(itemId);

  await appendSystemAudit(
    "banking.transaction.imported",
    {
      plaid_item_id: itemId,
      counts,
    },
    "info"
  );
  console.info("[PLAID_AUTOCAT_BATCH]", {
    plaidItemId: itemId,
    total: counts.autoCategorizeTotal,
    matched: counts.autoCategorizeMatched,
    unmatched: counts.autoCategorizeUnmatched,
  });

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
  const plaidAccessToken = account.plaid_access_token;
  const plaidAccountId = account.plaid_account_id;

  const response = await withPlaidCircuit(() =>
    plaid.accountsBalanceGet({
      access_token: plaidAccessToken,
      options: { account_ids: [plaidAccountId] },
    })
  );
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

export async function handlePlaidItemLoginRequiredWebhook(itemId: string) {
  const affected = await withLuciaBypass(async (client) => {
    const res = await client.query<{ id: string; operating_company_id: string; institution_name: string | null }>(
      `
        UPDATE banking.bank_accounts
        SET
          sync_status = 'needs_reauth',
          updated_at = now()
        WHERE plaid_item_id = $1
          AND is_active = true
        RETURNING id, operating_company_id, institution_name
      `,
      [itemId]
    );
    return res.rows;
  });

  const operatingCompanies = new Map<string, string>();
  for (const row of affected) {
    operatingCompanies.set(row.operating_company_id, row.institution_name ?? "Connected bank");
  }

  for (const [operatingCompanyId, institutionLabel] of operatingCompanies.entries()) {
    const owners = await listCompanyUserIdsByRoles(operatingCompanyId, ["Owner"]);
    await Promise.all(
      owners.map((userId) =>
        dispatchNotification({
          user_id: userId,
          event_type: "banking.plaid.login-required",
          actor_user_id: null,
          payload: {
            operating_company_id: operatingCompanyId,
            headline: "Plaid bank connection needs re-authentication",
            bodyText: `${institutionLabel} requires a fresh login in IH35 (Plaid item ${itemId}).`,
            sms_body: `Plaid: ${institutionLabel} needs re-auth.`,
            whatsapp_skip: true,
          },
        }).catch(() => undefined)
      )
    );
  }

  await appendSystemAudit(
    "banking.plaid.item_login_required",
    {
      plaid_item_id: itemId,
      affected_accounts: affected.length,
      operating_companies: [...operatingCompanies.keys()],
    },
    "warning"
  );
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

