// Rule 17: verify-steps ONLY — never edit package.json / ci.yml for wiring.
export default {
  name: "verify-banking-register-void-date-filter",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-register-void-date-filter.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-banking-register-void-date-filter.mjs"]);
  },
};
