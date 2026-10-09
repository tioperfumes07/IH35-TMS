export default {
  name: "verify-customer-picker-canonical-labels",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-customer-picker-canonical-labels.mjs"]);
    // BANK-F91146 piggy — UploadModal/CustomsTab/DispatchAlertServerControls slate leftover refuse
    await ctx.run("node", ["scripts/verify-91146-upload-customs-alert-slate-leftover-chrome.mjs"]);
  },
};
