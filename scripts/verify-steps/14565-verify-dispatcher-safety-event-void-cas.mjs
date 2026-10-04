export default {
  name: "verify:dispatcher-safety-event-void-cas",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatcher-safety-event-void-cas.mjs"]);
  },
};
