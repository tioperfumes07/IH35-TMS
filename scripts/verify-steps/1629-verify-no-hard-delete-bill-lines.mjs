/** F9-02 — never hard-DELETE accounting.bill_lines (void orphans). */
export default {
  name: "verify-no-hard-delete-bill-lines",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-hard-delete-bill-lines.mjs"]);
    await ctx.run("node", ["scripts/verify-no-hard-delete-bill-lines.mjs", "--selftest"]);
  },
};
