export default {
  name: "verify-dispatch-assignment-history-tombstone",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-assignment-history-tombstone.mjs"]);
    await ctx.run("node", ["scripts/verify-91080-inttx-faroreserve-cfstmt-slate-leftover-chrome.mjs"]);
  },
};
