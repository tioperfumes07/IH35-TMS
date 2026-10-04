export default {
  name: "verify:maint-pm-schedule-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-pm-schedule-company-lifecycle.mjs"]);
  },
};
