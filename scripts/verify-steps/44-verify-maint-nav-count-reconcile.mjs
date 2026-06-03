export default {
  name: "verify-maint-nav-count-reconcile",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:maint-nav-count-reconcile"]) !== 0) {
      process.exit(1);
    }
  },
};
