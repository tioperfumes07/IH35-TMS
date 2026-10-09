export default {
  name: "verify-lists-names-master-dead-tombstone-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-names-master-dead-tombstone-link.mjs"]);
    await ctx.run("node", ["scripts/verify-91083-reconmatch-catrules-cashgl-slate-leftover-chrome.mjs"]);
  },
};
