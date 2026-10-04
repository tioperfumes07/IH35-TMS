export default {
  name: "verify:accounting-route-map",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-route-map.mjs"]);
  },
};
