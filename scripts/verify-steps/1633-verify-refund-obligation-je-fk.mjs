/** INS-03 — refund_obligation.journal_entry_id FK to accounting.journal_entries. */
export default {
  name: "verify-refund-obligation-je-fk",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-refund-obligation-je-fk.mjs"]);
    await ctx.run("node", ["scripts/verify-refund-obligation-je-fk.mjs", "--selftest"]);
  },
};
