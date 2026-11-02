export default {
  name: "verify-legal-matter-insurance-lawsuit-picker-create",
  async run(ctx) {
    // ENG-60: verify-legal-matter-insurance-lawsuit-picker-create retired with the picker (no insurance_lawsuit kind);
    // its successor is step 18917 verify-no-insurance-lawsuit-refs. This step keeps running the ELD guard it also owned.
    await ctx.run("node", ["scripts/verify-eld-liveduty-viol-slate-leftover-chrome.mjs"]);
  },
};
