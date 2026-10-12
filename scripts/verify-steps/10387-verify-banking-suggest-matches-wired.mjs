export default {
  name: "verify-banking-suggest-matches-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-suggest-matches-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-banking-suggest-matches-wired.mjs"]);
    // ROUND 443.66-C — Relay Fuel Wallet + Dreamline list suggest (piggyback EVEN 10387).
    await ctx.run("node", ["scripts/verify-relay-wallet-suggest-44366.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-relay-wallet-suggest-44366.mjs"]);
  },
};
