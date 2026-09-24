/**
 * ROUND 143.2 Item 2 — wires scripts/verify-trial-balance-and-balance-sheet.mjs into CI.
 * Live guard — requires DATABASE_URL for journal entries + accounts live check.
 */
export default {
  name: "verify-trial-balance-and-balance-sheet",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-trial-balance-and-balance-sheet.mjs"]);
  },
};
