export default {
  name: "verify:qbo-parity-vendors",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-parity-vendors.mjs"]);
  },
};
