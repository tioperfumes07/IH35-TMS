// verify-no-patch-or-defer-language — OWNER LAW 2026-08-07 (Jorge, verbatim in chat):
// "WE NEVER GUESS. WE NEVER DEFER. WE ALWAYS VERIFY. WE ALWAYS FIX, NOT PATCH. WE WANT PERMANENT FIXES
// ALWAYS." Canonical text: docs/law/NEVER-GUESS-NEVER-DEFER-ALWAYS-VERIFY-ALWAYS-FIX.md
//
// Registered `enforced` in docs/law/LAW.json, per LAW-2026-08-05-B2 ("LAW = ENFORCED GUARD, OR IT IS NOT
// LAW"). Writing the owner's rule as prose alone would itself have been a patch — so it ships with this.
//
// Selftest runs FIRST so a broken matcher can never pass the repo scan vacuously.
export default {
  name: "verify:no-patch-or-defer-language",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-patch-or-defer-language.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-patch-or-defer-language.mjs"]);
  },
};
