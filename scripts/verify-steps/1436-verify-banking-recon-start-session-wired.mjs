export default {
  name: "verify-banking-recon-start-session-wired",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-banking-recon-start-session-wired.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-banking-recon-start-session-wired.mjs"]);
    // BANK-F91433 — ORDERS §B-2 recon report reopen + JE-line reconcilable ops pack (never ran in CI).
    await ctx.run("node", ["scripts/ops/verify-b2-reconcile-shell.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/ops/verify-b2-je-line-reconcilable.mjs", "--selftest"]);
  },
};
