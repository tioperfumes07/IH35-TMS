export default {
  name: "verify-eld-foundation-coverage",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:eld-foundation-coverage"]) !== 0) {
      process.exit(1);
    }
  },
};
