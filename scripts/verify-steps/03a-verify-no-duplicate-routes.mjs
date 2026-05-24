export default {
  name: "verify-no-duplicate-routes",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:no-duplicate-routes"]) !== 0) {
      process.exit(1);
    }
  },
};
