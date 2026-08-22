/**
 * Relay Fuel Wallet → banking.bank_transactions feed (visibility + linkage, NO GL).
 *
 * Owner 2026-07-16: Bank feed under "Relay Fuel Wallet" is the surface that shows Relay fuel
 * drawdowns (QBO Relay-Diesel bank account parity). Fuel purchases stay in fuel.* for IFTA;
 * this layer mirrors each draw onto the wallet bank account with auto-links:
 *   unit (Truck #) · trailer/reefer (prompt) · driver · load/trip · settlement
 *
 * source = 'csv_import' (allowed by bank_transactions_source_chk) + source_ref =
 *   relay_fuel:{txn_id}   → money OUT (Spent) — fuel drawdowns
 *   relay_deposit:{id}    → money IN (Received) — wallet funding deposits
 * for idempotent upsert. Does NOT post journal entries.
 */
import { createHash } from "node:crypto";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import type { DbClient } from "./db-client.type.js";
import { normalizeBankTransactionDescription } from "../../banking/transaction-ingestion.js";

export const RELAY_WALLET_SOURCE_REF_PREFIX = "relay_fuel:";
export const RELAY_DEPOSIT_SOURCE_REF_PREFIX = "relay_deposit:";
const RELAY_WALLET_FEED_AUDIT_SOURCE = "RELAY-WALLET-BANK-FEED";
/** System actor for cron/ingest paths (matches factoring-posting / auto-pay cron). */
const SYSTEM_ACTOR_ID = process.env.SYSTEM_ACTOR_USER_ID ?? "00000000-0000-4000-8000-000000000001";

export type RelayWalletFeedInput = {
  operating_company_id: string;
  transaction_id: string;
  relay_created_at: string;
  amount_cents: number;
  merchant_name: string | null;
  location_city: string | null;
  location_state: string | null;
  matched_unit_id: string | null;
  matched_unit_number: string | null;
  matched_driver_id: string | null;
  fuel_transaction_id: string | null;
  prompts: Array<{ label: string; value: string }> | null;
};

export type RelayWalletFeedResult =
  | { status: "skipped_no_wallet" }
  | { status: "skipped_zero_amount" }
  | { status: "inserted" | "updated"; bank_transaction_id: string };

export function findPromptValue(
  prompts: Array<{ label: string; value: string }> | null | undefined,
  labels: string[],
): string | null {
  if (!prompts?.length) return null;
  const wanted = new Set(labels.map((l) => l.trim().toLowerCase()));
  for (const p of prompts) {
    const label = p.label?.trim().toLowerCase() ?? "";
    if (!wanted.has(label)) continue;
    const value = p.value?.trim();
    if (value) return value;
  }
  return null;
}

export function relayWalletSourceRef(transactionId: string): string {
  return `${RELAY_WALLET_SOURCE_REF_PREFIX}${transactionId}`;
}

