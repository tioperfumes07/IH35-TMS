// ENG-09 (443.322): THE GUARANTEE — every engine surface the master engine register
// declares closed-by-guard has its guard file on disk and is wired into CI.
// CC-1 band (mod4=1), claimed 2026-10-25.
export default {
  name: "verify-engine-register-closed-by-guard",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-engine-register-closed-by-guard.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-engine-register-closed-by-guard.mjs"]);
  },
};
