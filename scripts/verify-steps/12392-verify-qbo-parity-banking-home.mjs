export default {
  name: "verify:qbo-parity-banking-home",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-parity-banking-home.mjs"]);
  },
};
