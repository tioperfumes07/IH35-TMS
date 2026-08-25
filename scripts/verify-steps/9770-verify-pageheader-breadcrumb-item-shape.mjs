export default {
  name: "verify-pageheader-breadcrumb-item-shape",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-pageheader-breadcrumb-item-shape.mjs"]) !== 0) {
      throw new Error("verify-pageheader-breadcrumb-item-shape failed");
    }
  },
};
