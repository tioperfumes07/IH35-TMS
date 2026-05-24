export default {
  name: "verify-collections-tenant-scope",
  run: async (ctx) => {
    if (ctx.run("node", ["scripts/verify-collections-tenant-scope.mjs"]) !== 0) {
      process.exit(1);
    }
  },
};
