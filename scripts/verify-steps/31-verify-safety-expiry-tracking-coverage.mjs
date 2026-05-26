export default {
  name: "verify-safety-expiry-tracking-coverage",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:safety-expiry-tracking-coverage"]) !== 0) {
      process.exit(1);
    }
  },
};
