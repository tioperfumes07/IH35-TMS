/** Cursor EVEN · claim 9896 on origin/main · verify-declared-is-rendered */
export default {
  name: "verify-declared-is-rendered",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-declared-is-rendered.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-declared-is-rendered.mjs"]);
    await ctx.run("node", ["scripts/ops/build-verifier-rollup.mjs", "--check"]);
  },
};
