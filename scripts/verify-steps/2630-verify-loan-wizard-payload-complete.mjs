// verify-loan-wizard-payload-complete — DoD-B for the Loans & Advances wizard: no rendered-but-unsent
// field. A control the operator fills in that never reaches the POST body creates a loan with a
// missing term (APR, payment count, funding source) and says nothing — a wrong balance and a wrong
// amortization schedule, silently. Cross-checks wizard controls -> buildPayload -> the backend
// createBodySchema in both directions. Selftest runs first so a stale parser fails loudly.
export default {
  name: "verify:loan-wizard-payload-complete",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-loan-wizard-payload-complete.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-loan-wizard-payload-complete.mjs"]);
  },
};
