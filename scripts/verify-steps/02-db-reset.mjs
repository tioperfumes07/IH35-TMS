export default {
  name: "db-reset",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:db:reset"]) !== 0) {
      process.exit(1);
    }
  },
};
