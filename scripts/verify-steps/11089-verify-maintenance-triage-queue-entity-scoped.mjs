export default {
  name: "verify-maintenance-triage-queue-entity-scoped",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-maintenance-triage-queue-entity-scoped.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-maintenance-triage-queue-entity-scoped.mjs"]);
  },
};
