export default {
  name: "verify:insurance-type-catalog-create-vocab",
  run(ctx) {
    ctx.run("node", ["scripts/verify-insurance-type-catalog-create-vocab.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-insurance-type-catalog-create-vocab.mjs"]);
  },
};
