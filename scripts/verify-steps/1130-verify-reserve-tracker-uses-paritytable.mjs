export default {
  name: "verify:reserve-tracker-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reserve-tracker-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reserve-tracker-uses-paritytable.mjs"]);
  },
};
