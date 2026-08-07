export default {
  name: "verify:no-bare-insurance-policy-select",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-bare-insurance-policy-select.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-bare-insurance-policy-select.mjs"]);
  },
};
