export default {
  name: "verify-driver-team-member-honest-label",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-team-member-honest-label.mjs"]);
    // BANK-F91143 piggy — USMCAActivation/TelematicsLinks/VendorLinkage slate leftover refuse
    await ctx.run("node", ["scripts/verify-91143-usmca-telematics-vendor-slate-leftover-chrome.mjs"]);
  },
};
