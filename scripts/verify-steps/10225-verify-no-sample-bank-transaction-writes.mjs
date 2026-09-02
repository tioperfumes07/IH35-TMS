// GO-19-02 (docs/lockdown/GO-19-BUILD-QUEUE.md slice 02, BANK-F19470) — no application code may
// INSERT banking.bank_transactions with a literal is_sample_data=true; the DB trigger
// banking.forbid_sample_bank_transaction_insert() (migration 202613370001) is the live backstop.
// Step 10225 · CC-1 lane (n%4==1).
export default {
  name: "no-sample-bank-transaction-writes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-sample-bank-transaction-writes.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-no-sample-bank-transaction-writes.mjs"]);
  },
};
