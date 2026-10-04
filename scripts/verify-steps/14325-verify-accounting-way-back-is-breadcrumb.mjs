export default {
  name: "verify:accounting-way-back-is-breadcrumb",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-way-back-is-breadcrumb.mjs"]);
  },
};
