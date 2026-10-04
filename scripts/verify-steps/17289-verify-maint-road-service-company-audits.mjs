export default {
  name: "verify:maint-road-service-company-audits",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-road-service-company-audits.mjs"]);
  },
};
