export default {
  name: "verify-dispatch-load-detail-deliver-transition",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-dispatch-load-detail-deliver-transition.mjs"]);
  },
};
