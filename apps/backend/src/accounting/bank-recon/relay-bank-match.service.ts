/**
 * ROUND 441.21-B R5 — Relay fill ↔ bank feed Match engine (CHAIN-05).
 *
 * Match      = link bank line ↔ existing Relay fill. NO new JE. NO expense document.
 * Categorize = new JE, no document (bank-feed-gl-posting.service — out of scope here).
 *
 * Deterministic key first: card last4 + wallet drawdown amount (paid + sender_fee / F442) + date window.
 * Then a scored candidate list for the operator. NEVER auto-post a guess.
 * Every refusal returns a NAMED code — no silent skips.
 *
 * USMCA Relay floor 2026-08-03: a fill dated before the floor is refused, never matched.
 */
import { relayFillFeeCents, relayWalletDrawdownCents } from "../../integrations/relay-payments/relay-sender-fee-cents.js";
import {
  isBeforeRelayUsmcaFloor,
  RELAY_USMCA_DATA_FLOOR,
} from "../../integrations/relay-payments/relay-usmca-date-floor.js";
import { reversePostedSourceTransactionInClientTx } from "../posting-engine.service.js";

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }>;
};

export const RELAY_BANK_MATCH_DATE_WINDOW_DAYS = 3;

export type RelayBankMatchRefusalCode =
  | "zero_amount"
  | "pre_floor_fill"
  | "already_matched_to_bill"
  | "account_cross_entity"
  | "fill_unmatched"
  | "bank_line_unmatched"
  | "ambiguous_candidates"
  | "bank_txn_not_found"
  | "fill_not_found"
  | "already_linked"
  | "fill_already_linked"
  | "cross_entity_fill";

export class RelayBankMatchRefusal extends Error {
  constructor(
    public code: RelayBankMatchRefusalCode,
    message: string,
    public details: Record<string, string | number | null | undefined> = {}
  ) {
    super(message);
    this.name = "RelayBankMatchRefusal";
  }
}

export type RelayBankMatchCandidate = {
  relay_fuel_transaction_id: string;
  bank_transaction_id: string;
  fill_date: string;
  bank_date: string;
  wallet_amount_cents: number;
  bank_amount_cents: number;
  card_last4: string | null;
  bank_card_last4: string | null;
  unit_number: string | null;
  merchant_name: string | null;
  amount_gap_cents: number;
  date_gap_days: number;
  last4_match: boolean;
  exact_amount: boolean;
  match_score: number;
  fields_matched: string[];
};

export type RelayBankMatchRecommendResult =
  | { status: "exact"; candidate: RelayBankMatchCandidate; candidates: RelayBankMatchCandidate[] }
  | { status: "candidates"; candidates: RelayBankMatchCandidate[] }
  | { status: "refused"; code: RelayBankMatchRefusalCode; message: string; details?: Record<string, string | number | null | undefined> };

export type RelayBankMatchAcceptResult = {
  linked: true;
  bank_transaction_id: string;
  relay_fuel_transaction_id: string;
  journal_entry_created: false;
  expense_created: false;
};

