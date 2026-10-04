export default {
  name: "verify:aggregate-shape-route",
  run(ctx) {
    ctx.run("node", ["scripts/verify-aggregate-shape-route.mjs"]);
  },
};
