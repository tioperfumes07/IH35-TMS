export default {
  name: "verify-safety-rls-coverage",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:safety-rls-coverage"]) !== 0) {
      process.exit(1);
    }
  },
};
