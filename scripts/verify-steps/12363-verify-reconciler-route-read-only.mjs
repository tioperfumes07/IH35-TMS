export default {
  name: "verify:reconciler-route-read-only",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reconciler-route-read-only.mjs"]);
  },
};
