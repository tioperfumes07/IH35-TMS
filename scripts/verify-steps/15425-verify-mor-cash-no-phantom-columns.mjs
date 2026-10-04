export default {
  name: "verify:mor-cash-no-phantom-columns",
  run(ctx) {
    ctx.run("node", ["scripts/verify-mor-cash-no-phantom-columns.mjs"]);
  },
};
