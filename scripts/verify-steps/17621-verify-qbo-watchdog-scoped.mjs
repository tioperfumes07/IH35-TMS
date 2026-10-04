export default {
  name: "verify:qbo-watchdog-scoped",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-watchdog-scoped.mjs"]);
  },
};
