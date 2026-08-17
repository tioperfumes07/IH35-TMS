export default {
  name: "verify-legal-matter-timeline-note-creator",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-legal-matter-timeline-note-creator.mjs"]);
  },
};
