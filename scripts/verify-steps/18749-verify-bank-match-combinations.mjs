// LEAD 443.304 — bank match combinations + multi-document Resolve difference + G1. Claimed 18749 (LEAD).
export default {
  name: "verify-bank-match-combinations",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-match-combinations.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-match-combinations.mjs"]);
    await ctx.run("npx", ["vitest", "run", "apps/backend/src/accounting/bank-recon/__tests__/amount-combinations.test.ts"]);
  },
};
