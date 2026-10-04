export default {
  name: "verify:factoring-package-popup-block-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-package-popup-block-honesty.mjs"]);
  },
};
