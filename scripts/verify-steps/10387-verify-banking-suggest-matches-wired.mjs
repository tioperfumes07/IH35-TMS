export default {
  name: "verify-banking-suggest-matches-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-suggest-matches-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-banking-suggest-matches-wired.mjs"]);
    // ROUND 443.66-C — Relay Fuel Wallet + Dreamline list suggest (piggyback EVEN 10387).
    await ctx.run("node", ["scripts/verify-relay-wallet-suggest-44366.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-relay-wallet-suggest-44366.mjs"]);
    // LEAD 443.345 — check lines carry their check number (trigger + backfill 202616240400) so a check pairs with what it paid.
    await ctx.run("node", ["scripts/verify-bank-check-number-parsed.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-bank-check-number-parsed.mjs"]);
  },
};
