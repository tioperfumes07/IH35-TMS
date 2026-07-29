// Step 1767 — no migration may enable a QuickBooks write-back flag. TMS never writes to QBO.
export default {
  name: "verify:qbo-writeback-flags-never-enabled",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-writeback-flags-never-enabled.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-qbo-writeback-flags-never-enabled.mjs"]);
  },
};
