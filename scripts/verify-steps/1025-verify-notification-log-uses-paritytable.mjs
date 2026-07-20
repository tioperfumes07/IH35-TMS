export default {
  name: "verify:notification-log-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-notification-log-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-notification-log-uses-paritytable.mjs"]);
  },
};
