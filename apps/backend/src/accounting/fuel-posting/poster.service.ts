import { withLuciaBypass } from "../../auth/db.js";
import { resolveAccountForCategory } from "../expense-category-map/resolver.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export const FUEL_CATEGORY_CODES = ["diesel", "def", "reefer", "oil", "misc"] as const;
export type FuelCategoryCode = (typeof FUEL_CATEGORY_CODES)[number];
export type FuelPostingPath = "driver_advance" | "company_direct";
export type CompanyDirectCredit = "cash" | "ap";

export type FuelPostingInput = {
  operating_company_id: string;
  actor_user_id: string;
  fuel_event_id: string;
  fuel_kind: FuelCategoryCode;
  posted_at: string;
  amount_cents: number;
  posting_path: FuelPostingPath;
  driver_id?: string | null;
  ifta_state?: string | null;
  ifta_gallons?: number | null;
  memo?: string | null;
  company_direct_credit?: CompanyDirectCredit;
};

export type FuelPostingResult = {
  result: "posted" | "already_posted";
  posting_batch_id: string;
  journal_entry_id: string;
  journal_entry_posting_ids: string[];
  idempotency_key: string;
  account_resolution_trace: Array<Record<string, unknown>>;
};

export type OutstandingFuelAdvance = {
  advance_id: string;
  liability_id: string;
  display_id: string | null;
  created_at: string;
  original_amount_cents: number;
  outstanding_balance_cents: number;
};

function normalizeFuelKind(input: string): FuelCategoryCode {
  const normalized = input.trim().toLowerCase();
  if ((FUEL_CATEGORY_CODES as readonly string[]).includes(normalized)) {
    return normalized as FuelCategoryCode;
  }
  throw new Error(`Unsupported fuel kind for posting: ${input}`);
}

function buildFuelIdempotencyKey(input: Pick<FuelPostingInput, "operating_company_id" | "fuel_event_id" | "posting_path">) {
  return ["ih35:fuel-posting:v1", input.operating_company_id.toLowerCase(), input.fuel_event_id, input.posting_path].join(":");
}

async function ensureOpenPeriod(client: DbClient, operatingCompanyId: string, postingDate: string) {
  const cutoff = await client
    .query<{ cutoff: string | null }>(`SELECT accounting.closed_period_cutoff($1::uuid)::text AS cutoff`, [operatingCompanyId])
    .catch(() => ({ rows: [{ cutoff: null }] }));
  const closedThrough = cutoff.rows[0]?.cutoff;
  if (closedThrough && postingDate <= closedThrough) {
    throw new Error(`IH35_CLOSED_PERIOD closed_through=${closedThrough} txn_date=${postingDate}`);
  }
}

// USMCA cross-entity-leak fix: this poster runs on withLuciaBypass (is_lucia_bypass()=true), so the
// entity-scoped catalogs.accounts RLS (operating_company_id = app.operating_company_id GUC) is DEFEATED
// and every catalogs.accounts read below would otherwise resolve an ARBITRARY entity's GL account
// (ORDER BY ... LIMIT 1 across the whole per-entity COA). That would post a TRANSP fuel expense against
// a TRK/USMCA account. catalogs.accounts is per-entity (AF-1, operating_company_id NOT NULL), so we pin
// every resolver to the posting entity via an explicit operating_company_id predicate. Behavior is
// identical for the correct entity (today only TRANSP has a populated COA).
async function resolveRoleBoundAccount(client: DbClient, operatingCompanyId: string, roleKey: string): Promise<string | null> {
  const row = await client.query<{ account_id: string }>(
    `
      SELECT arb.account_id::text AS account_id
      FROM catalogs.account_role_bindings arb
      JOIN catalogs.accounts a ON a.id = arb.account_id
      WHERE arb.role_key = $1
        AND arb.deactivated_at IS NULL
        AND a.deactivated_at IS NULL
        AND a.is_postable = true
        AND (arb.operating_company_id = $2::uuid OR arb.operating_company_id IS NULL)
        AND a.operating_company_id = $2::uuid
      ORDER BY (arb.operating_company_id IS NOT NULL) DESC
      LIMIT 1
    `,
    [roleKey, operatingCompanyId]
  );
  return row.rows[0]?.account_id ?? null;
}

