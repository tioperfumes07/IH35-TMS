export default {
  name: "verify-accounting-autoload-coverage",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:accounting-autoload-coverage"]) !== 0) {
      process.exit(1);
    }
  },
};
