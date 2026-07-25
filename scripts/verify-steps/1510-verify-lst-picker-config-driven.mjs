// 1510-verify-lst-picker-config-driven — LST-PICKER-01/03.
//
// The shared picker capability must stay CONFIG-DRIVEN (adding a catalog is a config entry, never a
// new component), and every wired catalog's inline-create target table must equal its read table
// (VERIFY-2 clause 5). Run against pre-fix origin/main this FAILS on the hardcoded INLINE_KINDS Set.
//
// The --selftest runs first and mutates 14 ways the contract can break, so the assertions are proven
// capable of failing before the real tree is judged.
export default {
  name: "verify-lst-picker-config-driven",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lst-picker-config-driven.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-lst-picker-config-driven.mjs"]);
  },
};
