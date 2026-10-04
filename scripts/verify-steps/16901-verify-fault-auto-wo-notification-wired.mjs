export default {
  name: "verify:fault-auto-wo-notification-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fault-auto-wo-notification-wired.mjs"]);
  },
};
