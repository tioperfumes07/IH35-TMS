export default {
  name: "verify:csa-mitigation-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-csa-mitigation-company-lifecycle.mjs"]);
  },
};
