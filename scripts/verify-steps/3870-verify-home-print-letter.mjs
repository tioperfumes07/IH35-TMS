export default {
  name: "verify-home-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-home-print-letter.mjs"]);
    // BANK-F91476 leftover muted + BANK-F91548 leftover slate class refuse.
    await ctx.run("node", ["scripts/verify-accounting-home.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-accounting-home.mjs"]);
  },
};
