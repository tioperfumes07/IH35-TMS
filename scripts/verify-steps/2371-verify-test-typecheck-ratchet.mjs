export default {
  name: "verify-test-typecheck-ratchet",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-test-typecheck-ratchet.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-test-typecheck-ratchet.mjs"]);
  },
};
