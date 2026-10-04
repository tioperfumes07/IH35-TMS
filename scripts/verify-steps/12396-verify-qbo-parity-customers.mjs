export default {
  name: "verify:qbo-parity-customers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-parity-customers.mjs"]);
  },
};
