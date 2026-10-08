export default {
  name: "verify:driver-termination-reasons-per-entity",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-driver-termination-reasons-per-entity.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-driver-termination-reasons-per-entity.mjs"]);
    // BANK-F91204 piggyback — LoadExceptionReasons / TerminationReasons / DomainFlyout leftover slate refuse
    await ctx.run("node", ["scripts/verify-lists-exc-term-slate-leftover-chrome.mjs"]);
  },
};
