export default {
  name: "verify:ar-aging-proforma-exclusion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ar-aging-proforma-exclusion.mjs"]);
  },
};
