// SAF-FINE-CATALOG — External Fine civil_fine_types catalog required (verify-step 2050).
export default {
  name: "safety-fine-civil-catalog-required",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-safety-fine-civil-catalog-required.mjs"]);
  },
};
