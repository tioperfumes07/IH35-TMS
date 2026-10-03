export default {
  name: "verify:banking-home-preview-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-home-preview-parity.mjs"]);
  },
};
