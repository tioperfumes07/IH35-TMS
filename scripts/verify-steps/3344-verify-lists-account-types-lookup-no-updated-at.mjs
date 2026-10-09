export default {
  name: "verify-lists-account-types-lookup-no-updated-at",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-account-types-lookup-no-updated-at.mjs"]);
    // BANK-F91149 piggy — UnitDriverHistory/UnitDetail/TasksModuleTabs slate leftover refuse
    await ctx.run("node", ["scripts/verify-91149-unit-tasks-slate-leftover-chrome.mjs"]);
  },
};
