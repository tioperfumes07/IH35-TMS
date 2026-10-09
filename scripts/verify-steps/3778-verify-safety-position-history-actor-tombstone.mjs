export default {
  name: "verify-safety-position-history-actor-tombstone",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-safety-position-history-actor-tombstone.mjs"]);
    await ctx.run("node", ["scripts/verify-91081-settdeduct-cfpage-createadv-slate-leftover-chrome.mjs"]);
  },
};
