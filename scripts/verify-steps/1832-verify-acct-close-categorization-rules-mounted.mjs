// Step 1832 — ACCT close: mount categorization-rules + DISP-01 escrow trigger text-cast.
// Rule 17: verify-steps ONLY — never edit package.json / ci.yml / locked-guards.
export default {
  name: "verify-acct-close-categorization-rules-mounted",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-close-categorization-rules-mounted.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-close-categorization-rules-mounted.mjs"]);
  },
};
