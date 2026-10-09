export default {
  name: "verify-owner-all-entities-non-qbo-flags-on",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-owner-all-entities-non-qbo-flags-on.mjs"]);
    await ctx.run("node", ["scripts/verify-91113-fuelcreate-exempt-savings-slate-leftover-chrome.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-91113-fuelcreate-exempt-savings-slate-leftover-chrome.mjs"]);
  },
};
