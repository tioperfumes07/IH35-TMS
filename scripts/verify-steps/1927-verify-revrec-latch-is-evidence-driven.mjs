export default {
  name: "verify-revrec-latch-is-evidence-driven",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-revrec-latch-is-evidence-driven.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-revrec-latch-is-evidence-driven.mjs"]);
  },
};
