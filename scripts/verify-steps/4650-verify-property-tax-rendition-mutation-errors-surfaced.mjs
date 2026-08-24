export default {
  name: "verify-property-tax-rendition-mutation-errors-surfaced",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-property-tax-rendition-mutation-errors-surfaced.mjs"]) !== 0) {
      throw new Error("verify-property-tax-rendition-mutation-errors-surfaced failed");
    }
  },
};
