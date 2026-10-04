export default {
  name: "verify:property-tax-rendition-id-param-validated",
  run(ctx) {
    ctx.run("node", ["scripts/verify-property-tax-rendition-id-param-validated.mjs"]);
  },
};
