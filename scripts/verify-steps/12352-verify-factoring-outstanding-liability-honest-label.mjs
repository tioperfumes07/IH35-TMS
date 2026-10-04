export default {
  name: "verify:factoring-outstanding-liability-honest-label",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-outstanding-liability-honest-label.mjs"]);
  },
};
