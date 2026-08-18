export default {
  name: "verify-account-register-ref-no-journal-entry-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-account-register-ref-no-journal-entry-link.mjs"]);
  },
};
