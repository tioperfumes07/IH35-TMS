// BANK-F16 — a credit-class bank account must bridge to a Liability GL account (and a depository one to
// an Asset). Prod shipped 120 Amex postings into "Faro Factoring Reserves" because the bank leg was
// taken from ledger_account_id verbatim. Step 2525 · CC-1 lane (n%4==1), claimed on main by #4357.
export default {
  name: "bank-ledger-account-class-match",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-ledger-account-class-match.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bank-ledger-account-class-match.mjs"]);
  },
};
