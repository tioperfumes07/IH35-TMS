export default {
  name: "verify:balances-render-in-natural-sign",
  run(ctx) {
    ctx.run("node", ["scripts/verify-balances-render-in-natural-sign.mjs"]);
  },
};
