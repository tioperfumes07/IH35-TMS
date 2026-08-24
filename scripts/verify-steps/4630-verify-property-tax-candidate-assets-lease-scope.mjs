export default {
  name: "verify-property-tax-candidate-assets-lease-scope",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-property-tax-candidate-assets-lease-scope.mjs"]) !== 0) {
      throw new Error("verify-property-tax-candidate-assets-lease-scope failed");
    }
  },
};
