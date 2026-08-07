// HOP 9 — banking.bank_transactions.matched_invoice_id had zero writers; the last hop of the money
// slice was unreachable. Step 2537 · CC-1 lane (n%4==1), claimed on main by #4357.
export default {
  name: "bank-invoice-backlink",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-invoice-backlink.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bank-invoice-backlink.mjs"]);
  },
};
