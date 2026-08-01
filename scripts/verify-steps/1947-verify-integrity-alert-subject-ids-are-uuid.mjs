export default {
  name: "verify-integrity-alert-subject-ids-are-uuid",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-integrity-alert-subject-ids-are-uuid.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-integrity-alert-subject-ids-are-uuid.mjs"]);
  },
};
