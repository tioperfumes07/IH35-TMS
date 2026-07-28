/** LEG-02 — every signed-contract READ gate honours both signed states and requires the paper scan. */
export default {
  name: "verify-signed-contract-gates-agree",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-signed-contract-gates-agree.mjs"]);
    await ctx.run("node", ["scripts/verify-signed-contract-gates-agree.mjs", "--selftest"]);
  },
};
