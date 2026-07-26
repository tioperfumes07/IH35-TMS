export default {
  name: "verify-acct-bank-remaining-packet",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-bank-remaining-packet.mjs"]);
  },
};
