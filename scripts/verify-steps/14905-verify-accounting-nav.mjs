export default {
  name: "verify:accounting-nav",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-nav.mjs"]);
    ctx.run("node", ["scripts/verify-accounting-board1-census.mjs"]);
  },
};
