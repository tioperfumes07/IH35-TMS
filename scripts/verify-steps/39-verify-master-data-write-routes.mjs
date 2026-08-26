export default {
  name: "verify-master-data-write-routes",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:master-data-write-routes"]) !== 0) {
      process.exit(1);
    }
    if (ctx.run("node", ["scripts/verify-maint-master-data-company-lifecycle.mjs"]) !== 0) {
      process.exit(1);
    }
  },
};
