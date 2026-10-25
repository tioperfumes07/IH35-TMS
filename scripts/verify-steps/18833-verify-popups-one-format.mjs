// Owner 10-25-2026 4:02 PM CT: one popup format across the entire app. Claimed 18833 (LEAD).
export default {
  name: "verify-popups-one-format",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-popups-one-format.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-popups-one-format.mjs"]);
  },
};
