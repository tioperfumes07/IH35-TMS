/**
 * ROUND 192 (Lead, 2026-09-25) — wires scripts/verify-fuel-expense-one-to-one.mjs into CI.
 * LANE_CROSS: docs/bus/09-25-2026-LEAD-RULING-R192-CC3-FUEL-ONE-TO-ONE-GUARD-LANE-CROSS.md.
 * Live guard — requires DATABASE_URL. EXPECTED RED today: fails naming exactly load 13586 and
 * expense 13546-2 (both named live in the guard's own header) until the Lead's AUTH-042
 * correction lands. Do not baseline those two away — the guard goes green on its own once
 * AUTH-042 runs.
 */
export default {
  name: "verify-fuel-expense-one-to-one",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-fuel-expense-one-to-one.mjs"]);
  },
};
