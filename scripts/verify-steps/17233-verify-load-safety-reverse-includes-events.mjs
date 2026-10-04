export default {
  name: "verify:load-safety-reverse-includes-events",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-safety-reverse-includes-events.mjs"]);
  },
};
