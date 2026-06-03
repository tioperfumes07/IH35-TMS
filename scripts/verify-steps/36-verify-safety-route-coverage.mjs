export default {
  name: "verify-safety-route-coverage",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:safety-route-coverage"]) !== 0) {
      process.exit(1);
    }
  },
};
