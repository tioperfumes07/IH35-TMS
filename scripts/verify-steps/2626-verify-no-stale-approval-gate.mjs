// verify-no-stale-approval-gate — the auto-loaded ih35-tms-standards skill told every agent at boot
// that "money-posting flags default OFF until CPA + Neon tie-out". Prod says the opposite (posting
// flags ON for TRANSP/TRK/USMCA; only QBO write-back OFF) and three other active law files already
// said there is no CPA gate. Companion to 2218 (affirmative approval HOLDS); this covers the CPA /
// flags-OFF half. Selftest runs first so a stale guard fails loudly instead of passing vacuously.
export default {
  name: "verify:no-stale-approval-gate",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-stale-approval-gate.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-stale-approval-gate.mjs"]);
  },
};
