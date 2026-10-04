export default {
  name: "verify-maint-preflight-dvir-wo-join-uuid",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maint-preflight-dvir-wo-join-uuid.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-maint-preflight-dvir-wo-join-uuid.mjs"]);
    // BANK-F91474 — C-21 PM / fleet odometer honesty (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-c21-odometer-honesty.mjs", "--selftest"]);
  },
};