function computeDedupHash(parts: {
  bank_account_id: string;
  transaction_date: string;
  amount_cents: number;
  normalized_description: string;
}): string {
  const amt = Math.abs(Math.round(Number(parts.amount_cents)));
  const payload = `${parts.bank_account_id}|${parts.transaction_date}|${amt}|${parts.normalized_description}`;
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export async function resolveRelayWalletBankAccountId(
  client: DbClient,
  operatingCompanyId: string,
): Promise<string | null> {
  const res = await client.query<{ id: string }>(
    `
      SELECT ba.id::text AS id
      FROM banking.bank_accounts ba
      LEFT JOIN catalogs.accounts ca ON ca.id = ba.ledger_account_id
                                     AND ca.operating_company_id = $1::uuid
      WHERE ba.operating_company_id = $1::uuid
        AND ba.is_active = true
        AND (
          ca.system_purpose = 'relay_fuel_wallet'
          OR lower(coalesce(ba.account_name, '')) = 'relay fuel wallet'
          OR lower(coalesce(ba.display_name, '')) = 'relay fuel wallet'
        )
      ORDER BY CASE WHEN ca.system_purpose = 'relay_fuel_wallet' THEN 0 ELSE 1 END
      LIMIT 1
    `,
    [operatingCompanyId],
  );
  return res.rows[0]?.id ?? null;
}

async function resolveTrailerId(
  client: DbClient,
  operatingCompanyId: string,
  trailerNumber: string | null,
): Promise<string | null> {
  if (!trailerNumber) return null;
  const res = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM mdata.equipment
      WHERE (owner_company_id = $1::uuid OR currently_leased_to_company_id = $1::uuid)
        AND upper(replace(equipment_number, ' ', '')) = upper(replace($2, ' ', ''))
        AND deactivated_at IS NULL
      LIMIT 1
    `,
    [operatingCompanyId, trailerNumber],
  );
  return res.rows[0]?.id ?? null;
}

async function resolveDriverFallbackFromUnit(
  client: DbClient,
  operatingCompanyId: string,
  unitId: string | null,
): Promise<string | null> {
  if (!unitId) return null;
  const res = await client.query<{ id: string }>(
    `
      SELECT assigned_driver_id::text AS id
      FROM mdata.units
      WHERE id = $1::uuid
        AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
        AND assigned_driver_id IS NOT NULL
      LIMIT 1
    `,
    [unitId, operatingCompanyId],
  );
  return res.rows[0]?.id ?? null;
}

async function resolveLoadForUnitAt(
  client: DbClient,
  operatingCompanyId: string,
  unitId: string | null,
  atIso: string,
): Promise<{ load_id: string; load_number: string | null; driver_id: string | null } | null> {
  if (!unitId) return null;
  const res = await client.query<{
    load_id: string;
    load_number: string | null;
    driver_id: string | null;
  }>(
    `
      SELECT
        l.id::text AS load_id,
        l.load_number,
        l.assigned_primary_driver_id::text AS driver_id
      FROM mdata.loads l
      WHERE l.operating_company_id = $1::uuid
        AND l.assigned_unit_id = $2::uuid
        -- Cast to text BEFORE coalesce: coalesce(enum, '') is typed as the enum and 22P02's on ''
        -- (empty string is not a valid mdata.load_status_enum). That aborted every wallet upsert
        -- whenever a fuel txn had a matched unit — leaving Banking → Relay Fuel Wallet empty.
        AND coalesce(l.status::text, '') NOT IN ('cancelled', 'canceled', 'void', 'voided')
        AND l.created_at <= ($3::timestamptz + interval '1 day')
        AND (
          l.status IN ('draft', 'booked', 'planned', 'dispatched', 'in_transit', 'at_pickup', 'at_delivery', 'delivered')
          OR l.updated_at >= ($3::timestamptz - interval '21 days')
        )
      ORDER BY
        CASE
          WHEN l.status IN ('in_transit', 'dispatched', 'at_pickup', 'at_delivery') THEN 0
          WHEN l.status IN ('delivered') THEN 1
          ELSE 2
        END,
        l.updated_at DESC NULLS LAST
      LIMIT 1
    `,
    [operatingCompanyId, unitId, atIso],
  );
  return res.rows[0] ?? null;
}

async function resolveSettlementForLoadOrDriver(
  client: DbClient,
  operatingCompanyId: string,
  loadId: string | null,
  driverId: string | null,
  atIso: string,
): Promise<string | null> {
  if (loadId) {
    const byLoad = await client.query<{ id: string }>(
      `
        SELECT ds.id::text AS id
        FROM driver_finance.settlement_lines sl
        -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): sl is scoped by the WHERE below, but the
        -- settlement it resolves to a real bank-feed match was not -- same class as the invoice
        -- mislabel this rule exists to catch, here on the money-matching path.
        JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
                                                  AND ds.operating_company_id = sl.operating_company_id
        WHERE sl.operating_company_id = $1::uuid
          AND sl.load_id = $2::uuid
          AND coalesce(sl.is_active, true) = true
          AND ds.reversed_at IS NULL
        ORDER BY ds.created_at DESC
        LIMIT 1
      `,
      [operatingCompanyId, loadId],
    );
    if (byLoad.rows[0]?.id) return byLoad.rows[0].id;
  }
  if (!driverId) return null;
  const byDriver = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM driver_finance.driver_settlements
      WHERE operating_company_id = $1::uuid
        AND driver_id = $2::uuid
        AND reversed_at IS NULL
        AND period_start::date <= ($3::timestamptz)::date
        AND period_end::date >= ($3::timestamptz)::date
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [operatingCompanyId, driverId, atIso],
  );
  return byDriver.rows[0]?.id ?? null;
}

async function emitRelayWalletFeedAudit(
  client: DbClient,
  status: "inserted" | "updated",
  payload: {
    bank_transaction_id: string;
    operating_company_id: string;
    bank_account_id: string;
    source_ref: string;
    relay_transaction_id: string;
    amount_cents: number;
    matched_unit_id: string | null;
    matched_driver_id: string | null;
    matched_load_id: string | null;
    matched_settlement_id: string | null;
  },
): Promise<void> {
  await appendCrudAudit(
    client,
    SYSTEM_ACTOR_ID,
    status === "inserted" ? "banking.transaction.imported" : "banking.transaction.updated",
    {
      source: "relay_wallet_bank_feed",
      resource_type: "banking.bank_transactions",
      resource_id: payload.bank_transaction_id,
      operating_company_id: payload.operating_company_id,
      bank_account_id: payload.bank_account_id,
      source_ref: payload.source_ref,
      relay_transaction_id: payload.relay_transaction_id,
      amount_cents: payload.amount_cents,
      matched_unit_id: payload.matched_unit_id,
      matched_driver_id: payload.matched_driver_id,
      matched_load_id: payload.matched_load_id,
      matched_settlement_id: payload.matched_settlement_id,
    },
    "info",
    RELAY_WALLET_FEED_AUDIT_SOURCE,
  );
}

/**
 * Upsert one wallet bank-feed row for a Relay fuel purchase. Idempotent on source_ref.
 */
export async function upsertRelayWalletBankFeedRow(
  client: DbClient,
  input: RelayWalletFeedInput,
): Promise<RelayWalletFeedResult> {
  if (!Number.isFinite(input.amount_cents) || input.amount_cents <= 0) {
    return { status: "skipped_zero_amount" };
  }

  const walletAccountId = await resolveRelayWalletBankAccountId(client, input.operating_company_id);
  if (!walletAccountId) return { status: "skipped_no_wallet" };

  const trailerNumber = findPromptValue(input.prompts, [
    "Trailer #",
    "Trailer",
    "Reefer #",
    "Reefer",
    "Trailer Number",
  ]);
  const trailerId = await resolveTrailerId(client, input.operating_company_id, trailerNumber);

  let driverId = input.matched_driver_id;
  if (!driverId) {
    driverId = await resolveDriverFallbackFromUnit(
      client,
      input.operating_company_id,
      input.matched_unit_id,
    );
  }

  const loadHit = await resolveLoadForUnitAt(
    client,
    input.operating_company_id,
    input.matched_unit_id,
    input.relay_created_at,
  );
  if (!driverId && loadHit?.driver_id) driverId = loadHit.driver_id;

  const loadId = loadHit?.load_id ?? null;
  const settlementId = await resolveSettlementForLoadOrDriver(
    client,
    input.operating_company_id,
    loadId,
    driverId,
    input.relay_created_at,
  );

  const txnDate = input.relay_created_at.slice(0, 10);
  const unitLabel = input.matched_unit_number ?? "unassigned";
  const place = [input.location_city, input.location_state].filter(Boolean).join(", ");
  const description = [
    "Relay fuel",
    unitLabel,
    input.merchant_name,
    place || null,
    input.transaction_id,
  ]
    .filter(Boolean)
    .join(" · ");

  const normalized = normalizeBankTransactionDescription(description);
  const dedupHash = computeDedupHash({
    bank_account_id: walletAccountId,
    transaction_date: txnDate,
    amount_cents: input.amount_cents,
    normalized_description: normalized,
  });
  const sourceRef = relayWalletSourceRef(input.transaction_id);
  const notes = [
    `relay_wallet_feed=1`,
    `relay_txn=${input.transaction_id}`,
    input.fuel_transaction_id ? `fuel_txn=${input.fuel_transaction_id}` : null,
    trailerNumber ? `trailer_prompt=${trailerNumber}` : null,
  ]
    .filter(Boolean)
    .join("; ");

  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid
        AND source_ref = $2
      LIMIT 1
    `,
    [input.operating_company_id, sourceRef],
  );

  if (existing.rows[0]?.id) {
    const id = existing.rows[0].id;
    await client.query(
      `
        UPDATE banking.bank_transactions
        SET
          bank_account_id = $2::uuid,
          transaction_date = $3::date,
          posted_date = $3::date,
          amount_cents = $4,
          description = $5,
          merchant_name = $6,
          normalized_description = $7,
          dedup_hash = $8,
          notes = $9,
          categorization_unit_id = COALESCE($10::uuid, categorization_unit_id),
          categorization_driver_id = COALESCE($11::uuid, categorization_driver_id),
          categorization_trailer_id = COALESCE($12::uuid, categorization_trailer_id),
          categorization_load_id = COALESCE($13::uuid, categorization_load_id),
          matched_load_id = COALESCE($13::uuid, matched_load_id),
          matched_settlement_id = COALESCE($14::uuid, matched_settlement_id),
          updated_at = now()
        WHERE id = $1::uuid
      `,
      [
        id,
        walletAccountId,
        txnDate,
        input.amount_cents,
        description,
        input.merchant_name,
        normalized,
        dedupHash,
        notes,
        input.matched_unit_id,
        driverId,
        trailerId,
        loadId,
        settlementId,
      ],
    );
    await emitRelayWalletFeedAudit(client, "updated", {
      bank_transaction_id: id,
      operating_company_id: input.operating_company_id,
      bank_account_id: walletAccountId,
      source_ref: sourceRef,
      relay_transaction_id: input.transaction_id,
      amount_cents: input.amount_cents,
      matched_unit_id: input.matched_unit_id,
      matched_driver_id: driverId,
      matched_load_id: loadId,
      matched_settlement_id: settlementId,
    });
    return { status: "updated", bank_transaction_id: id };
  }

  const inserted = await client.query<{ id: string }>(
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
        notes,
        normalized_description,
        source,
        source_ref,
        dedup_hash,
        review_state,
        status,
        categorization_unit_id,
        categorization_driver_id,
        categorization_trailer_id,
        categorization_load_id,
        matched_load_id,
        matched_settlement_id,
        created_at,
        updated_at
      )
      VALUES (
        $1::uuid, $2::uuid, NULL, $3::date, $3::date, $4, $5, $6, '{}'::text[], false, false,
        $7, $8, 'csv_import', $9, $10, 'for_review', 'pending_categorization',
        $11::uuid, $12::uuid, $13::uuid, $14::uuid, $14::uuid, $15::uuid,
        now(), now()
      )
      -- Partial unique uq_bank_transactions_account_dedup requires the same WHERE on ON CONFLICT
      -- (mig 202609010050/051). Bare ON CONFLICT fails: "no unique or exclusion constraint matching…".
      ON CONFLICT (bank_account_id, dedup_hash)
        WHERE dedup_hash IS NOT NULL AND voided_at IS NULL
        DO UPDATE SET
        source_ref = EXCLUDED.source_ref,
        description = EXCLUDED.description,
        merchant_name = EXCLUDED.merchant_name,
        notes = EXCLUDED.notes,
        categorization_unit_id = COALESCE(EXCLUDED.categorization_unit_id, banking.bank_transactions.categorization_unit_id),
        categorization_driver_id = COALESCE(EXCLUDED.categorization_driver_id, banking.bank_transactions.categorization_driver_id),
        categorization_trailer_id = COALESCE(EXCLUDED.categorization_trailer_id, banking.bank_transactions.categorization_trailer_id),
        categorization_load_id = COALESCE(EXCLUDED.categorization_load_id, banking.bank_transactions.categorization_load_id),
        matched_load_id = COALESCE(EXCLUDED.matched_load_id, banking.bank_transactions.matched_load_id),
        matched_settlement_id = COALESCE(EXCLUDED.matched_settlement_id, banking.bank_transactions.matched_settlement_id),
        updated_at = now()
      RETURNING id::text AS id
    `,
    [
      walletAccountId,
      input.operating_company_id,
      txnDate,
      input.amount_cents,
      description,
      input.merchant_name,
      notes,
      normalized,
      sourceRef,
      dedupHash,
      input.matched_unit_id,
      driverId,
      trailerId,
      loadId,
      settlementId,
    ],
  );

  const id = inserted.rows[0]?.id;
  if (!id) throw new Error(`relay_wallet_bank_feed: insert returned no id for ${input.transaction_id}`);
  await emitRelayWalletFeedAudit(client, "inserted", {
    bank_transaction_id: id,
    operating_company_id: input.operating_company_id,
    bank_account_id: walletAccountId,
    source_ref: sourceRef,
    relay_transaction_id: input.transaction_id,
    amount_cents: input.amount_cents,
    matched_unit_id: input.matched_unit_id,
    matched_driver_id: driverId,
    matched_load_id: loadId,
    matched_settlement_id: settlementId,
  });
  return { status: "inserted", bank_transaction_id: id };
}

/**
 * Backfill wallet feed from already-ingested integrations.relay_fuel_transactions for one company.
 */
export async function backfillRelayWalletBankFeedForCompany(
  client: DbClient,
  operatingCompanyId: string,
): Promise<{ inserted: number; updated: number; skipped: number; failed: number }> {
  const rows = await client.query<{
    transaction_id: string;
    relay_created_at: string;
    total_amount_paid_cents: string;
    merchant_name: string | null;
    location_city: string | null;
    location_state: string | null;
    matched_unit_id: string | null;
    matched_unit_number: string | null;
    matched_driver_id: string | null;
    prompts: unknown;
    fuel_transaction_id: string | null;
  }>(
    `
      SELECT
        r.transaction_id,
        r.relay_created_at::text AS relay_created_at,
        r.total_amount_paid_cents::text AS total_amount_paid_cents,
        r.merchant_name,
        r.location_city,
        r.location_state,
        r.matched_unit_id::text AS matched_unit_id,
        r.matched_unit_number,
        r.matched_driver_id::text AS matched_driver_id,
        r.prompts,
        ft.id::text AS fuel_transaction_id
      FROM integrations.relay_fuel_transactions r
      LEFT JOIN fuel.fuel_transactions ft
        ON ft.operating_company_id = r.operating_company_id
       AND ft.transaction_reference = r.transaction_id
      WHERE r.operating_company_id = $1::uuid
        AND r.is_active = true
        AND r.voided_at IS NULL
      ORDER BY r.relay_created_at ASC
    `,
    [operatingCompanyId],
  );

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows.rows) {
    const prompts = Array.isArray(row.prompts)
      ? (row.prompts as Array<{ label: string; value: string }>)
      : null;
    // Per-row savepoint: one bad linkage query must not abort the remaining ~1.4k mirrors.
    await client.query("SAVEPOINT relay_wallet_feed_row");
    try {
      const result = await upsertRelayWalletBankFeedRow(client, {
        operating_company_id: operatingCompanyId,
        transaction_id: row.transaction_id,
        relay_created_at: row.relay_created_at,
        amount_cents: Number(row.total_amount_paid_cents),
        merchant_name: row.merchant_name,
        location_city: row.location_city,
        location_state: row.location_state,
        matched_unit_id: row.matched_unit_id,
        matched_unit_number: row.matched_unit_number,
        matched_driver_id: row.matched_driver_id,
        fuel_transaction_id: row.fuel_transaction_id,
        prompts,
      });
      await client.query("RELEASE SAVEPOINT relay_wallet_feed_row");
      if (result.status === "inserted") inserted += 1;
      else if (result.status === "updated") updated += 1;
      else skipped += 1;
    } catch {
      await client.query("ROLLBACK TO SAVEPOINT relay_wallet_feed_row");
      failed += 1;
    }
  }

  return { inserted, updated, skipped, failed };
}

export function relayDepositSourceRef(depositId: string): string {
  return `${RELAY_DEPOSIT_SOURCE_REF_PREFIX}${depositId}`;
}

/**
 * Mirror a Relay wallet funding deposit as a credit (Received) on the Relay Fuel Wallet bank feed.
 * QBO parity: deposits show in Received, fuel draws in Spent. No GL.
 */
export async function upsertRelayWalletDepositFeedRow(
  client: DbClient,
  input: {
    operating_company_id: string;
    deposit_id: string;
    relay_created_at: string;
    amount_cents: number;
    note: string | null;
    classification: string | null;
    funding_card_last4: string | null;
  },
): Promise<RelayWalletFeedResult> {
  if (!Number.isFinite(input.amount_cents) || input.amount_cents <= 0) {
    return { status: "skipped_zero_amount" };
  }
  // Canceled / declined deposits must not appear as Received cash on the wallet.
  const statusish = (input.classification ?? "").toLowerCase();
  if (statusish === "canceled" || statusish === "cancelled" || statusish === "declined") {
    return { status: "skipped_zero_amount" };
  }

  const walletAccountId = await resolveRelayWalletBankAccountId(client, input.operating_company_id);
  if (!walletAccountId) return { status: "skipped_no_wallet" };

  const txnDate = input.relay_created_at.slice(0, 10);
  const card = input.funding_card_last4 ? `card …${input.funding_card_last4}` : null;
  const classLabel = input.classification ? `class=${input.classification}` : null;
  const description = ["Relay deposit", card, input.note?.trim() || null, input.deposit_id]
    .filter(Boolean)
    .join(" · ");
  const normalized = normalizeBankTransactionDescription(description);
  const dedupHash = computeDedupHash({
    bank_account_id: walletAccountId,
    transaction_date: txnDate,
    amount_cents: input.amount_cents,
    normalized_description: normalized,
  });
  const sourceRef = relayDepositSourceRef(input.deposit_id);
  const notes = [`relay_wallet_deposit=1`, `relay_deposit=${input.deposit_id}`, classLabel]
    .filter(Boolean)
    .join("; ");

  const existing = await client.query<{ id: string }>(
    `
      SELECT id::text AS id
      FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid
        AND source_ref = $2
      LIMIT 1
    `,
    [input.operating_company_id, sourceRef],
  );

  if (existing.rows[0]?.id) {
    const id = existing.rows[0].id;
    await client.query(
      `
        UPDATE banking.bank_transactions
        SET
          bank_account_id = $2::uuid,
          transaction_date = $3::date,
          posted_date = $3::date,
          amount_cents = $4,
          description = $5,
          merchant_name = 'Relay deposit',
          normalized_description = $6,
          dedup_hash = $7,
          notes = $8,
          is_credit = true,
          updated_at = now()
        WHERE id = $1::uuid
      `,
      [id, walletAccountId, txnDate, input.amount_cents, description, normalized, dedupHash, notes],
    );
    return { status: "updated", bank_transaction_id: id };
  }

  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO banking.bank_transactions (
        bank_account_id, operating_company_id, plaid_transaction_id,
        transaction_date, posted_date, amount_cents, description, merchant_name,
        plaid_category, pending, is_credit, notes, normalized_description,
        source, source_ref, dedup_hash, review_state, status, created_at, updated_at
      )
      VALUES (
        $1::uuid, $2::uuid, NULL, $3::date, $3::date, $4, $5, 'Relay deposit',
        '{}'::text[], false, true, $6, $7, 'csv_import', $8, $9, 'for_review', 'pending_categorization',
        now(), now()
      )
      ON CONFLICT (bank_account_id, dedup_hash)
        WHERE dedup_hash IS NOT NULL AND voided_at IS NULL
        DO UPDATE SET
        source_ref = EXCLUDED.source_ref,
        description = EXCLUDED.description,
        is_credit = true,
        notes = EXCLUDED.notes,
        updated_at = now()
      RETURNING id::text AS id
    `,
    [
      walletAccountId,
      input.operating_company_id,
      txnDate,
      input.amount_cents,
      description,
      notes,
      normalized,
      sourceRef,
      dedupHash,
    ],
  );
  const id = inserted.rows[0]?.id;
  if (!id) throw new Error(`relay_wallet_deposit_feed: insert returned no id for ${input.deposit_id}`);
  await emitRelayWalletFeedAudit(client, "inserted", {
    bank_transaction_id: id,
    operating_company_id: input.operating_company_id,
    bank_account_id: walletAccountId,
    source_ref: sourceRef,
    relay_transaction_id: input.deposit_id,
    amount_cents: input.amount_cents,
    matched_unit_id: null,
    matched_driver_id: null,
    matched_load_id: null,
    matched_settlement_id: null,
  });
  return { status: "inserted", bank_transaction_id: id };
}

