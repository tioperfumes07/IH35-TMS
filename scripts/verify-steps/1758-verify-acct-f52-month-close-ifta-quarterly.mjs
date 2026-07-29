export default {
  name: "verify-acct-f52-month-close-ifta-quarterly",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-f52-month-close-ifta-quarterly.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-f52-month-close-ifta-quarterly.mjs"]);
  },
};
