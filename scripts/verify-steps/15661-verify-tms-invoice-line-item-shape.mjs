export default {
  name: "verify:tms-invoice-line-item-shape",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tms-invoice-line-item-shape.mjs"]);
  },
};
