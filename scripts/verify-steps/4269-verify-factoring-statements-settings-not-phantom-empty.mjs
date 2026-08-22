export default {
  name: "verify:factoring-statements-settings-not-phantom-empty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-statements-settings-not-phantom-empty.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-statements-settings-not-phantom-empty.mjs"]);
  },
};
