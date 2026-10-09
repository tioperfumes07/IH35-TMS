/** LV-SYSTEM-MATRIX-LEAVES-NOT-ITERABLE — EVEN Cursor claim 3720 */
export default {
  name: "verify-program-matrix-system-querykey-disambiguate",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-program-matrix-system-querykey-disambiguate.mjs"]);
    await ctx.run("node", ["scripts/verify-91107-drvmap-drvsafety-finepay-slate-leftover-chrome.mjs"]);
  },
};
