export default {
  name: "verify:settlement-source-ref-only-key",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-source-ref-only-key.mjs"]);
  },
};
