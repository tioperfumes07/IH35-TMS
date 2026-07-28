/** `data?.X.method()` guards only the first hop — an absent array unmounts the whole page. */
export default {
  name: "verify-no-partial-optional-chain",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-partial-optional-chain.mjs"]);
    await ctx.run("node", ["scripts/verify-no-partial-optional-chain.mjs", "--selftest"]);
  },
};
