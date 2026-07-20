// 0441-mod11-deadhead-phantom-fuel-columns — real fuel columns + no silent catch.
export default {
  name: "deadhead-fuel-columns-real",
  run(ctx) {
    ctx.run("node", ["scripts/verify-deadhead-fuel-columns-real.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-deadhead-fuel-columns-real.mjs"]);
  },
};
