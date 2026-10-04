export default {
  name: "verify:tms-bill-line-item-shape",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tms-bill-line-item-shape.mjs"]);
  },
};
