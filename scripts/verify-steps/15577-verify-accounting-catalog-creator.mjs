export default {
  name: "verify:accounting-catalog-creator",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-catalog-creator.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-accounting-catalog-creator.mjs"]);
  },
};
