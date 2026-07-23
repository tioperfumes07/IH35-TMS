export default {
  name: "verify-acct-bill-void-ui",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-acct-bill-void-ui.mjs"]);
  },
};
