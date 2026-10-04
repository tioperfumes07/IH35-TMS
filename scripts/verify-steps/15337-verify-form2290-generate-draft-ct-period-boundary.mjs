export default {
  name: "verify:form2290-generate-draft-ct-period-boundary",
  run(ctx) {
    ctx.run("node", ["scripts/verify-form2290-generate-draft-ct-period-boundary.mjs"]);
  },
};
