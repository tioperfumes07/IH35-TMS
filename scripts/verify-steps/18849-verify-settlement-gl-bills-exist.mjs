// ENG-46 (443.328 2026-10-25): USMCA non-salaried closed settlements must have
// at least one driver_settlement_gl_bills entry with a valid accounting_bill_id.
// Salaried (no_net_pay, weekly_salary) are exempt.
// Shrink-only ratchet; ceiling 0 measured 2026-10-25.
// CC-1 band (mod4=1), claimed 2026-10-25 as 18849.
export default {
  name: "verify-settlement-gl-bills-exist",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-settlement-gl-bills-exist.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-settlement-gl-bills-exist.mjs"]);
  },
};
