// SAF-F15 — Company Violation catalog type required (verify-step 2042).
export default {
  name: "safety-company-violation-catalog-required",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-safety-company-violation-catalog-required.mjs"]);
  },
};
