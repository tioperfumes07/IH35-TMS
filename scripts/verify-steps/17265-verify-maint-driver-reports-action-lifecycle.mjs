export default {
  name: "verify:maint-driver-reports-action-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-driver-reports-action-lifecycle.mjs"]);
  },
};
