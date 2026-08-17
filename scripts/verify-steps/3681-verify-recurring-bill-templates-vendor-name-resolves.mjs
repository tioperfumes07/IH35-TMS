export default {
  name: "verify:recurring-bill-templates-vendor-name-resolves",
  run(ctx) {
    ctx.run("node", ["scripts/verify-recurring-bill-templates-vendor-name-resolves.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-recurring-bill-templates-vendor-name-resolves.mjs"]);
  },
};
