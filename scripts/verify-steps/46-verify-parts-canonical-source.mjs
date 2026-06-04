export default {
  name: "verify-parts-canonical-source",
  run: async (ctx) => {
    if (ctx.run("npm", ["run", "verify:parts-canonical-source"]) !== 0) {
      process.exit(1);
    }
  },
};
