export default {
  name: "verify:maint-pm-auto-engine-action-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-pm-auto-engine-action-lifecycle.mjs"]);
  },
};
