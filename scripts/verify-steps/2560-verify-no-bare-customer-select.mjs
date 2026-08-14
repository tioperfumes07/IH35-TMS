// Customer-column systemic ratchets: canonical picker use and exact leaf-specific Built claims.
export default {
  name: "verify:customer-column-systemic-ratchets",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-bare-customer-select.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-bare-customer-select.mjs"]);
    await ctx.run("node", ["scripts/verify-wave-a-customer-built-claims-leaf-specific.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wave-a-customer-built-claims-leaf-specific.mjs"]);
  },
};
