export default {
  name: "verify-legal-matter-timeline-note-creator",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-legal-matter-timeline-note-creator.mjs"]);
    await ctx.run("node", ["scripts/verify-91068-accttype-voidcancel-cardoverage-slate-leftover-chrome.mjs"]);
  },
};
