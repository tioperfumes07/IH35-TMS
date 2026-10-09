export default {
  name: "verify-docs-soft-delete-recoverable-copy",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-docs-soft-delete-recoverable-copy.mjs"]);
    await ctx.run("node", ["scripts/verify-91089-factrecourse-purchlinks-interest-slate-leftover-chrome.mjs"]);
  },
};
