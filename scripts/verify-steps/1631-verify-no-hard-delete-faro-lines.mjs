/** F9-03 — never hard-DELETE factor.faro_invoice_lines on daily re-import. */
export default {
  name: "verify-no-hard-delete-faro-lines",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-hard-delete-faro-lines.mjs"]);
    await ctx.run("node", ["scripts/verify-no-hard-delete-faro-lines.mjs", "--selftest"]);
  },
};