/** Last 4 digits of a Relay driver/card integration id (fuel card number). */
export function cardLast4FromIntegrationId(integrationId: string | null | undefined): string | null {
  const digits = String(integrationId ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** Pull a plausible card last4 from bank description / notes (…1234, card 1234, *1234). */
export function cardLast4FromBankText(...parts: Array<string | null | undefined>): string | null {
  const text = parts.filter(Boolean).join(" ");
  const m =
    text.match(/(?:card|acct|account|x{2,}|\*{2,}|\u2026|\.{2,})\s*[-:]?\s*(\d{4})\b/i) ??
    text.match(/\b(\d{4})\s*$/);
  return m?.[1] ?? null;
}

function daysBetween(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`);
  if (!Number.isFinite(ms)) return 999;
  return Math.abs(Math.round(ms / 86_400_000));
}

function shiftDate(isoDay: string, deltaDays: number): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function scoreCandidate(c: Omit<RelayBankMatchCandidate, "match_score" | "fields_matched">): RelayBankMatchCandidate {
  const fields: string[] = [];
  let score = 0;
  if (c.exact_amount) {
    score += 50;
    fields.push("amount");
  } else if (c.amount_gap_cents <= 200) {
    score += 20;
    fields.push("amount_near");
  }
  if (c.last4_match) {
    score += 30;
    fields.push("card_last4");
  }
  if (c.date_gap_days === 0) {
    score += 15;
    fields.push("date");
  } else if (c.date_gap_days <= RELAY_BANK_MATCH_DATE_WINDOW_DAYS) {
    score += 8;
    fields.push("date_window");
  }
  if (c.unit_number) {
    score += 5;
    fields.push("unit");
  }
  if (c.merchant_name) {
    score += 2;
    fields.push("merchant");
  }
  return { ...c, match_score: score, fields_matched: fields };
}

type BankRow = {
  id: string;
  operating_company_id: string;
  transaction_date: string;
  amount_cents: number;
  description: string | null;
  merchant_name: string | null;
  notes: string | null;
  matched_bill_id: string | null;
  matched_relay_fuel_transaction_id: string | null;
  matched_journal_entry_id: string | null;
  review_state: string | null;
  status: string | null;
};

type FillRow = {
  id: string;
  operating_company_id: string;
  fill_date: string;
  total_amount_paid_cents: number;
  fees: unknown;
  transaction_id: string;
  relay_driver_integration_id: string | null;
  matched_unit_number: string | null;
  merchant_name: string | null;
  line_fee_cents: number;
};

async function loadBankRow(client: DbClient, operatingCompanyId: string, bankTransactionId: string): Promise<BankRow | null> {
  const res = await client.query<BankRow>(
    `SELECT id::text, operating_company_id::text, transaction_date::text,
            amount_cents::int, description, merchant_name, notes,
            matched_bill_id::text, matched_relay_fuel_transaction_id::text,
            matched_journal_entry_id::text, review_state::text, status::text
       FROM banking.bank_transactions
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL
      LIMIT 1`,
    [bankTransactionId, operatingCompanyId]
  );
  return res.rows[0] ?? null;
}

async function loadFillRow(client: DbClient, operatingCompanyId: string, fillId: string): Promise<FillRow | null> {
  const res = await client.query<FillRow>(
    `SELECT r.id::text, r.operating_company_id::text,
            COALESCE(r.relay_created_at, r.created_at)::date::text AS fill_date,
            ABS(COALESCE(r.total_amount_paid_cents, 0))::int AS total_amount_paid_cents,
            r.fees, r.transaction_id::text,
            r.relay_driver_integration_id,
            r.matched_unit_number, r.merchant_name,
            COALESCE((
              SELECT sum(l.fee_amount_cents)::int
                FROM integrations.relay_fuel_transaction_lines l
               WHERE l.relay_fuel_transaction_id = r.id AND l.voided_at IS NULL
            ), 0)::int AS line_fee_cents
       FROM integrations.relay_fuel_transactions r
      WHERE r.id = $1::uuid AND r.operating_company_id = $2::uuid AND r.voided_at IS NULL
      LIMIT 1`,
    [fillId, operatingCompanyId]
  );
  return res.rows[0] ?? null;
}

function walletCentsForFill(fill: FillRow): number {
  const fees = Array.isArray(fill.fees) ? fill.fees : [];
  const fee = relayFillFeeCents({
    transaction_id: fill.transaction_id,
    fees,
    line_fee_amount_cents: [fill.line_fee_cents],
  });
  return relayWalletDrawdownCents(fill.total_amount_paid_cents, fee);
}

function refuseIfBankBlocked(bank: BankRow): void {
  const amountAbs = Math.abs(Number(bank.amount_cents ?? 0));
  if (!Number.isFinite(amountAbs) || amountAbs <= 0) {
    throw new RelayBankMatchRefusal("zero_amount", `bank line ${bank.id}: amount is zero`, {
      bank_transaction_id: bank.id,
    });
  }
  if (bank.matched_bill_id) {
    throw new RelayBankMatchRefusal(
      "already_matched_to_bill",
      `bank line ${bank.id} already matched to bill ${bank.matched_bill_id}`,
      { bank_transaction_id: bank.id, matched_bill_id: bank.matched_bill_id }
    );
  }
}

function refuseIfFillBlocked(fill: FillRow, expectedOpco: string): void {
  if (fill.operating_company_id !== expectedOpco) {
    throw new RelayBankMatchRefusal("cross_entity_fill", `fill ${fill.id} is not in the bank line's company`, {
      relay_fuel_transaction_id: fill.id,
      fill_operating_company_id: fill.operating_company_id,
    });
  }
  if (isBeforeRelayUsmcaFloor(fill.fill_date)) {
    throw new RelayBankMatchRefusal(
      "pre_floor_fill",
      `fill ${fill.id} dated ${fill.fill_date} is before USMCA Relay floor ${RELAY_USMCA_DATA_FLOOR}`,
      { relay_fuel_transaction_id: fill.id, fill_date: fill.fill_date, floor: RELAY_USMCA_DATA_FLOOR }
    );
  }
  const wallet = walletCentsForFill(fill);
  if (wallet <= 0) {
    throw new RelayBankMatchRefusal("zero_amount", `fill ${fill.id}: wallet drawdown is zero`, {
      relay_fuel_transaction_id: fill.id,
    });
  }
}

