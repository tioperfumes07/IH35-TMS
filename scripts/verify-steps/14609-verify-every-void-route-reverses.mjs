export default {
  name: "verify:every-void-route-reverses",
  run(ctx) {
    ctx.run("node", ["scripts/verify-every-void-route-reverses.mjs"]);
  },
};
