export default {
  name: "verify-lists-brokers-dead-tombstone-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-brokers-dead-tombstone-link.mjs"]);
    await ctx.run("node", ["scripts/verify-91082-manualje-bankrpt-attachnotes-slate-leftover-chrome.mjs"]);
  },
};
