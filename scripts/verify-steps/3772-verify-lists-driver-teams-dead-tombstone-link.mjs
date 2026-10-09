export default {
  name: "verify-lists-driver-teams-dead-tombstone-link",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-lists-driver-teams-dead-tombstone-link.mjs"]);
    await ctx.run("node", ["scripts/verify-91084-monthclose-moneyproof-writecheck-slate-leftover-chrome.mjs"]);
  },
};
