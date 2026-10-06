import { withLuciaBypass } from "../../auth/db.js";
import { POSTING_KIND_FUEL_TYPE, resolveFuelItem } from "./fuel-item-account.js";
import { resolveRoleAccount, resolveRoleAccountOptional } from "../coa-roles/resolver.service.js";
// ACCT-PERIOD-CLOSE-01: reuse the shared, exported ensureOpenPeriod (posting-engine.service.ts's
// own PostingEngineError("PERIOD_LOCKED", ...) class) instead of this file's own local copy, which
// had drifted: it silently swallowed a closed_period_cutoff() query failure into cutoff=null
// (fail-OPEN on error, instead of failing closed or propagating) and threw a differently-shaped
// plain Error rather than the typed PostingEngineError every other poster's callers expect.
import { ensureOpenPeriod, resolvePostingTemplateId } from "../posting-engine.service.js";
// ACCT-LINK-01 regression fix (GO-1405 Recipe B, 2026-08-29): this fuel-event JE insert never
// populated journal_entry_type_id -- one of several direct posters contributing to the live
// 46/2214 (2%) density gap. Leaf module, no accounting-service imports.
import { hasJournalEntryTypeColumn, resolveJournalEntryTypeId } from "../journal-entry-type-resolver.js";
import { insertPostingLineWithSpine } from "../posting-line-writer.js";

// ACCT-LINK-05: fuel_event is a hardcoded source_transaction_type literal outside the shared
// PostingSourceType union (fuel posting has its own poster, not the generic posting-engine). Stamp the
// same code-constant onto posting_batches so it participates in the ACCT-LINK-05 inbound FK + reverse
// drill exactly like every other source type once catalogs.posting_templates is seeded.
const FUEL_EVENT_TEMPLATE_CODE = "fuel_event";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number }>;
};

export const FUEL_CATEGORY_CODES = ["diesel", "def", "reefer", "oil", "misc"] as const;
export type FuelCategoryCode = (typeof FUEL_CATEGORY_CODES)[number];
export type FuelPostingPath = "driver_advance" | "company_direct";
// R-30.1-A (A/P control contamination fix): card-settled fuel is the GL of record for its own
// rail, never the generic A/P control account. LST-F415: the "ap" option is gone. No path selected it
// (resolveCompanyDirectCreditPreference returns a card rail, cash, or refuses), and ROUND 393.1 refuses a
// fuel_event line on ap_control at write time anyway — fuel bought on a vendor's terms is that vendor's BILL.
export type CompanyDirectCredit = "cash" | "dreamline_card_payable" | "relay_fuel_wallet";

