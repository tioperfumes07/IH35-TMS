// ENG-43 (443.328 2026-10-25): open USMCA settlements with earnings lines must not have gross_pay=0.
// Shrink-only ratchet; ceiling 0 measured 2026-10-25 after repair-settlement-header-eng43.mjs --apply.
// CC-1 band (mod4=1), claimed 2026-10-25 as 18845.
export default {
  name: "verify-settlement-header-matches-lines",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-header-matches-lines.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlement-header-matches-lines.mjs"]);
  },
};
