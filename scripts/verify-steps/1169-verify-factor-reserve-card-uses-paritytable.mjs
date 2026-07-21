export default {
  name: "verify:factor-reserve-card-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factor-reserve-card-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factor-reserve-card-uses-paritytable.mjs"]);
  },
};