export type FuelPostingInput = {
  operating_company_id: string;
  actor_user_id: string;
  fuel_event_id: string;
  fuel_kind: FuelCategoryCode;
  posted_at: string;
  amount_cents: number;
  posting_path: FuelPostingPath;
  driver_id?: string | null;
  /** RANK2-FUEL-JE-CLASS — tractor pulling the load at fuel-purchase time; drives the QBO Class dimension. */
  unit_id?: string | null;
  /** RANK2-FUEL-JE-CLASS — physical trailer (mdata.equipment), fuel.fuel_transactions.trailer_id. */
  trailer_id?: string | null;
  ifta_state?: string | null;
  ifta_gallons?: number | null;
  memo?: string | null;
  company_direct_credit?: CompanyDirectCredit;
  /**
   * One purchase, several products (CC-2 2026-10-04): a Relay fill itemises diesel / DEF / reefer on one ticket. When
   * given, each line is its own debit leg on its own item's account (fuel-item-account.ts), the legs must foot to
   * amount_cents exactly, and the single credit carries the total. Absent = one leg of fuel_kind, as before.
   */
  cost_lines?: Array<{ fuel_kind: FuelCategoryCode; amount_cents: number }>;
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

// ROUND 365.1 — the driver_advance path's credit account. This used to take ANY liability whose NAME matched
// '%fuel%advance%' / '%driver%advance%' / '%advance liability%', and failing that ANY "current liability" by
// `updated_at DESC` — the account a fuel posting landed in depended on a name and on which row was touched last. On
// USMCA neither guess matches (measured 2026-10-03: 0 accounts; 0 fuel_event postings have ever credited a liability),
// so this path has never posted there; it threw "mapping is missing".
//
// No role names this account and the owner has never designated one: a Relay cash advance drawn by a driver is money
// the DRIVER owes back (advance_recovery, 1245) paid out of the Relay wallet (fuel_wallet_relay, 1295) — not fuel
// expense against an unnamed liability. Choosing that treatment is an owner accounting decision, so the path now FAILS
// CLOSED by name instead of guessing; it posts nothing it did not post before.
async function resolveFuelAdvanceLiabilityAccount(_client: DbClient, operatingCompanyId: string): Promise<string> {
  throw new Error(
    "Fuel posting driver_advance path has no designated credit account for " +
      `operating_company_id=${operatingCompanyId}: it never resolves an account by name or by latest update (ROUND 365.1). ` +
      "A Relay cash advance is a driver receivable (advance_recovery) paid from the Relay wallet (fuel_wallet_relay); " +
      "that treatment needs an owner designation before this path can post."
  );
}

// R-30.1-A: resolve the fuel-card rail's OWN GL account (ROUND 365.1: by role, for both rails).
// Dreamline (2510) is billed-in-arrears (a payable); Relay (1295) is prefunded (an asset wallet).
// Fails closed (throws) rather than falling back to ap_control -- a missing rail account is a
// setup gap to report, never silently substituted.
async function resolveFuelCardRailAccount(
  client: DbClient,
  operatingCompanyId: string,
  rail: "dreamline_card_payable" | "relay_fuel_wallet"
): Promise<{ account_id: string; source: string }> {
  // ROUND 352 F-3: the Relay wallet resolves through its declared role (fuel_wallet_relay), never by account number —
  // 1295 had no role, which is how it drifted to -$33,839.80 unseen. resolveRoleAccount fails closed.
  if (rail === "relay_fuel_wallet") {
    return { account_id: await resolveRoleAccount(client, operatingCompanyId, "fuel_wallet_relay"), source: "role:fuel_wallet_relay" };
  }
  // ROUND 365.1 — Dreamline (2510 on USMCA) resolves through its role too, never by account number (202615370930).
  return {
    account_id: await resolveRoleAccount(client, operatingCompanyId, "fuel_card_payable_dreamline"),
    source: "role:fuel_card_payable_dreamline",
  };
}

/** R-153.6/153.7: exported so fuel-expense-document.service.ts's backfill/dedupe writer can resolve
 *  the SAME card-rail account this poster already uses -- one resolution path, never a second one. */
export async function resolveCompanyDirectCreditAccount(
  client: DbClient,
  operatingCompanyId: string,
  preference: CompanyDirectCredit
): Promise<{ account_id: string; source: string }> {
  if (preference === "dreamline_card_payable" || preference === "relay_fuel_wallet") {
    return resolveFuelCardRailAccount(client, operatingCompanyId, preference);
  }

  // ROUND 377 (Lead, 2026-10-03) — THIS IS WHERE 1090 WENT TO -151,736.34.
  //
  // This used to resolve the `undeposited_funds` role for the CASH credit leg, and then fall back to a
  // subtype query that listed 'UndepositedFunds' FIRST among "cash like" accounts, ordered by
  // `updated_at DESC`. Measured consequence on production: 255 fuel_event postings credited 1090 for
  // 108,602.28, against a net balance of -151,736.34 on an ASSET.
  //
  // Undeposited Funds is one thing: money a CUSTOMER has paid us that has not yet reached the bank. It
  // is a holding pen on the way IN. Buying diesel involves no customer receipt, so nothing on the way
  // OUT belongs there — a fuel credit lands in it only by mistake, and a credit to an asset that was
  // never debited is exactly how it went negative.
  //
  // Cash fuel is paid from the BANK. Resolve `operating_bank` and nothing else.
  //
  // The `cash_like` fallback is deleted outright rather than reordered. It picked an account by
  // `updated_at DESC`, which means the account a posting landed in depended on which row happened to be
  // touched most recently — a coincidence, not a mapping. A poster that cannot resolve its role FAILS
  // CLOSED and says which role is unbound (365.1: the role is the contract; ROUND 29.9-B: a money path
  // that cannot resolve is a failure, never a quiet guess).
  const operatingBank = await resolveRoleAccountOptional(client, operatingCompanyId, "operating_bank");
  if (operatingBank) return { account_id: operatingBank, source: "role_designation:operating_bank" };

  throw new Error(
    "Company-direct CASH fuel posting cannot resolve its credit account: the 'operating_bank' role is " +
      `not bound for operating_company_id=${operatingCompanyId}. Bind it in accounting.chart_of_accounts_roles. ` +
      "Undeposited Funds is never the credit for a fuel purchase (ROUND 377) — it holds customer receipts " +
      "awaiting deposit, and crediting it here is what drove 1090 to a negative balance."
  );
}

/**
 * RANK2-FUEL-JE-CLASS — QBO Class dimension by unit/trailer, going-forward only.
 *
 * Mechanism (verified live on prod, not invented): accounting.journal_entry_postings.class_id (uuid)
 * -> catalogs.classes.id, matched via catalogs.classes.qbo_class_id (text) = mdata.units.qbo_class_id
 * or mdata.equipment.qbo_class_id (text). Unit takes precedence over trailer (the tractor is the
 * primary cost-center dimension QBO classes track for a fuel purchase); trailer is the fallback when
 * only a trailer is known. Best-effort: returns null (no class tagged) rather than throwing when
 * neither resolves, an equipment/unit row carries no qbo_class_id, or no catalogs.classes row matches
 * — a fuel JE must still post and balance even when the class dimension cannot be resolved.
 */
async function resolveFuelPostingClassId(
  client: DbClient,
  operatingCompanyId: string,
  unitId?: string | null,
  trailerId?: string | null
): Promise<{ class_id: string | null; source: string }> {
  // ACCT-F5024 — mdata.units / mdata.equipment have NO operating_company_id (owner/lease only).
  // A 42703 on that column aborted the entire fuel JE while create still returned 201 (silent noop).
  // Class is a reporting dimension only: any resolution failure must return unresolved, never throw.
  try {
    const lookupByQboClassId = async (qboClassId: string): Promise<string | null> => {
      const res = await client.query<{ id: string }>(
        `
          SELECT id::text
          FROM catalogs.classes
          WHERE operating_company_id = $1::uuid
            AND qbo_class_id = $2
            AND deactivated_at IS NULL
          LIMIT 1
        `,
        [operatingCompanyId, qboClassId]
      );
      return res.rows[0]?.id ?? null;
    };

    if (unitId) {
      const unit = await client.query<{ qbo_class_id: string | null }>(
        `
          SELECT qbo_class_id
          FROM mdata.units
          WHERE id = $1::uuid
            AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
          LIMIT 1
        `,
        [unitId, operatingCompanyId]
      );
      const qboClassId = unit.rows[0]?.qbo_class_id;
      if (qboClassId) {
        const classId = await lookupByQboClassId(qboClassId);
        if (classId) return { class_id: classId, source: "unit.qbo_class_id" };
      }
    }

    if (trailerId) {
      const equipment = await client.query<{ qbo_class_id: string | null }>(
        `
          SELECT qbo_class_id
          FROM mdata.equipment
          WHERE id = $1::uuid
            AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
          LIMIT 1
        `,
        [trailerId, operatingCompanyId]
      );
      const qboClassId = equipment.rows[0]?.qbo_class_id;
      if (qboClassId) {
        const classId = await lookupByQboClassId(qboClassId);
        if (classId) return { class_id: classId, source: "trailer.qbo_class_id" };
      }
    }

    return { class_id: null, source: "unresolved" };
  } catch {
    return { class_id: null, source: "unresolved" };
  }
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

/**
 * The fuel-expense poster on the CALLER's client (OWNER RULING 2026-10-02: fuel cards are bank accounts; a fill posts
 * when its card bank line is MATCHED in Banking, and the entry is written in the same transaction as that match). The
 * bank-match engine calls this inside its transaction; idempotent by the fuel event's posting key.
 */
export async function postFuelExpenseOnClient(client: DbClient, input: FuelPostingInput): Promise<FuelPostingResult> {
  const fuelKind = normalizeFuelKind(input.fuel_kind);
  const postingDate = input.posted_at.slice(0, 10);
  if (!postingDate) throw new Error("posted_at is required for fuel posting");
  const amountCents = Math.round(Number(input.amount_cents ?? 0));
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("Fuel posting amount_cents must be > 0");
  }

  const idempotencyKey = buildFuelIdempotencyKey(input);
  // The cost account is the fuel-type ITEM's account — the same rule the expense document uses (fuel-item-account.ts),
  // never accounting.expense_category_account_map, whose DEF and reefer rows said 5000 while the items say 5010 / 5015.
  const fuelItem = await resolveFuelItem(client as never, input.operating_company_id, POSTING_KIND_FUEL_TYPE[fuelKind] ?? null);
  if ("refused" in fuelItem) throw new Error(`fuel_posting_account_refused: ${fuelItem.refused}`);
  const expense = { account_id: fuelItem.expenseAccountId, item_id: fuelItem.itemId };
  // Debit legs: one per product line when the purchase is itemised, else the one fuel_kind leg. Each leg's account is its
  // own item's; the legs must foot to the total exactly — never a plug, never a guess.
  const costLines = input.cost_lines?.length ? input.cost_lines : [{ fuel_kind: fuelKind, amount_cents: amountCents }];
  const debitLegs: Array<{ fuel_kind: FuelCategoryCode; amount_cents: number; account_id: string; item_id: string }> = [];
  for (const cl of costLines) {
    const kind = normalizeFuelKind(cl.fuel_kind);
    const cents = Math.round(Number(cl.amount_cents));
    if (!Number.isFinite(cents) || cents <= 0) throw new Error(`fuel_posting_cost_line_invalid: ${kind} ${cl.amount_cents}`);
    const item = kind === fuelKind ? fuelItem : await resolveFuelItem(client as never, input.operating_company_id, POSTING_KIND_FUEL_TYPE[kind] ?? null);
    if ("refused" in item) throw new Error(`fuel_posting_account_refused: ${item.refused}`);
    debitLegs.push({ fuel_kind: kind, amount_cents: cents, account_id: item.expenseAccountId, item_id: item.itemId });
  }
  const legsTotal = debitLegs.reduce((t, l) => t + l.amount_cents, 0);
  if (legsTotal !== amountCents) throw new Error(`fuel_posting_cost_lines_do_not_foot: lines ${legsTotal} != total ${amountCents}`);

  const existing = await resolveExistingPostedResult(client, input.operating_company_id, idempotencyKey);
  if (existing) return existing;
  await ensureOpenPeriod(client, input.operating_company_id, postingDate);

  let creditAccountId = "";
  let creditResolutionSource = "";
  if (input.posting_path === "driver_advance") {
    creditAccountId = await resolveFuelAdvanceLiabilityAccount(client, input.operating_company_id);
    creditResolutionSource = "driver_advance_liability_account";
  } else {
    // ACCT-F403: a fuel_event that is a fuel.fuel_transactions row resolves its rail through the one resolver — never a
    // silent "cash" default. A Relay-rail settlement row is refused there (it links to its Relay fill; the fill posts).
    // A Relay fill itself (fuel_event = integrations.relay_fuel_transactions id) always arrives with its rail named.
    let credit = input.company_direct_credit;
    if (!credit) {
      const isFuelRow = await client.query(
        `SELECT 1 FROM fuel.fuel_transactions WHERE id::text = $1 AND operating_company_id = $2::uuid LIMIT 1`,
        [input.fuel_event_id, input.operating_company_id]
      );
      if (isFuelRow.rows.length) {
        const { loadFuelTxnCreditSignals, resolveCompanyDirectCreditPreference } = await import("./maybe-post-from-fuel-transaction.service.js");
        const signals = await loadFuelTxnCreditSignals(client as never, input.operating_company_id, input.fuel_event_id);
        credit = resolveCompanyDirectCreditPreference(
          {
            operating_company_id: input.operating_company_id,
            fuel_transaction_id: input.fuel_event_id,
            fuel_type: input.fuel_kind,
            transaction_at: input.posted_at,
            amount_cents: input.amount_cents,
          } as never,
          signals
        );
      }
    }
    const companyDirect = await resolveCompanyDirectCreditAccount(client, input.operating_company_id, credit ?? "cash");
    creditAccountId = companyDirect.account_id;
    creditResolutionSource = companyDirect.source;
  }

  const classResolution = await resolveFuelPostingClassId(client, input.operating_company_id, input.unit_id, input.trailer_id);

  const accountResolutionTrace: Array<Record<string, unknown>> = [
    {
      fuel_event_id: input.fuel_event_id,
      fuel_kind: fuelKind,
      fuel_expense_account_id: expense.account_id,
      fuel_expense_resolution: "fuel_type_item",
      fuel_item_id: expense.item_id,
      cost_lines: debitLegs.map((l) => ({ fuel_kind: l.fuel_kind, amount_cents: l.amount_cents, account_id: l.account_id, item_id: l.item_id })),
      credit_account_id: creditAccountId,
      credit_resolution: creditResolutionSource,
      posting_path: input.posting_path,
      ifta_state: input.ifta_state ?? null,
      ifta_gallons: input.ifta_gallons ?? null,
      class_id: classResolution.class_id,
      class_resolution: classResolution.source,
    },
  ];

  const postingTemplateId = await resolvePostingTemplateId(
    client,
    FUEL_EVENT_TEMPLATE_CODE,
    input.operating_company_id
  );
  const batchInsert = await client.query<{ id: string }>(
    `
      INSERT INTO accounting.posting_batches (
        operating_company_id,
        batch_status,
        source_transaction_type,
        source_transaction_id,
        idempotency_key,
        created_by_user_id,
        posting_template_id,
        source_template_code,
        created_at,
        updated_at
      )
      VALUES ($1::uuid, 'in_progress', 'fuel_event', $2, $3, $4::uuid, $5::uuid, $6, now(), now())
      RETURNING id::text
    `,
    [input.operating_company_id, input.fuel_event_id, idempotencyKey, input.actor_user_id, postingTemplateId, FUEL_EVENT_TEMPLATE_CODE]
  );
  const postingBatchId = batchInsert.rows[0]?.id;
  if (!postingBatchId) throw new Error("fuel_posting_batch_create_failed");

  // E14.2 — never default to "Fuel event <uuid>" (bare_uuid_only vs verify-je-memo-is-human-readable).
  // Prefer caller memo when it already carries a human id; else a short kind+path label (no UUID).
  const callerMemo = input.memo?.trim() || "";
  const memo =
    callerMemo && !/^[0-9a-f-]{36}$/i.test(callerMemo) && !/Fuel (?:event|txn) [0-9a-f-]{36}/i.test(callerMemo)
      ? callerMemo.slice(0, 200)
      : `Fuel ${input.posting_path.replace(/_/g, " ")} (${fuelKind})`.slice(0, 200);
  const fuelTypeColPresent = await hasJournalEntryTypeColumn(client);
  const fuelTypeId = fuelTypeColPresent
    ? await resolveJournalEntryTypeId(client, { source: "auto", memo })
    : null;
  const journalInsert = fuelTypeColPresent
    ? await client.query<{ id: string }>(
        `
      INSERT INTO accounting.journal_entries (
        operating_company_id,
        entry_date,
        memo,
        status,
        source,
        journal_entry_type_id,
        created_by_user_id,
        qbo_sync_pending,
        created_at,
        updated_at,
        -- ACCT-F353 stage 2 — fuel.fuel_transactions/fuel_events carry no is_sample_data; explicit
        -- false, matching ACCT-F212's policy (posting-engine.service.ts) rather than guessing.
        is_sample_data
      )
      VALUES ($1::uuid, $2::date, $3, 'posted', 'auto', $4::uuid, $5::uuid, true, now(), now(), false)
      RETURNING id::text
    `,
        [input.operating_company_id, postingDate, memo, fuelTypeId, input.actor_user_id]
      )
    : await client.query<{ id: string }>(
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
        updated_at,
        is_sample_data
      )
      VALUES ($1::uuid, $2::date, $3, 'posted', 'auto', $4::uuid, true, now(), now(), false)
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
    ...debitLegs.map((leg) => ({
      account_id: leg.account_id,
      debit_or_credit: "debit" as const,
      amount_cents: leg.amount_cents,
      description: (debitLegs.length > 1 ? `${memo} · ${leg.fuel_kind} expense` : `${memo} · fuel expense`).slice(0, 200),
    })),
    {
      account_id: creditAccountId,
      debit_or_credit: "credit",
      amount_cents: amountCents,
      description: (
        input.posting_path === "driver_advance"
          ? `${memo} · driver advance liability`
          : `${memo} · company direct`
      ).slice(0, 200),
    },
  ];

  let sequence = 1;
  for (const line of lineValues) {
    // ROUND 393.2 — the one posting-line writer: the line and its spine row (fuel_event, fuel_expense / fuel_offset)
    // together, exactly as this poster wrote them by hand before.
    const postingId = await insertPostingLineWithSpine(client, {
      operating_company_id: input.operating_company_id,
      journal_entry_uuid: journalEntryId,
      line_sequence: sequence,
      account_id: line.account_id,
      debit_or_credit: line.debit_or_credit,
      amount_cents: line.amount_cents,
      description: line.description,
      source_transaction_type: "fuel_event",
      source_transaction_id: input.fuel_event_id,
      posting_batch_id: postingBatchId,
      idempotency_key: idempotencyKey,
      class_id: classResolution.class_id,
      relationship_role: line.debit_or_credit === "debit" ? "fuel_expense" : "fuel_offset",
    });
    postingIds.push(postingId);

    sequence += 1;
  }

  await client.query(
    `
      UPDATE accounting.posting_batches
      SET batch_status = 'posted',
          updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
    `,
    [postingBatchId, input.operating_company_id]
  );

  return {
    result: "posted",
    posting_batch_id: postingBatchId,
    journal_entry_id: journalEntryId,
    journal_entry_posting_ids: postingIds,
    idempotency_key: idempotencyKey,
    account_resolution_trace: accountResolutionTrace,
  };
}

export async function postFuelExpenseFromEvent(input: FuelPostingInput): Promise<FuelPostingResult> {
  return withLuciaBypass(async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [input.operating_company_id]);
    return postFuelExpenseOnClient(client as never, input);
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
          (vb.outstanding_cents / 100.0)::text AS current_balance
        FROM driver_finance.driver_advances a
        JOIN driver_finance.driver_liabilities l ON l.id = a.liability_id
        -- ROUND 394 RULING 1 — open = the advance's DERIVED outstanding (GL on the driver's own 1245
        -- sub-account), never the liability's stored current_balance.
        JOIN driver_finance.v_driver_advance_balances vb ON vb.advance_id = a.id
        WHERE a.operating_company_id = $1::uuid
          AND a.driver_id = $2::uuid
          AND lower(a.purpose) = 'fuel_deposit'
          AND COALESCE(a.disbursement_status, '') <> 'reversed'
          AND vb.outstanding_cents > 0
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
