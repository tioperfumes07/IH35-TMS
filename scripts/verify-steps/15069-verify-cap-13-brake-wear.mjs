export default {
  name: "verify:cap-13-brake-wear",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cap-13-brake-wear.mjs"]);
  },
};
