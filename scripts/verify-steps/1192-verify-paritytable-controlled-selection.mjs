export default {
  name: "verify:paritytable-controlled-selection",
  run(ctx) {
    ctx.run("node", ["scripts/verify-paritytable-controlled-selection.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-paritytable-controlled-selection.mjs"]);
  },
};
