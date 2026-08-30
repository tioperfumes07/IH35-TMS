/** GO-CLOSE-188 owner G1 -- customers/vendors CREATE auto-derives is_sample_data from the name. */
export default {
  name: "verify-g1-sample-data-name-detection",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-g1-sample-data-name-detection.mjs"]);
    await ctx.run("node", ["scripts/verify-g1-sample-data-name-detection.mjs", "--selftest"]);
  },
};
