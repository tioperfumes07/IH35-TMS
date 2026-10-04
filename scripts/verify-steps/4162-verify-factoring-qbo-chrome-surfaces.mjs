// verify-steps wrapper for scripts/verify-factoring-qbo-chrome-surfaces.mjs (orphan qbo_chrome guard from this session, wired
// into CI for the first time per INBOX-CC-3.md's Rule 17 orphan-wiring directive, verify-step 4162).
// Static, no DB — same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-factoring-qbo-chrome-surfaces",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-factoring-qbo-chrome-surfaces.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-factoring-qbo-chrome-surfaces.mjs"]);
    // BANK-F91457 — FT5 Factor Setup submission email + both reserve rates (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-factoring-ft5-setup-email-rates.mjs", "--selftest"]);
  },
};
