export default {
  name: "verify-maint-pm",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:maint-pm"]) !== 0) {
      process.exit(1);
    }
  },
};
