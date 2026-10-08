// CLS-BOX-IN-BOX + CLS-RAW-UUID-LABEL — LaborTracker flatten (verify-step 2316 · Cursor EVEN band).
export default {
  name: "maint-labor-tracker-no-box-in-box",
  async run(ctx) {
    if ((await ctx.run("node", ["scripts/verify-maint-labor-tracker-no-box-in-box.mjs"])) !== 0) return 1;
    await ctx.run("node", ["scripts/verify-maint-labor-action-company-lifecycle.mjs"]);
    // BANK leftover slate refuse piggyback (F91198)
    await ctx.run("node", ["scripts/verify-bgcheck-drvsafe-labor-slate-leftover-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bgcheck-drvsafe-labor-slate-leftover-chrome.mjs"]);
  },
};
