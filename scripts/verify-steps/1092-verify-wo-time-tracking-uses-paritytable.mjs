export default {
  name: "verify:wo-time-tracking-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-time-tracking-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-wo-time-tracking-uses-paritytable.mjs"]);
  },
};
