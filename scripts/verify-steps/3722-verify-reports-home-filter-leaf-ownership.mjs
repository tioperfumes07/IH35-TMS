/** LV-REPORTS-HOME-FILTER-LEAF-MISOWNED — EVEN Cursor claim 3722 */
export default {
  name: "verify-reports-home-filter-leaf-ownership",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-reports-home-filter-leaf-ownership.mjs"]);
  },
};
