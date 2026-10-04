export default {
  name: "verify:qbo-parity-bills-invoices-lists",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-parity-bills-invoices-lists.mjs"]);
  },
};
