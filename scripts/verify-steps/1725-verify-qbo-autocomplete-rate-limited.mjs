// Step 1725 — the QBO autocomplete routes must stay rate-limited.
// CodeQL high-severity finding on PR #3732: four authenticated typed-ahead endpoints ran a ranked
// full-text scan per keystroke with no limit — a DoS and master-data enumeration surface.
export default {
  name: "verify:qbo-autocomplete-rate-limited",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-qbo-autocomplete-rate-limited.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-qbo-autocomplete-rate-limited.mjs"]);
  },
};
