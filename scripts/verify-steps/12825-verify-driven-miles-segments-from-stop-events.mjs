export default {
  name: "verify:driven-miles-segments-from-stop-events",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driven-miles-segments-from-stop-events.mjs"]);
  },
};
