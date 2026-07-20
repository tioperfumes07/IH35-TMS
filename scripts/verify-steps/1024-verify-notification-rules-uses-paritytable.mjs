export default {
  name: "verify:notification-rules-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-notification-rules-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-notification-rules-uses-paritytable.mjs"]);
  },
};
