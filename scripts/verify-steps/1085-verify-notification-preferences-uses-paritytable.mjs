export default {
  name: "verify:notification-preferences-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-notification-preferences-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-notification-preferences-uses-paritytable.mjs"]);
  },
};
