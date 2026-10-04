export default {
  name: "verify:dispatch-live-gps-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-live-gps-wired.mjs"]);
  },
};
