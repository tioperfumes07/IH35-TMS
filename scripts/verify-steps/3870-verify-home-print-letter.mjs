export default {
  name: "verify-home-print-letter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-home-print-letter.mjs"]);
    // BANK-F91476 — Accounting Home leftover muted + orphan GAP-67 guard (never ran in CI).
    await ctx.run("node", ["scripts/verify-accounting-home.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-accounting-home.mjs"]);
  },
};
