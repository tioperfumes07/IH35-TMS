export default {
  name: "verify:money-table-cells-aligned",
  run(ctx) {
    ctx.run("node", ["scripts/verify-money-table-cells-aligned.mjs"]);
  },
};
