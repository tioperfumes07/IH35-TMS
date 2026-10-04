export default {
  name: "verify-banking-recon-zero-variance",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-recon-zero-variance.mjs"]);
    // BANK-F91437 — C-53 recon shell (A-27 pending + $0.00 finish) ops pack (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-c53-recon-screen-shell.mjs", "--selftest"]);
  },
};
