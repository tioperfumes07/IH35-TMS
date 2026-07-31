// BANK-F15 — Plaid admin manual sync passes actorUserUuid into syncTransactions→autoCategorize
// so CHAIN-05 rule matches can reach maybePostBankCategorizationToGl; webhook stays actor-less.
export default {
  name: "verify:bank-f15-plaid-sync-actor",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bank-f15-plaid-sync-actor.mjs"]);
  },
};
