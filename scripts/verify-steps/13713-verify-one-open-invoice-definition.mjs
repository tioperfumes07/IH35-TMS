export default {
  name: "verify:one-open-invoice-definition",
  run(ctx) {
    ctx.run("node", ["scripts/verify-one-open-invoice-definition.mjs"]);
  },
};
