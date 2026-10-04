export default {
  name: "verify:dtc-auto-wo-tenant-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dtc-auto-wo-tenant-scope.mjs"]);
  },
};
