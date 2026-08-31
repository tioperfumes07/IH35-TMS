import { CountryCode } from "plaid";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import type { BankTransaction, TransactionCategoryRule } from "../../banking/types.js";
import {
  computeBankTransactionDedupHash,
  mergeManualBankTransactionStub,
  normalizeBankTransactionDescription,
  retirePlaidPendingPredecessor,
} from "../../banking/bank-tx-dedup.js";
import { applyBankingRulesForTransaction } from "../../banking/banking-rules.engine.js";
import { maybePostBankCategorizationToGl } from "../../banking/bank-feed-gl-posting.service.js";
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
import { decryptPlaidAccessToken, encryptPlaidAccessToken } from "./plaid-token-crypto.js";
import { plaidMaskOwnershipViolation } from "../../banking/plaid-mask-ownership.js";

type SyncCounts = {
  added: number;
  modified: number;
  removed: number;
  rowErrors: number;
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
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [operatingCompanyId]);
    const res = await client.query<TransactionCategoryRule>(
      `
        SELECT
          id,
          operating_company_id,
          plaid_category_pattern,
          description_pattern,
          coa_account_id,
          priority,
          is_active,
          created_at::text,
          updated_at::text
        FROM banking.transaction_categories
        WHERE operating_company_id = $1::uuid
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

/**
 * BANK-F02 — how specifically a rule matched a transaction. 0 = no match; higher wins.
 *
 * THE DEFECT THIS REPLACES. Selection used `rules.find(...)` — FIRST match by priority — while
 * category matching used an unanchored `category.includes(pattern)` over EVERY element of Plaid's
 * hierarchical array. Plaid sends the whole path, e.g. {TRANSPORTATION, TRANSPORTATION_TOLLS}, so a
 * rule with pattern `TRANSPORTATION` matched the PARENT element of every transportation transaction.
 * With that rule seeded at priority 20 and `TOLL` at priority 40, first-match-wins meant the LEAST
 * specific rule always won: 13 Laredo bridge tolls ($1,215.40) posted to Fuel Expense and the correct
 * TOLL rule was never reached.
 *
 * QuickBooks documents the same hazard and the same remedy — rules apply in order and must be arranged
 * most-specific-first, because "a general rule ... will override your smarter, more specific rules."
 * NetSuite likewise matches on memo/payee text, not just a category. Rather than depend on a human
 * keeping 17 priorities in the right order forever, specificity is COMPUTED and the most specific
 * match wins; priority remains the tie-break.
 *
 *   3 = merchant/description match (QuickBooks "Bank text contains" — the most specific signal)
 *   2 = matched the LEAF category (the most specific element Plaid supplied)
 *   1 = matched a PARENT category element
 *
 * The parent tier is deliberately KEPT rather than removed. 21 genuine fuel purchases
 * (FUEL AMERICA TRAVEL, $961.32) are mislabelled TRANSPORTATION_PUBLIC_TRANSIT by Plaid and reach
 * Fuel Expense only through the broad parent rule; deleting that rule to fix tolls would have dropped
 * real expense out of the P&L. Ranking instead of deleting fixes the tolls AND keeps that fuel booked.
 */
export function scoreRuleMatch(
  patternRaw: string | null,
  categories: string[],
  descriptionPatternRaw?: string | null,
  description?: string | null
): number {
  // Tier 3 — merchant text. Checked first: it is the only signal that can correct a WRONG Plaid
  // label (LOVE'S TIRE CARE is a tire purchase Plaid reports as TRANSPORTATION_GAS, which no
  // category rule can ever fix).
  const descPattern = (descriptionPatternRaw ?? "").trim().toUpperCase();
  if (descPattern) {
    const haystack = (description ?? "").toUpperCase();
    if (!haystack) return 0;
    const matched = descPattern.includes("*")
      ? compileWildcardPattern(descPattern.replace(/\s+/g, " ")).test(haystack.replace(/\s+/g, " "))
      : haystack.includes(descPattern);
    if (!matched) return 0;
    return 3;
  }

  const normalizedPattern = normalizeCategoryToken(patternRaw ?? "");
  if (!normalizedPattern) return 0;
  const normalizedCategories = categories.map((category) => normalizeCategoryToken(category)).filter(Boolean);
  if (normalizedCategories.length === 0) return 0;

  // Plaid orders the array general -> specific, so the last element is the leaf.
  const leafIndex = normalizedCategories.length - 1;
  const test = normalizedPattern.includes("*")
    ? (category: string) => compileWildcardPattern(normalizedPattern).test(category)
    : (category: string) => category === normalizedPattern || category.includes(normalizedPattern);

  // A pattern that IS the name of a parent element is a PARENT rule, even though substring matching
  // also makes it "match" the leaf (TRANSPORTATION_TOLLS contains TRANSPORTATION). Without this the
  // parent rule would earn leaf credit and the inversion this function exists to fix would survive
  // inside the scorer itself.
  const isParentRule = normalizedCategories.some(
    (category, i) => i !== leafIndex && category === normalizedPattern
  );

  let best = 0;
  for (let i = 0; i < normalizedCategories.length; i += 1) {
    if (!test(normalizedCategories[i])) continue;
    best = Math.max(best, i === leafIndex && !isParentRule ? 2 : 1);
  }
  return best;
}

/** Back-compat boolean form (unchanged semantics) for callers that only need "did it match". */
function matchesRule(patternRaw: string, categories: string[]) {
  return scoreRuleMatch(patternRaw, categories) > 0;
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
    // G10-H5: decrypt at rest (backward-compatible with legacy plaintext rows).
    return decryptPlaidAccessToken(res.rows[0]?.t ?? null);
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
  // G10-H5: never persist the raw token. Encrypt at rest (AES-256-GCM via lib/encryption.ts);
  // the plaintext `accessToken` is used ONLY for the in-memory Plaid API calls below.
  const accessTokenEncrypted = encryptPlaidAccessToken(accessToken);
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
    // DS-AUDIT (USMCA Plaid connect fix): withCurrentUser sets app.current_user_id but NOT
    // app.operating_company_id. The banking.bank_accounts RLS WITH CHECK is
    // `is_lucia_bypass() OR operating_company_id = app.operating_company_id`, so with the opco GUC
    // unset every INSERT/UPDATE here is RLS-rejected and the whole exchange rolls back (0 accounts
    // persisted; only link_token_created in the audit). SUPPLY the target scope (mirrors the
    // withCompanyScope pattern every read route uses) — this does NOT bypass RLS: the writes can
    // still only touch the scoped opco, so a USMCA connect can never write a TRANSP/TRK row.
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operatingCompanyId]);
    const companyCodeRes = await client.query<{ code: string }>(
      `SELECT code FROM org.companies WHERE id = $1::uuid LIMIT 1`,
      [operatingCompanyId]
    );
    const companyCode = companyCodeRes.rows[0]?.code ?? "";
    for (const account of accountsResponse.data.accounts) {
      const accountName = account.name || account.official_name || "Bank Account";
      const accountType = mapPlaidTypeToAccountType(account.subtype || account.type);
      const accountClass = mapPlaidAccountClass(account.type);
      const accountMask = account.mask ?? null;
      const currentBalance = toCents(account.balances.current);
      const availableBalance = toCents(account.balances.available ?? account.balances.current);

      // Owner 2026-07-23: shared WF login — refuse wrong-entity bank rows by last-4.
      const ownershipFail = plaidMaskOwnershipViolation(companyCode, accountMask);
      if (ownershipFail) {
        await appendCrudAudit(
          client,
          actorUserId,
          "banking.plaid.mask_ownership_rejected",
          {
            resource_type: "banking.bank_accounts",
            operating_company_id: operatingCompanyId,
            account_mask: ownershipFail.mask,
            owner_company_code: ownershipFail.owner,
            attempted_company_code: ownershipFail.attempted,
            plaid_account_id: account.account_id,
          },
          "warning",
          "PLAID-MASK-OWNERSHIP-2026-07-23"
        );
        continue;
      }

      const existing = await client.query<{ id: string }>(
        `
          SELECT id
          FROM banking.bank_accounts
          WHERE plaid_account_id = $1
            AND operating_company_id = $2::uuid
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
            accessTokenEncrypted,
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
            accessTokenEncrypted,
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

/**
 * ACCT-LINK-06 / ACCT-F05 — Plaid category rules must land on the SAME CHAIN-05 terminal state as the
 * For Review categorize routes: status=categorized + categorization_gl_account_id (+ legacy coa_account_id)
 * then maybePostBankCategorizationToGl when an actor is known. Writing only coa_account_id left rows
 * invisible to the poster and starved matched_journal_entry_id density.
 */
export async function autoCategorize(
  transaction: Pick<BankTransaction, "operating_company_id" | "id" | "plaid_category"> & { description?: string | null },
  opts?: { actorUserUuid?: string; dryRun?: boolean }
) {
  const rules = await loadCategoryRules(transaction.operating_company_id);
  if (rules.length === 0) return null;

  const categories = transaction.plaid_category ?? [];
  // MOST SPECIFIC WINS, then priority. `rules` arrives ordered priority ASC, created_at ASC, so a
  // strict `>` keeps the first (lowest-priority-number) rule among equal specificity — the previous
  // tie-break is preserved exactly, only the ranking above it is new.
  let matched: (typeof rules)[number] | undefined;
  let bestScore = 0;
  for (const rule of rules) {
    if (!rule.coa_account_id) continue;
    const score = scoreRuleMatch(
      rule.plaid_category_pattern,
      categories,
      rule.description_pattern ?? null,
      transaction.description ?? null
    );
    if (score > bestScore) {
      bestScore = score;
      matched = rule;
    }
  }
  if (!matched?.coa_account_id) return null;
  if (opts?.dryRun) return matched;

  let applied = false;
  await withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, false)`, [transaction.operating_company_id]);
    const updated = await client.query(
      `
        UPDATE banking.bank_transactions
        SET
          status = 'categorized',
          category = COALESCE(NULLIF(BTRIM(category), ''), 'rule_match'),
          category_kind = COALESCE(NULLIF(BTRIM(category_kind), ''), 'expense'),
          categorization_gl_account_id = $2::uuid,
          coa_account_id = $2::uuid,
          categorized_at = COALESCE(categorized_at, now()),
          skip_reason = NULL,
          investigate_note = NULL,
          updated_at = now()
        WHERE id = $1::uuid
          AND operating_company_id = $3::uuid
          AND matched_journal_entry_id IS NULL
          AND categorization_gl_account_id IS NULL
          AND COALESCE(status, 'pending_categorization') IN ('pending_categorization', 'uncategorized')
      `,
      [transaction.id, matched.coa_account_id, transaction.operating_company_id]
    );
    applied = (updated.rowCount ?? 0) > 0;
    if (!applied) return;
    console.info("[PLAID_CATEGORIZE_RULE_MATCH]", {
      operatingCompanyId: transaction.operating_company_id,
      transactionId: transaction.id,
      ruleId: matched.id,
      matchedPattern: matched.plaid_category_pattern,
      coaAccountId: matched.coa_account_id,
      chain05: true,
    });
  });

  if (!applied) return null;

  // Poster is flag-gated (BANK_FEED_GL_POSTING_ENABLED). Skip when no actor (Plaid sync path) —
  // tags are still CHAIN-05 complete so apply-historical / categorize can post later.
  if (opts?.actorUserUuid) {
    try {
      await maybePostBankCategorizationToGl({
        companyId: transaction.operating_company_id,
        actorUserUuid: opts.actorUserUuid,
        bankTransactionId: transaction.id,
      });
    } catch (err) {
      console.warn("[PLAID_CATEGORIZE_RULE_MATCH_GL_FAILED]", {
        operatingCompanyId: transaction.operating_company_id,
        transactionId: transaction.id,
        message: String((err as Error)?.message ?? err),
      });
    }
  }

  return matched;
}

export async function syncTransactions(itemId: string, opts?: { actorUserUuid?: string }) {
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
      rowErrors: 0,
      autoCategorizeTotal: 0,
      autoCategorizeMatched: 0,
      autoCategorizeUnmatched: 0,
    } satisfies SyncCounts;
  }
  // G10-H5: decrypt at rest (backward-compatible with legacy plaintext rows).
  const accessToken = decryptPlaidAccessToken(
    accountRows.find((row) => row.plaid_access_token)?.plaid_access_token ?? null
  );
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
    rowErrors: 0,
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
      // Per-row isolation: each row runs inside its own SAVEPOINT so a single bad row (a 'modified'
      // UPDATE that collides on the dedup index, malformed data, or any FUTURE constraint) rolls back
      // ONLY that row — tallied in counts.rowErrors — and can never abort the whole sync batch (the
      // all-or-nothing failure class that produced the 0-transactions / 500).
      const runRow = async (work: () => Promise<void>) => {
        await client.query("SAVEPOINT plaid_row");
        try {
          await work();
          await client.query("RELEASE SAVEPOINT plaid_row");
        } catch {
          await client.query("ROLLBACK TO SAVEPOINT plaid_row");
          counts.rowErrors += 1;
        }
      };

      for (const transaction of syncRes.data.added) {
       await runRow(async () => {
        const bankAccount = accountByPlaidId.get(transaction.account_id);
        if (!bankAccount) return;
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
            -- Arbitrate on the dedup index uq_bank_transactions_account_dedup (bank_account_id, dedup_hash):
            -- a re-synced txn shares both plaid_transaction_id AND the dedup hash, and a cross-source dupe
            -- shares the dedup hash — so this single arbiter covers every collision in the 'added' batch and
            -- skips it instead of aborting the whole transaction (the 0-transactions / 500 bug). 'modified'
            -- txns (same plaid_transaction_id, changed fields) take the separate UPDATE path, not this insert.
            ON CONFLICT (bank_account_id, dedup_hash)
            WHERE dedup_hash IS NOT NULL AND voided_at IS NULL
            DO NOTHING
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
            const pendingRetirement = await retirePlaidPendingPredecessor(client, {
              postedRowId: row.id,
              postedPlaidTransactionId: transaction.transaction_id,
              pendingPlaidTransactionId: transaction.pending_transaction_id,
              operatingCompanyId: row.operating_company_id,
              bankAccountId: bankAccount.id,
            });
            if (!pendingRetirement.retired && pendingRetirement.reason === "financially_linked") {
              throw new Error("plaid_pending_predecessor_financially_linked");
            }
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
            const matched = await autoCategorize(
              {
                id: row.id,
                operating_company_id: row.operating_company_id,
                plaid_category: row.plaid_category ?? [],
                // BANK-F02 — the merchant condition needs the bank text; without it a
                // description_pattern rule can never fire.
                description: normalizedDescription,
              },
              { actorUserUuid: opts?.actorUserUuid }
            );
            if (matched) counts.autoCategorizeMatched += 1;
            else counts.autoCategorizeUnmatched += 1;
          }
        }
       });
      }

      for (const transaction of syncRes.data.modified) {
       await runRow(async () => {
        const bankAccount = accountByPlaidId.get(transaction.account_id);
        if (!bankAccount) return;
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
       });
      }

      for (const transaction of syncRes.data.removed) {
       await runRow(async () => {
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
       });
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
  // G10-H5: decrypt at rest (backward-compatible with legacy plaintext rows).
  const plaidAccessToken = decryptPlaidAccessToken(account.plaid_access_token);
  const plaidAccountId = account.plaid_account_id;
  if (!plaidAccessToken) throw new Error("bank_account_not_linked");

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
