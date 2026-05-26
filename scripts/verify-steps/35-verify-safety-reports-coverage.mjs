export default {
  name: "verify-safety-reports-coverage",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:safety-reports-coverage"]) !== 0) {
      process.exit(1);
    }
  },
};
