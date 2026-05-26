export default {
  name: "verify-maintenance-reports-coverage",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:maintenance-reports-coverage"]) !== 0) {
      process.exit(1);
    }
  },
};
