// CUST-CHROME-03 / GUARD row 224 — ParityTable resize grip visible at rest (step 2008).
export default {
  name: "verify:parity-table-resize-at-rest-visible",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-parity-table-resize-at-rest-visible.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-parity-table-resize-at-rest-visible.mjs"]);
  },
};
