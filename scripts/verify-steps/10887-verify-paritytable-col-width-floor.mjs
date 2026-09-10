export default {
  name: "verify:paritytable-col-width-floor",
  run(ctx) {
    ctx.run("node", ["scripts/verify-paritytable-col-width-floor.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-paritytable-col-width-floor.mjs"]);
  },
};
