export default {
  name: "verify-load-reassign-driver-exists",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-load-reassign-driver-exists.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-load-reassign-driver-exists.mjs"]);
    await ctx.run("node", ["scripts/verify-91170-acct-alloc-slate-leftover-chrome.mjs"]);
  },
};
