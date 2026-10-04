export default {
  name: "verify-bill-payment-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-payment-print-letter.mjs"]);
    // BANK-F91435 — ORDERS §B-4 Write Check + bill-payment ops pack (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-b4-check-creator.mjs", "--selftest"]);
  },
};
