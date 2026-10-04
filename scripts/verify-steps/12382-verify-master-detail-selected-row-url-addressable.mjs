export default {
  name: "verify:master-detail-selected-row-url-addressable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-master-detail-selected-row-url-addressable.mjs"]);
    // BANK-F91449 — C-55 Regular + Master-detail toggle (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-c55-regular-master-detail.mjs", "--selftest"]);
  },
};
