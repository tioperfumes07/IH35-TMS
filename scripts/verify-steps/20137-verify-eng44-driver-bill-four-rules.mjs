/** CC-1 claim 20137 — ENG-44 combined four-rules guard + reinstate UI.
 *  Rules: (1) bill due date = load delivery, (2) salaried stray bill voided,
 *  (3) presettlement autolinks loads, (4) live_load_number not self-referential,
 *  (5) reinstate (un-void) UI wired.
 */
export default {
  name: "verify-eng44-driver-bill-four-rules",
  async run(ctx) {
    // Rule 1 — bill due date = load delivery (static selftest only; live requires DB)
    await ctx.run("node", ["scripts/verify-driver-bill-due-date-matches-delivery.mjs", "--selftest"]);
    // Rule 2 — salaried stray bill voided (via void-stray-practical UI + engine)
    await ctx.run("node", ["scripts/verify-void-stray-practical-ui-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-void-stray-practical-ui-wired.mjs"]);
    // Rule 3 — presettlement autolinks loads (static selftest only; live requires DB)
    await ctx.run("node", ["scripts/verify-presettlement-autolink-all-paths.mjs", "--selftest"]);
    // Rule 4 — live_load_number not self-referential (static)
    await ctx.run("node", ["scripts/verify-live-load-number-not-self-referential.mjs"]);
    // Rule 5 — reinstate (un-void) UI wired to POST .../reinstate
    await ctx.run("node", ["scripts/verify-reinstate-driver-bill-ui-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-reinstate-driver-bill-ui-wired.mjs"]);
  },
};
