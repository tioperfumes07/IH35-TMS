export default {
  name: "verify:event-log-worm",
  run(ctx) {
    ctx.run("node", ["scripts/verify-event-log-worm.mjs"]);
  },
};
