// FACT-PHANTOM-01 + FACT-01 — Rule 17 registration; no package/workflow edit.
export default {
  name: "verify-no-phantom-factoring-companies",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-phantom-factoring-companies.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-no-phantom-factoring-companies.mjs"]);
  },
};
