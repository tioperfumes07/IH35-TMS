export default {
  name: "verify:legal-breadcrumb-tail-4",
  async run(ctx) {
    // BANK-F91484 — LegalSignPage leftover muted refuse now included in this already-wired host.
    await ctx.run("node", ["scripts/verify-legal-breadcrumb-tail-4.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-legal-breadcrumb-tail-4.mjs"]);
  },
};
