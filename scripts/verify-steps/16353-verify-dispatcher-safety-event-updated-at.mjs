export default {
  name: "verify:dispatcher-safety-event-updated-at",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatcher-safety-event-updated-at.mjs"]);
  },
};
