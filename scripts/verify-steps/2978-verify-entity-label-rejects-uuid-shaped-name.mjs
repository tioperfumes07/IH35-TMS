export default {
  name: "verify-entity-label-rejects-uuid-shaped-name",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-entity-label-rejects-uuid-shaped-name.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-entity-label-rejects-uuid-shaped-name.mjs"]);
    await ctx.run("node", ["scripts/verify-insurance-policy-type-human-label.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-insurance-policy-type-human-label.mjs"]);
  },
};
