export default {
  name: "verify-maintenance-routes-bootstrapped",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:maintenance-routes-bootstrapped"]) !== 0) {
      process.exit(1);
    }
  },
};
