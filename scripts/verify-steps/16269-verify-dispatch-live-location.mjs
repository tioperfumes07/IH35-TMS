export default {
  name: "verify:dispatch-live-location",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-live-location.mjs"]);
  },
};
