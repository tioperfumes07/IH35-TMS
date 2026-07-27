// FACT-03 — operational factoring routes must use canonical Faro identity (no customer-majority).
export default {
  name: "verify-single-factor-resolver",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-single-factor-resolver.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-single-factor-resolver.mjs"]);
  },
};
