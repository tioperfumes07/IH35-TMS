export default {
  name: "verify-book-dispatch-sets-dispatched",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-book-dispatch-sets-dispatched.mjs"]);
    await ctx.run("node", ["scripts/verify-91191-dispatch-bol-pod-auth-slate-leftover-chrome.mjs"]);
  },
};