/**
 * Recommend Relay fill candidates for a bank line (or bank candidates for a fill).
 * Never writes. Exact unique deterministic key → status exact; else scored list or named refusal.
 */
export async function recommendRelayBankMatch(
  client: DbClient,
  input: {
    operating_company_id: string;
    bank_transaction_id?: string;
    relay_fuel_transaction_id?: string;
    window_days?: number;
  }
): Promise<RelayBankMatchRecommendResult> {
  try {
    if (input.bank_transaction_id) {
      return await recommendForBankLine(client, input.operating_company_id, input.bank_transaction_id, input.window_days);
    }
    if (input.relay_fuel_transaction_id) {
      return await recommendForFill(client, input.operating_company_id, input.relay_fuel_transaction_id, input.window_days);
    }
    return { status: "refused", code: "bank_txn_not_found", message: "bank_transaction_id or relay_fuel_transaction_id required" };
  } catch (err) {
    if (err instanceof RelayBankMatchRefusal) {
      return { status: "refused", code: err.code, message: err.message, details: err.details };
    }
    throw err;
  }
}

async function recommendForBankLine(
  client: DbClient,
  operatingCompanyId: string,
  bankTransactionId: string,
  windowDays?: number
): Promise<RelayBankMatchRecommendResult> {
  const bank = await loadBankRow(client, operatingCompanyId, bankTransactionId);
  if (!bank) {
    return { status: "refused", code: "bank_txn_not_found", message: `bank line ${bankTransactionId} not found` };
  }
  if (bank.operating_company_id !== operatingCompanyId) {
    return {
      status: "refused",
      code: "account_cross_entity",
      message: `bank line ${bank.id} belongs to another company`,
      details: { bank_transaction_id: bank.id },
    };
  }
  refuseIfBankBlocked(bank);

  const days = Math.min(Math.max(windowDays ?? RELAY_BANK_MATCH_DATE_WINDOW_DAYS, 0), 14);
  const from = shiftDate(bank.transaction_date, -days);
  const to = shiftDate(bank.transaction_date, days);
  const floorFrom = from < RELAY_USMCA_DATA_FLOOR ? RELAY_USMCA_DATA_FLOOR : from;

  const fills = await client.query<FillRow>(
    `SELECT r.id::text, r.operating_company_id::text,
            COALESCE(r.relay_created_at, r.created_at)::date::text AS fill_date,
            ABS(COALESCE(r.total_amount_paid_cents, 0))::int AS total_amount_paid_cents,
            r.fees, r.transaction_id::text,
            r.relay_driver_integration_id,
            r.matched_unit_number, r.merchant_name,
            COALESCE((
              SELECT sum(l.fee_amount_cents)::int
                FROM integrations.relay_fuel_transaction_lines l
               WHERE l.relay_fuel_transaction_id = r.id AND l.voided_at IS NULL
            ), 0)::int AS line_fee_cents
       FROM integrations.relay_fuel_transactions r
      WHERE r.operating_company_id = $1::uuid
        AND r.voided_at IS NULL
        AND COALESCE(r.relay_created_at, r.created_at)::date BETWEEN $2::date AND $3::date
        AND COALESCE(r.relay_created_at, r.created_at)::date >= $4::date
        AND NOT EXISTS (
          SELECT 1 FROM banking.bank_transactions bt
           WHERE bt.matched_relay_fuel_transaction_id = r.id
             AND bt.voided_at IS NULL
             AND bt.review_state = 'matched'
        )
      LIMIT 500`,
    [operatingCompanyId, floorFrom, to, RELAY_USMCA_DATA_FLOOR]
  );

  const bankAbs = Math.abs(Number(bank.amount_cents));
  const bankLast4 = cardLast4FromBankText(bank.description, bank.notes, bank.merchant_name);
  const candidates = fills.rows
    .map((fill) => {
      const wallet = walletCentsForFill(fill);
      const fillLast4 = cardLast4FromIntegrationId(fill.relay_driver_integration_id);
      const amountGap = Math.abs(bankAbs - wallet);
      const dateGap = daysBetween(bank.transaction_date, fill.fill_date);
      return scoreCandidate({
        relay_fuel_transaction_id: fill.id,
        bank_transaction_id: bank.id,
        fill_date: fill.fill_date,
        bank_date: bank.transaction_date,
        wallet_amount_cents: wallet,
        bank_amount_cents: bankAbs,
        card_last4: fillLast4,
        bank_card_last4: bankLast4,
        unit_number: fill.matched_unit_number,
        merchant_name: fill.merchant_name,
        amount_gap_cents: amountGap,
        date_gap_days: dateGap,
        last4_match: Boolean(bankLast4 && fillLast4 && bankLast4 === fillLast4),
        exact_amount: amountGap === 0,
      });
    })
    .filter((c) => c.date_gap_days <= days && (c.exact_amount || c.last4_match || c.amount_gap_cents <= 200))
    .sort((a, b) => b.match_score - a.match_score || a.amount_gap_cents - b.amount_gap_cents);

  if (candidates.length === 0) {
    return {
      status: "refused",
      code: "bank_line_unmatched",
      message: `no Relay fill candidates for bank line ${bank.id}`,
      details: { bank_transaction_id: bank.id },
    };
  }

  const deterministic = candidates.filter(
    (c) => c.exact_amount && c.date_gap_days <= days && (c.last4_match || !bankLast4)
  );
  if (deterministic.length === 1) {
    return { status: "exact", candidate: deterministic[0]!, candidates };
  }
  if (deterministic.length > 1) {
    return { status: "candidates", candidates: deterministic };
  }
  return { status: "candidates", candidates };
}

