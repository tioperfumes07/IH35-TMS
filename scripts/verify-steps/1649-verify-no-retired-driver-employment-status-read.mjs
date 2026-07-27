/** DRV-04 — no screen may read the retired mdata.drivers.employment_status column (0/178, no writer). */
export default {
  name: "verify-no-retired-driver-employment-status-read",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-retired-driver-employment-status-read.mjs"]);
    await ctx.run("node", ["scripts/verify-no-retired-driver-employment-status-read.mjs", "--selftest"]);
  },
};
