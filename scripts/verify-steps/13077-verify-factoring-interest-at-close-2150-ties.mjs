export default {
  name: "verify:factoring-interest-at-close-2150-ties",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-interest-at-close-2150-ties.mjs"]);
  },
};
