export default {
  name: "verify:tenant-scope-on-routes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tenant-scope-on-routes.mjs"]);
  },
};
