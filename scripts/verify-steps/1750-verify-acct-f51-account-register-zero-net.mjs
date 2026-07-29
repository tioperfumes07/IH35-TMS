// Step 1750 — ACCT-F51: Account Register must render an honest $0 register for a zero-net (wash)
// account instead of 404/crash. Companion to ACCT-SURF-07 (step 1462) + ACCT-R-44 blank-page precedent.
// Rule 17: wire ONLY via verify-steps — do not edit package.json / locked-guards / ci.yml.
export default {
  name: "verify-acct-f51-account-register-zero-net",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-f51-account-register-zero-net.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-f51-account-register-zero-net.mjs"]);
  },
};
