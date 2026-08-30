/** WONUM D2 -- refresh_wo_display_id locks V5 on first non-PEND0 set + loses the UUID fallback. */
export default {
  name: "verify-wonum-d2-v5-lock-and-refresh-fix",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wonum-d2-v5-lock-and-refresh-fix.mjs"]);
    await ctx.run("node", ["scripts/verify-wonum-d2-v5-lock-and-refresh-fix.mjs", "--selftest"]);
  },
};