/** Backfill Received (deposit) rows from integrations.relay_deposits for one company. */
export async function backfillRelayWalletDepositFeedForCompany(
  client: DbClient,
  operatingCompanyId: string,
): Promise<{ inserted: number; updated: number; skipped: number; failed: number }> {
  const rows = await client.query<{
    deposit_id: string;
    relay_created_at: string;
    total_amount_cents: string;
    note_raw: string | null;
    classification: string | null;
    funding_card_last4: string | null;
    status: string | null;
  }>(
    `
      SELECT
        deposit_id,
        relay_created_at::text AS relay_created_at,
        total_amount_cents::text AS total_amount_cents,
        note_raw,
        classification,
        funding_card_last4,
        status
      FROM integrations.relay_deposits
      WHERE operating_company_id = $1::uuid
        AND COALESCE(is_active, true) = true
        AND voided_at IS NULL
        AND lower(COALESCE(status, '')) NOT IN ('canceled', 'cancelled', 'declined')
      ORDER BY relay_created_at ASC
    `,
    [operatingCompanyId],
  );

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows.rows) {
    await client.query("SAVEPOINT relay_wallet_deposit_row");
    try {
      const result = await upsertRelayWalletDepositFeedRow(client, {
        operating_company_id: operatingCompanyId,
        deposit_id: row.deposit_id,
        relay_created_at: row.relay_created_at,
        amount_cents: Number(row.total_amount_cents),
        note: row.note_raw,
        classification: row.classification,
        funding_card_last4: row.funding_card_last4,
      });
      await client.query("RELEASE SAVEPOINT relay_wallet_deposit_row");
      if (result.status === "inserted") inserted += 1;
      else if (result.status === "updated") updated += 1;
      else skipped += 1;
    } catch {
      await client.query("ROLLBACK TO SAVEPOINT relay_wallet_deposit_row");
      failed += 1;
    }
  }

  return { inserted, updated, skipped, failed };
}
