export default {
  name: "verify:qbo-parity-name-plus-type-option-labels",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-parity-name-plus-type-option-labels.mjs"]);
  },
};