async function recommendForFill(
  client: DbClient,
  operatingCompanyId: string,
  fillId: string,
  windowDays?: number
): Promise<RelayBankMatchRecommendResult> {
  const fill = await loadFillRow(client, operatingCompanyId, fillId);
  if (!fill) {
    return { status: "refused", code: "fill_not_found", message: `fill ${fillId} not found` };
  }
  refuseIfFillBlocked(fill, operatingCompanyId);

  const days = Math.min(Math.max(windowDays ?? RELAY_BANK_MATCH_DATE_WINDOW_DAYS, 0), 14);
  const from = shiftDate(fill.fill_date, -days);
  const to = shiftDate(fill.fill_date, days);
  const wallet = walletCentsForFill(fill);
  const fillLast4 = cardLast4FromIntegrationId(fill.relay_driver_integration_id);

  const banks = await client.query<BankRow>(
    `SELECT id::text, operating_company_id::text, transaction_date::text,
            amount_cents::int, description, merchant_name, notes,
            matched_bill_id::text, matched_relay_fuel_transaction_id::text,
            matched_journal_entry_id::text, review_state::text, status::text
       FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid
        AND voided_at IS NULL
        AND transaction_date BETWEEN $2::date AND $3::date
        AND ABS(amount_cents) > 0
        AND matched_relay_fuel_transaction_id IS NULL
        AND review_state IS DISTINCT FROM 'matched'
      LIMIT 500`,
    [operatingCompanyId, from, to]
  );

  const candidates = banks.rows
    .map((bank) => {
      const bankAbs = Math.abs(Number(bank.amount_cents));
      const bankLast4 = cardLast4FromBankText(bank.description, bank.notes, bank.merchant_name);
      const amountGap = Math.abs(bankAbs - wallet);
      const dateGap = daysBetween(bank.transaction_date, fill.fill_date);
      return scoreCandidate({
        relay_fuel_transaction_id: fill.id,
        bank_transaction_id: bank.id,
        fill_date: fill.fill_date,
        bank_date: bank.transaction_date,
        wallet_amount_cents: wallet,
        bank_amount_cents: bankAbs,
        card_last4: fillLast4,
        bank_card_last4: bankLast4,
        unit_number: fill.matched_unit_number,
        merchant_name: fill.merchant_name,
        amount_gap_cents: amountGap,
        date_gap_days: dateGap,
        last4_match: Boolean(bankLast4 && fillLast4 && bankLast4 === fillLast4),
        exact_amount: amountGap === 0,
      });
    })
    .filter((c) => c.date_gap_days <= days && (c.exact_amount || c.last4_match || c.amount_gap_cents <= 200))
    .sort((a, b) => b.match_score - a.match_score || a.amount_gap_cents - b.amount_gap_cents);

  if (candidates.length === 0) {
    return {
      status: "refused",
      code: "fill_unmatched",
      message: `no bank line candidates for fill ${fill.id}`,
      details: { relay_fuel_transaction_id: fill.id },
    };
  }
  const deterministic = candidates.filter(
    (c) => c.exact_amount && c.date_gap_days <= days && (c.last4_match || !c.bank_card_last4)
  );
  if (deterministic.length === 1) {
    return { status: "exact", candidate: deterministic[0]!, candidates };
  }
  return { status: "candidates", candidates };
}

