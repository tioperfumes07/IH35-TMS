export default {
  name: "verify-no-swallowed-db-error-in-transaction",
  async run(ctx) {
    // SETTLE-PDF-500 — a bare catch around a DB read inside a transaction leaves it poisoned and
    // the next statement dies with an opaque 25P02. Shrink-only baseline.
    await ctx.run("node", ["scripts/verify-no-swallowed-db-error-in-transaction.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-swallowed-db-error-in-transaction.mjs"]);
  },
};
