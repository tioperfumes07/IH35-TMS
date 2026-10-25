// Cash Flow 7-Day Outlook — flat section chrome, no nested tiles (verify-step 2022, Cursor EVEN band).
// ROUND 443.280-A #8 — also runs Projected board ratchet (D042/D073/one-engine) in the same CI step.
export default {
  name: "cashflow-outlook-no-box-in-box",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-cashflow-outlook-no-box-in-box.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cashflow-outlook-no-box-in-box.mjs"]);
    await ctx.run("node", ["scripts/verify-cash-flow-projected-tab.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-cash-flow-projected-tab.mjs"]);
  },
};
