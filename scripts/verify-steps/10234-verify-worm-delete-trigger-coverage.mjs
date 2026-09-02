/** GO-18 Gap 5 corrected — every display-id.ts MAX+1 table must declare trg_worm_refuse_delete. */
export default {
  name: "verify-worm-delete-trigger-coverage",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-worm-delete-trigger-coverage.mjs"]);
    await ctx.run("node", ["scripts/verify-worm-delete-trigger-coverage.mjs", "--selftest"]);
  },
};
