/**
 * Lumper Lifecycle STEP 4 — the lumper posting contract (per-scenario JE legs), maker≠checker.
 *
 * There is no posting-rules.ts catalog in this codebase; posting flows through the existing per-source
 * poster engine, which resolves an expense line's category → GL account (the STEP 3a
 * expense_category_account_map: lumper → QBO-117 DR) and credits Bank. This module is the AUTHORITATIVE,
 * unit-tested statement of the JE the engine must produce for each lumper scenario, so the dollars can't
 * silently drift and Jorge can verify DR/CR in plain dollars. The real balanced JE through the engine is
 * verified by GUARD on a Neon branch before any LUMPER_LIFECYCLE_ENABLED flip; pure here, posts nothing.
 *
 * Accounts (resolved by account_number per entity at posting time):
 *   QBO-117         Warehouse-Lumper Fee            DR (Expense / COGS) — every we-pay lumper
 *   QBO-1150040160  Sales-Warehouse-Lumper Fee-Income CR (Income)       — only the S2 customer-billed leg
 */

export type LumperPostingScenario = "broker_direct" | "carrier_bill" | "carrier_absorb";

export const LUMPER_EXPENSE_ACCOUNT = "QBO-117" as const;
export const LUMPER_INCOME_ACCOUNT = "QBO-1150040160" as const;

export type JeLeg = { account_ref: string; side: "debit" | "credit"; amount_cents: number; memo: string };

/**
 * The full JE legs for one lumper of `amountCents` under `scenario`.
 *   broker_direct : [] — broker's money, never our books (S1).
 *   carrier_bill  : DR QBO-117 / CR Bank ($amt); PLUS, unless flat-rate-suppressed, DR AR / CR QBO-1150040160
 *                   ($amt) — true passthrough, nets ~0 (S2 / S2-flat).
 *   carrier_absorb: DR QBO-117 / CR Bank only — the only case lumper hits the P&L (S3, never default).
 * `customerFlatRate` suppresses the AR/income legs (the flat rate already covers the lumper; cost-only).
 */
export function lumperPostingJournal(
  scenario: LumperPostingScenario,
  amountCents: number,
  customerFlatRate: boolean,
  opts?: { bankAccountRef?: string; arAccountRef?: string },
): JeLeg[] {
  const amt = Math.max(0, Math.trunc(Number(amountCents) || 0));
  if (scenario === "broker_direct" || amt === 0) return [];

  const bank = opts?.bankAccountRef ?? "BANK";
  const ar = opts?.arAccountRef ?? "AR";

  // Expense leg — always, for any we-pay lumper (S2, S2-flat, S3).
  const legs: JeLeg[] = [
    { account_ref: LUMPER_EXPENSE_ACCOUNT, side: "debit", amount_cents: amt, memo: "Lumper fee (COGS)" },
    { account_ref: bank, side: "credit", amount_cents: amt, memo: "Cash paid for lumper" },
  ];

  // Customer-invoice passthrough leg — S2 only, and only when not flat-rate suppressed.
  if (scenario === "carrier_bill" && !customerFlatRate) {
    legs.push({ account_ref: ar, side: "debit", amount_cents: amt, memo: "Lumper billed to customer (AR)" });
    legs.push({ account_ref: LUMPER_INCOME_ACCOUNT, side: "credit", amount_cents: amt, memo: "Lumper reimbursement income" });
  }

  return legs;
}

/** Double-entry invariant: sum(debits) === sum(credits). Every lumper JE MUST balance. */
export function journalBalances(legs: readonly JeLeg[]): boolean {
  const dr = legs.filter((l) => l.side === "debit").reduce((a, l) => a + l.amount_cents, 0);
  const cr = legs.filter((l) => l.side === "credit").reduce((a, l) => a + l.amount_cents, 0);
  return dr === cr;
}

/** Net to carrier on the lumper = income credited − expense debited (0 for true passthrough, −amt for absorb). */
export function lumperNetToCarrierCents(legs: readonly JeLeg[]): number {
  const income = legs.filter((l) => l.account_ref === LUMPER_INCOME_ACCOUNT && l.side === "credit").reduce((a, l) => a + l.amount_cents, 0);
  const expense = legs.filter((l) => l.account_ref === LUMPER_EXPENSE_ACCOUNT && l.side === "debit").reduce((a, l) => a + l.amount_cents, 0);
  return income - expense;
}
