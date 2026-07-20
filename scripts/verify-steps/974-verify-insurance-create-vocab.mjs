export default {
  name: "verify:insurance-create-vocab",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-create-vocab.mjs"]);
  },
};
