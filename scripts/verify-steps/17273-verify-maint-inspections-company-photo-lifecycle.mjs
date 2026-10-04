export default {
  name: "verify:maint-inspections-company-photo-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maint-inspections-company-photo-lifecycle.mjs"]);
  },
};
