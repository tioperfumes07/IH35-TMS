export default {
  name: "verify:qbo-invoices-mirror-shape",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-invoices-mirror-shape.mjs"]);
  },
};
