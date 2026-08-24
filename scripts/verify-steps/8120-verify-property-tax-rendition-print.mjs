export default {
  name: "verify-property-tax-rendition-print",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-property-tax-rendition-print.mjs"]) !== 0) {
      throw new Error("verify-property-tax-rendition-print failed");
    }
  },
};