async function resolveFuelAdvanceLiabilityAccount(client: DbClient, operatingCompanyId: string): Promise<string> {
  const byName = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM catalogs.accounts
      WHERE account_type = 'Liability'
        AND deactivated_at IS NULL
        AND is_postable = true
        AND operating_company_id = $1::uuid
        AND (
          account_name ILIKE '%fuel%advance%'
          OR account_name ILIKE '%driver%advance%'
          OR account_name ILIKE '%advance liability%'
        )
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  if (byName.rows[0]?.id) return byName.rows[0].id;

  const bySubtype = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM catalogs.accounts
      WHERE account_type = 'Liability'
        AND account_subtype IN ('OtherCurrentLiabilities', 'CurrentLiabilities')
        AND deactivated_at IS NULL
        AND is_postable = true
        AND operating_company_id = $1::uuid
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  if (bySubtype.rows[0]?.id) return bySubtype.rows[0].id;

  throw new Error("Fuel advance liability account mapping is missing");
}

async function resolveCompanyDirectCreditAccount(
  client: DbClient,
  operatingCompanyId: string,
  preference: CompanyDirectCredit
): Promise<{ account_id: string; source: string }> {
  if (preference === "ap") {
    const apBound = await resolveRoleBoundAccount(client, operatingCompanyId, "ap_clearing");
    if (apBound) return { account_id: apBound, source: "role_binding:ap_clearing" };
    const apSubtype = await client.query<{ id: string }>(
      `
        SELECT id::text
        FROM catalogs.accounts
        WHERE account_subtype = 'AccountsPayable'
          AND deactivated_at IS NULL
          AND is_postable = true
          AND operating_company_id = $1::uuid
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      [operatingCompanyId]
    );
    if (apSubtype.rows[0]?.id) return { account_id: apSubtype.rows[0].id, source: "account_subtype:AccountsPayable" };
    throw new Error("AP credit account mapping is missing for company-direct fuel posting");
  }

  const undeposited = await resolveRoleBoundAccount(client, operatingCompanyId, "undeposited_funds");
  if (undeposited) return { account_id: undeposited, source: "role_binding:undeposited_funds" };

  const cashLike = await client.query<{ id: string }>(
    `
      SELECT id::text
      FROM catalogs.accounts
      WHERE account_subtype IN ('UndepositedFunds', 'Checking', 'Savings', 'CashOnHand')
        AND deactivated_at IS NULL
        AND is_postable = true
        AND operating_company_id = $1::uuid
      ORDER BY updated_at DESC
      LIMIT 1
    `,
    [operatingCompanyId]
  );
  if (cashLike.rows[0]?.id) return { account_id: cashLike.rows[0].id, source: "account_subtype:cash_like" };

  throw new Error("Cash credit account mapping is missing for company-direct fuel posting");
}

async function resolveExistingPostedResult(
  client: DbClient,
  operatingCompanyId: string,
  idempotencyKey: string
): Promise<FuelPostingResult | null> {
  const existingBatch = await client.query<{ id: string; batch_status: string }>(
    `
      SELECT id::text, batch_status::text
      FROM accounting.posting_batches
      WHERE operating_company_id = $1::uuid
        AND idempotency_key = $2
      LIMIT 1
    `,
    [operatingCompanyId, idempotencyKey]
  );
  const batch = existingBatch.rows[0];
  if (!batch || batch.batch_status !== "posted") return null;

  const postingRows = await client.query<{ posting_id: string; journal_entry_uuid: string }>(
    `
      SELECT id::text AS posting_id, journal_entry_uuid::text
      FROM accounting.journal_entry_postings
      WHERE operating_company_id = $1::uuid
        AND posting_batch_id = $2::uuid
      ORDER BY line_sequence ASC, created_at ASC
    `,
    [operatingCompanyId, batch.id]
  );
  const postingIds = postingRows.rows.map((row) => row.posting_id);
  const journalEntryId = postingRows.rows[0]?.journal_entry_uuid;
  if (!journalEntryId || postingIds.length === 0) return null;

  return {
    result: "already_posted",
    posting_batch_id: batch.id,
    journal_entry_id: journalEntryId,
    journal_entry_posting_ids: postingIds,
    idempotency_key: idempotencyKey,
    account_resolution_trace: [],
  };
}

export async function postFuelExpenseFromEvent(input: FuelPostingInput): Promise<FuelPostingResult> {
  const fuelKind = normalizeFuelKind(input.fuel_kind);
  const postingDate = input.posted_at.slice(0, 10);
  if (!postingDate) throw new Error("posted_at is required for fuel posting");
  const amountCents = Math.round(Number(input.amount_cents ?? 0));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("Fuel posting amount_cents must be > 0");
  }

  const idempotencyKey = buildFuelIdempotencyKey(input);
  const expense = await resolveAccountForCategory(input.operating_company_id, "fuel", fuelKind);

  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    const existing = await resolveExistingPostedResult(client, input.operating_company_id, idempotencyKey);
    if (existing) return existing;
    await ensureOpenPeriod(client, input.operating_company_id, postingDate);

    let creditAccountId = "";
    let creditResolutionSource = "";
    if (input.posting_path === "driver_advance") {
      creditAccountId = await resolveFuelAdvanceLiabilityAccount(client, input.operating_company_id);
      creditResolutionSource = "driver_advance_liability_account";
    } else {
      const companyDirect = await resolveCompanyDirectCreditAccount(client, input.operating_company_id, input.company_direct_credit ?? "cash");
      creditAccountId = companyDirect.account_id;
      creditResolutionSource = companyDirect.source;
    }

    const accountResolutionTrace: Array<Record<string, unknown>> = [
      {
        fuel_event_id: input.fuel_event_id,
        fuel_kind: fuelKind,
        fuel_expense_account_id: expense.account_id,
        fuel_expense_resolution: "expense_category_map",
        credit_account_id: creditAccountId,
        credit_resolution: creditResolutionSource,
        posting_path: input.posting_path,
        ifta_state: input.ifta_state ?? null,
        ifta_gallons: input.ifta_gallons ?? null,
      },
    ];

    const batchInsert = await client.query<{ id: string }>(
      `
        INSERT INTO accounting.posting_batches (
          operating_company_id,
          batch_status,
          source_transaction_type,
          source_transaction_id,
          idempotency_key,
          created_by_user_id,
          created_at,
          updated_at
        )
        VALUES ($1::uuid, 'in_progress', 'fuel_event', $2, $3, $4::uuid, now(), now())
        RETURNING id::text
      `,
      [input.operating_company_id, input.fuel_event_id, idempotencyKey, input.actor_user_id]
    );
    const postingBatchId = batchInsert.rows[0]?.id;
    if (!postingBatchId) throw new Error("fuel_posting_batch_create_failed");

    const label = `Fuel event ${input.fuel_event_id}`;
    const memo = input.memo?.trim() || `${label} (${fuelKind}) posting`;
    const journalInsert = await client.query<{ id: string }>(
      `
        INSERT INTO accounting.journal_entries (
          operating_company_id,
          entry_date,
          memo,
          status,
          source,
          created_by_user_id,
          qbo_sync_pending,
          created_at,
          updated_at
        )
        VALUES ($1::uuid, $2::date, $3, 'posted', 'auto', $4::uuid, true, now(), now())
        RETURNING id::text
      `,
      [input.operating_company_id, postingDate, memo, input.actor_user_id]
    );
    const journalEntryId = journalInsert.rows[0]?.id;
    if (!journalEntryId) throw new Error("fuel_journal_entry_create_failed");

    const postingIds: string[] = [];
    const lineValues: Array<{
      account_id: string;
      debit_or_credit: "debit" | "credit";
      amount_cents: number;
      description: string;
    }> = [
      {
        account_id: expense.account_id,
        debit_or_credit: "debit",
        amount_cents: amountCents,
        description: `${label} fuel expense`,
      },
      {
        account_id: creditAccountId,
        debit_or_credit: "credit",
        amount_cents: amountCents,
        description: input.posting_path === "driver_advance" ? `${label} driver advance liability` : `${label} company direct`,
      },
    ];

    let sequence = 1;
    for (const line of lineValues) {
      const postingInsert = await client.query<{ id: string }>(
        `
          INSERT INTO accounting.journal_entry_postings (
            operating_company_id,
            journal_entry_uuid,
            line_sequence,
            account_id,
            debit_or_credit,
            amount_cents,
            description,
            source_transaction_type,
            source_transaction_id,
            source_transaction_line_id,
            posting_batch_id,
            idempotency_key,
            created_at,
            updated_at
          )
          VALUES ($1::uuid, $2::uuid, $3, $4::uuid, $5, $6, $7, 'fuel_event', $8, NULL, $9::uuid, $10, now(), now())
          RETURNING id::text
        `,
        [
          input.operating_company_id,
          journalEntryId,
          sequence,
          line.account_id,
          line.debit_or_credit,
          line.amount_cents,
          line.description,
          input.fuel_event_id,
          postingBatchId,
          idempotencyKey,
        ]
      );
      const postingId = postingInsert.rows[0]?.id;
      if (!postingId) throw new Error("fuel_posting_line_create_failed");
      postingIds.push(postingId);

      await client.query(
        `
          INSERT INTO accounting.transaction_source_links (
            operating_company_id,
            journal_entry_posting_id,
            linked_object_type,
            linked_object_id,
            relationship_role
          )
          VALUES ($1::uuid, $2::uuid, 'fuel_event', $3, $4)
        `,
        [input.operating_company_id, postingId, input.fuel_event_id, line.debit_or_credit === "debit" ? "fuel_expense" : "fuel_offset"]
      );
      sequence += 1;
    }

    await client.query(
      `
        UPDATE accounting.posting_batches
        SET batch_status = 'posted',
            updated_at = now()
        WHERE id = $1::uuid
      `,
      [postingBatchId]
    );

    return {
      result: "posted",
      posting_batch_id: postingBatchId,
      journal_entry_id: journalEntryId,
      journal_entry_posting_ids: postingIds,
      idempotency_key: idempotencyKey,
      account_resolution_trace: accountResolutionTrace,
    };
  });
}

export async function getFuelAdvancesOutstandingForDriver(
  operating_company_id: string,
  driver_id: string
): Promise<{ advances: OutstandingFuelAdvance[]; total_outstanding_cents: number }> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [operating_company_id]);
    const rows = await client.query<{
      advance_id: string;
      liability_id: string;
      display_id: string | null;
      created_at: string;
      original_amount: string;
      current_balance: string;
    }>(
      `
        SELECT
          a.id::text AS advance_id,
          l.id::text AS liability_id,
          a.display_id::text,
          a.created_at::text,
          l.original_amount::text,
          l.current_balance::text
        FROM driver_finance.driver_advances a
        JOIN driver_finance.driver_liabilities l ON l.id = a.liability_id
        WHERE a.operating_company_id = $1::uuid
          AND a.driver_id = $2::uuid
          AND lower(a.purpose) = 'fuel_deposit'
          AND COALESCE(a.disbursement_status, '') <> 'reversed'
          AND COALESCE(l.current_balance, 0) > 0
        ORDER BY a.created_at DESC
      `,
      [operating_company_id, driver_id]
    );

    const advances = rows.rows.map((row) => ({
      advance_id: row.advance_id,
      liability_id: row.liability_id,
      display_id: row.display_id,
      created_at: row.created_at,
      original_amount_cents: Math.round(Number(row.original_amount ?? 0) * 100),
      outstanding_balance_cents: Math.round(Number(row.current_balance ?? 0) * 100),
    }));
    const total_outstanding_cents = advances.reduce((sum, row) => sum + row.outstanding_balance_cents, 0);
    return { advances, total_outstanding_cents };
  });
}
