export default {
  name: "verify:accounting-money-creator-matrix",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-money-creator-matrix.mjs"]);
  },
};
