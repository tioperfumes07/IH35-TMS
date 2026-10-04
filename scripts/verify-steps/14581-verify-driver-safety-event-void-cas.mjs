export default {
  name: "verify:driver-safety-event-void-cas",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-safety-event-void-cas.mjs"]);
  },
};
