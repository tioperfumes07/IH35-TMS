/**
 * ROUND 140.6 — wires scripts/verify-bank-match-suggest-is-read-only.mjs into CI.
 * Live guard — requires DATABASE_URL for bank_transactions count + JE source check.
 */
export default {
  name: "verify-bank-match-suggest-is-read-only",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-match-suggest-is-read-only.mjs"]);
  },
};
