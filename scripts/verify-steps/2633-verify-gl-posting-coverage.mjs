// verify-gl-posting-coverage — CLS-GL-DARK ratchet (ACCT-F122). RED when a TMS-NATIVE, POSTABLE money
// event has no journal entry. Scoped hard on purpose: QBO-origin rows are refused by design under
// parallel books, and a guard demanding coverage on those 40,887 rows would report a $65M gap that
// must never be closed. The selftest runs first so a stale guard fails loudly instead of vacuously.
export default {
  name: "verify:gl-posting-coverage",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-gl-posting-coverage.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-gl-posting-coverage.mjs"]);
  },
};
