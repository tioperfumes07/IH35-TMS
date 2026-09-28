/**
 * Owner ruling 2026-09-28: the delivery date IS the projected income date. The receivable lag is
 * zero. Supersedes the 2026-06-17 "lag is never zero" rule that shifted every factored load one
 * day forward and emptied the owner's cash-flow screen for the current day.
 * Verify-step 11585, Lead band.
 */
export default {
  name: "verify-projected-cash-date-equals-delivery",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-projected-cash-date-equals-delivery.mjs"]);
  },
};
