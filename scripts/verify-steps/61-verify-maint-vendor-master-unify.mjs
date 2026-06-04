export default {
  name: "verify-maint-vendor-master-unify",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:maint-vendor-master-unify"]) !== 0) {
      throw new Error("verify:maint-vendor-master-unify failed");
    }
  },
};
