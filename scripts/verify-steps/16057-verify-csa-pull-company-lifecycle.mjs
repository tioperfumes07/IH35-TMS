export default {
  name: "verify:csa-pull-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-csa-pull-company-lifecycle.mjs"]);
  },
};
