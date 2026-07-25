// 1503-verify-acct-link-02-accounts-detail-type-fk — LINK-02 (owner WIRE 2026-07-25).
// Wired ONLY here (Rule 17). No package.json / locked-guards.yml edits.
export default {
  name: "verify-acct-link-02-accounts-detail-type-fk",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-link-02-accounts-detail-type-fk.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-acct-link-02-accounts-detail-type-fk.mjs"]);
  },
};