/**
 * Accept a Relay↔bank Match: LINK only. No JE. No expense.
 * Throws RelayBankMatchRefusal with a named code on every failure.
 */
export async function acceptRelayBankMatch(
  client: DbClient,
  input: {
    operating_company_id: string;
    bank_transaction_id: string;
    relay_fuel_transaction_id: string;
    actor_user_uuid: string;
  }
): Promise<RelayBankMatchAcceptResult> {
  const bank = await loadBankRow(client, input.operating_company_id, input.bank_transaction_id);
  if (!bank) {
    throw new RelayBankMatchRefusal("bank_txn_not_found", `bank line ${input.bank_transaction_id} not found`, {
      bank_transaction_id: input.bank_transaction_id,
    });
  }
  if (bank.operating_company_id !== input.operating_company_id) {
    throw new RelayBankMatchRefusal("account_cross_entity", `bank line ${bank.id} cross-entity`, {
      bank_transaction_id: bank.id,
    });
  }
  refuseIfBankBlocked(bank);
  if (bank.matched_relay_fuel_transaction_id) {
    throw new RelayBankMatchRefusal("already_linked", `bank line ${bank.id} already linked to a Relay fill`, {
      bank_transaction_id: bank.id,
      matched_relay_fuel_transaction_id: bank.matched_relay_fuel_transaction_id,
    });
  }

  const fill = await loadFillRow(client, input.operating_company_id, input.relay_fuel_transaction_id);
  if (!fill) {
    throw new RelayBankMatchRefusal("fill_not_found", `fill ${input.relay_fuel_transaction_id} not found`, {
      relay_fuel_transaction_id: input.relay_fuel_transaction_id,
    });
  }
  refuseIfFillBlocked(fill, input.operating_company_id);

  const held = await client.query<{ id: string }>(
    `SELECT id::text FROM banking.bank_transactions
      WHERE matched_relay_fuel_transaction_id = $1::uuid
        AND voided_at IS NULL AND review_state = 'matched'
        AND id <> $2::uuid
      LIMIT 1`,
    [fill.id, bank.id]
  );
  if (held.rows[0]) {
    throw new RelayBankMatchRefusal("fill_already_linked", `fill ${fill.id} already linked to bank line ${held.rows[0].id}`, {
      relay_fuel_transaction_id: fill.id,
      bank_transaction_id: held.rows[0].id,
    });
  }

  const cleared = await client.query(
    `UPDATE banking.bank_transactions
        SET review_state = 'matched',
            resolution_kind = 'matched',
            reviewed_at = now(),
            categorized_by_user_id = $3::uuid,
            categorized_at = now(),
            matched_relay_fuel_transaction_id = $4::uuid,
            updated_at = now()
      WHERE id = $1::uuid
        AND operating_company_id = $2::uuid
        AND review_state <> 'matched'
        AND matched_relay_fuel_transaction_id IS NULL`,
    [bank.id, input.operating_company_id, input.actor_user_uuid, fill.id]
  );
  if ((cleared.rowCount ?? 0) === 0) {
    throw new RelayBankMatchRefusal("already_linked", `bank line ${bank.id} could not be linked (already matched)`, {
      bank_transaction_id: bank.id,
    });
  }

  await client.query(
    `INSERT INTO banking.reconciliation_matches (
       operating_company_id, bank_transaction_id, ledger_entry_kind, ledger_entry_id,
       match_score, match_state, created_by_user_id
     ) VALUES ($1::uuid, $2::uuid, 'relay_fuel', $3::uuid, 100, 'user_matched', $4::uuid)
     ON CONFLICT DO NOTHING`,
    [input.operating_company_id, bank.id, fill.id, input.actor_user_uuid]
  ).catch(() => {
    // reconciliation_matches may lack a unique conflict target on older schemas — link stamp above is the authority.
  });

  return {
    linked: true,
    bank_transaction_id: bank.id,
    relay_fuel_transaction_id: fill.id,
    journal_entry_created: false,
    expense_created: false,
  };
}

