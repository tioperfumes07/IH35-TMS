export default {
  name: "verify-outbox-canonical-table",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-outbox-canonical-table.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-outbox-canonical-table.mjs"]);
    await ctx.run("node", ["scripts/verify-dispatch-assignment-notice-durability.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-dispatch-assignment-notice-durability.mjs"]);
  },
};
