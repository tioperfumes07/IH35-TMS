/**
 * GO-CLOSE-188 CC-1 DEFECT A — the deposit-sweep JE (Dr real bank / Cr the payment's original holding
 * account, e.g. Undeposited Funds) fires once, at the moment bank-recon matches a customer_payment to
 * its real bank_transaction. Before this fix, customer payments correctly debited Undeposited Funds
 * (buildCustomerPaymentLines) but nothing ever moved that balance into the real bank register — the
 * bank account bank reconciliation actually reconciles never saw the collection.
 */
import { describe, expect, it, vi } from "vitest";
import { acceptMatchWithResolveDifference } from "../match.service.js";

const { mockQuery, mockWithLuciaBypass } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  return { mockQuery: query, mockWithLuciaBypass: withLuciaBypass };
});

vi.mock("../../../auth/db.js", () => ({
  withLuciaBypass: mockWithLuciaBypass,
}));

vi.mock("../../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(),
}));

vi.mock("../../accounting-spine-emit.js", () => ({
  writeTransactionSourceLink: vi.fn(),
}));

vi.mock("../../cash-basis/engine.js", () => ({
  applyCashBasisSuppression: vi.fn((entries: unknown[]) => entries),
}));

vi.mock("../../../banking/bank-account-visibility.js", () => ({
  bankAccountHiddenFilterSql: () => "",
  bankTransactionHiddenFilterSql: () => "",
  isBankAccountHideEnabled: () => false,
}));

const OPCO = "11111111-1111-4111-8111-111111111111";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const BANK_TX = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BANK_ACCT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PAYMENT = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const REAL_BANK_LEDGER = "eeeeeeee-1111-4eee-8eee-eeeeeeeeeeee";
const HOLDING_ACCOUNT = "ffffffff-2222-4fff-8fff-ffffffffffff";

function bankTxnRow(overrides: Record<string, unknown> = {}) {
  return {
    id: BANK_TX,
    bank_account_id: BANK_ACCT,
    operating_company_id: OPCO,
    transaction_date: "2026-08-29",
    amount_cents: 100000,
    is_credit: true,
    description: "ACH deposit",
    merchant_name: "Customer",
    notes: null,
    review_state: "for_review",
    ...overrides,
  };
}

