export default {
  name: "verify-content-drift-check",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:content-drift-check"]) !== 0) {
      process.exit(1);
    }
  },
};
