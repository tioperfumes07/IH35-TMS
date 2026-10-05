export default {
  name: "verify:every-route-has-a-structural-breadcrumb",
  run(ctx) {
    ctx.run("node", ["scripts/verify-every-route-has-a-structural-breadcrumb.mjs"]);
  },
};
