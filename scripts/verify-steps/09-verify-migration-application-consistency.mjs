export default {
  name: "verify-migration-application-consistency",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:migration-application-consistency"]) !== 0) {
      process.exit(1);
    }
  },
};
