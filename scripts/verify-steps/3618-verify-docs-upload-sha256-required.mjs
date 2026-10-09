// verify-steps wrapper — LV-DOCS-FILES-NOT-HASHED · claim 3618
export default {
  name: "verify-docs-upload-sha256-required",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-docs-upload-sha256-required.mjs"]);
    await ctx.run("node", ["scripts/verify-91110-venddet-defect-warranty-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-91110-venddet-defect-warranty-slate-leftover-chrome.mjs"]);
  },
};
