export default {
  name: "verify-related-party-loan-advance-note-document",
  async run(ctx) {
    await ctx.run("node", [
      "scripts/verify-related-party-loan-advance-note-document.mjs",
      "--selftest",
    ]);
    await ctx.run("node", ["scripts/verify-related-party-loan-advance-note-document.mjs"]);
  },
};
