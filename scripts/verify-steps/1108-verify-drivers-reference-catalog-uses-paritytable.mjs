export default {
  name: "verify:drivers-reference-catalog-uses-paritytable",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-drivers-reference-catalog-uses-paritytable.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-drivers-reference-catalog-uses-paritytable.mjs"]);
    // BANK-F91202 piggyback — UploadZone / SafetyAlerts / DriverManagerAttention leftover slate refuse
    await ctx.run("node", ["scripts/verify-upload-alerts-attn-slate-leftover-chrome.mjs"]);
  },
};