describe("GO-CLOSE-188 DEFECT A — customer_payment_deposit sweep on match accept", () => {
  it("posts Dr real bank / Cr holding account once source_bank_transaction_id is set by the match", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();

    mockQuery.mockImplementation(async (sql: string) => {
      const s = String(sql);
      // the sweep's own bank-ledger-account lookup (bank_transactions JOIN bank_accounts) — checked
      // BEFORE the general bank_transactions branch below since both match "FROM banking.bank_transactions".
      if (s.includes("FROM banking.bank_transactions") && s.includes("JOIN banking.bank_accounts")) {
        return { rows: [{ bank_ledger_account_id: REAL_BANK_LEDGER }] };
      }
      if (s.includes("FROM banking.bank_transactions") && s.includes("SELECT")) return { rows: [bankTxnRow()] };
      // loadLedgerAmountCents
      if (s.includes("SELECT amount_cents::int FROM accounting.payments")) return { rows: [{ amount_cents: 100000 }] };
      // executePostingOnClient's idempotency pre-check — nothing posted yet
      if (s.includes("FROM accounting.posting_batches") && s.includes("idempotency_key")) return { rows: [] };
      // buildCustomerPaymentDepositSweepLines' own FOR UPDATE lookup — this is the payment AFTER the
      // reverse-stamp UPDATE has run (mocks are stateless, so this fixture supplies the post-stamp state
      // directly): source_bank_transaction_id is now set.
      if (s.includes("FROM accounting.payments") && s.includes("FOR UPDATE")) {
        return {
          rows: [
            {
              id: PAYMENT,
              payment_date: "2026-08-29",
              amount_cents: 100000,
              display_id: "PMT-2026-00012",
              deposited_to_account_id: HOLDING_ACCOUNT,
              voided_at: null,
              source_system: null,
              qbo_payment_id: null,
              source_bank_transaction_id: BANK_TX,
            },
          ],
        };
      }
      // resolveCustomerPaymentDepositAccount resolving deposited_to_account_id -> itself is already a
      // catalogs.accounts id in this fixture (the common historical shape — see posting-engine.service.ts)
      if (s.includes("FROM catalogs.accounts") && s.includes("is_postable")) return { rows: [{ id: HOLDING_ACCOUNT }] };
      if (s.includes("FROM catalogs.posting_templates")) return { rows: [] };
      if (s.includes("INSERT INTO accounting.posting_batches")) return { rows: [{ id: "batch-sweep-1" }] };
      if (s.includes("FROM accounting.journal_entry_postings") && s.includes("posting_batch_id")) return { rows: [{ n: "0" }] };
      if (s.includes("UPDATE accounting.posting_batches")) return { rows: [] };
      if (s.includes("closed_period_cutoff")) return { rows: [{ cutoff: null }] };
      if (s.includes("INSERT INTO accounting.journal_entries")) return { rows: [{ id: "je-sweep-1" }] };
      if (s.includes("INSERT INTO accounting.journal_entry_postings")) return { rows: [{ id: "p-sweep-1" }, { id: "p-sweep-2" }] };
      if (s.includes("is_sample_data")) return { rows: [{ is_sample_data: false }] };
      if (s.includes("journal_entry_type")) return { rows: [] };
      return { rows: [] };
    });

    await acceptMatchWithResolveDifference({
      operating_company_id: OPCO,
      bank_transaction_id: BANK_TX,
      actor_user_uuid: ACTOR,
      ledger_entry_kind: "payment",
      ledger_entry_id: PAYMENT,
      difference_account_id: "00000000-0000-4000-8000-000000000000",
    });

    const sweepJeInsert = mockQuery.mock.calls.find(
      ([sql]) => String(sql).includes("INSERT INTO accounting.journal_entry_postings")
    );
    expect(sweepJeInsert).toBeDefined();

    const bankLedgerLookup = mockQuery.mock.calls.find(
      ([sql]) => String(sql).includes("FROM banking.bank_transactions") && String(sql).includes("JOIN banking.bank_accounts")
    );
    expect(bankLedgerLookup).toBeDefined();
  });

  it("skips silently (does not fail the match) when the payment has no source_bank_transaction_id yet", async () => {
    mockQuery.mockReset();
    mockWithLuciaBypass.mockClear();

    mockQuery.mockImplementation(async (sql: string) => {
      const s = String(sql);
      if (s.includes("FROM banking.bank_transactions") && s.includes("SELECT")) return { rows: [bankTxnRow()] };
      if (s.includes("SELECT amount_cents::int FROM accounting.payments")) return { rows: [{ amount_cents: 100000 }] };
      if (s.includes("FROM accounting.payments") && s.includes("FOR UPDATE")) {
        // reverse-stamp UPDATE in this fixture never actually persists (stateless mock) — simulate the
        // race where the UPDATE hasn't visibly landed yet.
        return {
          rows: [
            {
              id: PAYMENT,
              payment_date: "2026-08-29",
              amount_cents: 100000,
              display_id: "PMT-2026-00012",
              deposited_to_account_id: HOLDING_ACCOUNT,
              voided_at: null,
              source_system: null,
              qbo_payment_id: null,
              source_bank_transaction_id: null,
            },
          ],
        };
      }
      return { rows: [] };
    });

    // Must NOT throw — a not-yet-eligible sweep is a normal skip, never a match failure.
    await expect(
      acceptMatchWithResolveDifference({
        operating_company_id: OPCO,
        bank_transaction_id: BANK_TX,
        actor_user_uuid: ACTOR,
        ledger_entry_kind: "payment",
        ledger_entry_id: PAYMENT,
        difference_account_id: "00000000-0000-4000-8000-000000000000",
      })
    ).resolves.toBeDefined();
  });
});
