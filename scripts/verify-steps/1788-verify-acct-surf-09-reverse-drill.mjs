export default {
  name: "verify-acct-surf-09-reverse-drill",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-surf-09-reverse-drill.mjs"]);
  },
};