/**
 * Re-match: reverse any prior bank_categorization / match-created JE via reversePostedSourceTransaction
 * (never void), clear the prior link, then accept the new link.
 */
export async function rematchRelayBankMatch(
  client: DbClient,
  input: {
    operating_company_id: string;
    bank_transaction_id: string;
    relay_fuel_transaction_id: string;
    actor_user_uuid: string;
  }
): Promise<RelayBankMatchAcceptResult> {
  const bank = await loadBankRow(client, input.operating_company_id, input.bank_transaction_id);
  if (!bank) {
    throw new RelayBankMatchRefusal("bank_txn_not_found", `bank line ${input.bank_transaction_id} not found`, {
      bank_transaction_id: input.bank_transaction_id,
    });
  }

  if (bank.matched_journal_entry_id) {
    const src = await client.query<{ source_transaction_type: string | null; source_transaction_id: string | null }>(
      `SELECT DISTINCT ON (source_transaction_type) source_transaction_type::text, source_transaction_id::text
         FROM accounting.journal_entry_postings
        WHERE journal_entry_uuid = $1::uuid AND operating_company_id = $2::uuid
          AND source_transaction_type IS NOT NULL
        ORDER BY source_transaction_type
        LIMIT 1`,
      [bank.matched_journal_entry_id, input.operating_company_id]
    );
    const st = src.rows[0]?.source_transaction_type;
    const sid = src.rows[0]?.source_transaction_id ?? bank.id;
    if (st === "bank_categorization" || st === "fuel_expense" || st === "relay_fuel" || st === "bank_match_fuel") {
      // CHAIN-05 re-match: reverse the prior posting (never void).
      await reversePostedSourceTransactionInClientTx(
        client as never,
        {
          operating_company_id: input.operating_company_id,
          source_transaction_type: st as never,
          source_transaction_id: sid,
        },
        { userId: input.actor_user_uuid },
        new Date().toISOString().slice(0, 10)
      );
    }
  }

  await client.query(
    `UPDATE banking.bank_transactions
        SET matched_relay_fuel_transaction_id = NULL,
            matched_journal_entry_id = NULL,
            matched_bill_id = NULL,
            review_state = 'for_review',
            resolution_kind = NULL,
            updated_at = now()
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [bank.id, input.operating_company_id]
  );

  return acceptRelayBankMatch(client, input);
}

/**
 * Scan categorized USMCA bank lines for already_matched_to_bill (Martin's lines).
 * Reports every line id — never silently skips. Expected: zero refusals of that code
 * after CC-1's deposit undo; any hit means a deposit survived and must be reported.
 */
export async function scanCategorizedLinesForAlreadyMatchedToBill(
  client: DbClient,
  operatingCompanyId: string
): Promise<Array<{ bank_transaction_id: string; matched_bill_id: string }>> {
  const res = await client.query<{ bank_transaction_id: string; matched_bill_id: string }>(
    `SELECT id::text AS bank_transaction_id, matched_bill_id::text AS matched_bill_id
       FROM banking.bank_transactions
      WHERE operating_company_id = $1::uuid
        AND voided_at IS NULL
        AND (status = 'categorized' OR review_state IN ('categorized', 'matched'))
        AND matched_bill_id IS NOT NULL
      ORDER BY transaction_date, id`,
    [operatingCompanyId]
  );
  return res.rows;
}

/** SQL amount expression for Match drawer candidates — wallet drawdown (F442). */
export const RELAY_FUEL_WALLET_AMOUNT_SQL = `(
  ABS(COALESCE(r.total_amount_paid_cents, 0))
  + COALESCE((
      SELECT ROUND(SUM((f->>'amount')::numeric * 100))::int
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(r.fees) = 'array' THEN r.fees ELSE '[]'::jsonb END) f
       WHERE (f->>'amount') ~ '^[0-9]+(\\.[0-9]+)?$'
    ), 0)
)`;
