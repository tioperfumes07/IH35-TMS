// verify-honesty-empty-state-false-pass-residual — §9.0 item 17 pattern sweep
export default {
  name: "verify:honesty-empty-state-false-pass-residual",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-honesty-empty-state-false-pass-residual.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-honesty-empty-state-false-pass-residual.mjs"]);
  },
};
